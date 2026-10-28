import { createClient } from "@supabase/supabase-js";

import type { components } from "./api-types";

export type ProfileStorageMode = "local" | "supabase" | "unavailable";

export type CandidateProfile = components["schemas"]["CandidateProfile"];

export interface ProfileRepository {
  readonly mode: ProfileStorageMode;
  loadAll(): Promise<CandidateProfile[]>;
  save(profile: CandidateProfile): Promise<CandidateProfile>;
  delete(profileId: string): Promise<void>;
  signIn?(email: string, password: string): Promise<CandidateProfile[]>;
  signUp?(email: string, password: string): Promise<{
    authenticated: boolean;
    profiles: CandidateProfile[];
  }>;
  signOut?(): Promise<void>;
}

export type ProfileValidator = (value: unknown) => Promise<CandidateProfile>;

const LOCAL_STORAGE_KEY = "radix-talent-match:profiles:v1";
const SUPABASE_TABLE = "rtm_candidate_profiles";

function createConfiguredSupabaseClient(url: string, publishableKey: string) {
  return createClient(url, publishableKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
}

let sharedSupabaseClient: {
  url: string;
  publishableKey: string;
  client: ReturnType<typeof createConfiguredSupabaseClient>;
} | null = null;

function getSupabaseClient(url: string, publishableKey: string) {
  if (
    !sharedSupabaseClient ||
    sharedSupabaseClient.url !== url ||
    sharedSupabaseClient.publishableKey !== publishableKey
  ) {
    sharedSupabaseClient = {
      url,
      publishableKey,
      client: createConfiguredSupabaseClient(url, publishableKey),
    };
  }
  return sharedSupabaseClient.client;
}

export class ProfileAuthenticationRequiredError extends Error {
  constructor() {
    super("Sign in to a Supabase account or create one to access cloud profiles.");
    this.name = "ProfileAuthenticationRequiredError";
  }
}

type SupabaseProfileRow = {
  profile_id: string;
  owner_id: string;
  profile: unknown;
  created_at: string;
  updated_at: string;
};

function requiredProfileId(profile: CandidateProfile): string {
  if (!profile.profile_id) {
    throw new Error("The validated profile is missing its profile ID.");
  }
  return profile.profile_id;
}

function withSaveTimestamps(profile: CandidateProfile): Record<string, unknown> {
  const now = new Date().toISOString();
  const profileId = profile.profile_id ?? crypto.randomUUID();

  return {
    ...profile,
    profile_id: profileId,
    created_at: profile.created_at ?? now,
    updated_at: now,
  };
}

function getLocalStorage(): Storage {
  try {
    return window.localStorage;
  } catch {
    throw new Error(
      "Browser profile storage is unavailable. Enable local storage or configure Supabase to save profiles.",
    );
  }
}

function readLocalRecords(): unknown[] {
  const storage = getLocalStorage();
  let raw: string | null;
  try {
    raw = storage.getItem(LOCAL_STORAGE_KEY);
  } catch {
    throw new Error(
      "Saved profiles could not be read from browser storage. The stored data was left untouched.",
    );
  }
  if (raw === null) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error(
      "Saved profile data is malformed. It was left untouched; export or repair the browser storage value before saving again.",
    );
  }
  if (!Array.isArray(parsed)) {
    throw new Error(
      "Saved profile data has an unsupported shape. It was left untouched; export or repair the browser storage value before saving again.",
    );
  }
  return parsed as unknown[];
}

function createLocalRepository(validate: ProfileValidator): ProfileRepository {
  return {
    mode: "local",

    async loadAll() {
      const records = readLocalRecords();
      return Promise.all(records.map((record) => validate(record)));
    },

    async save(profile) {
      const validated = await validate(withSaveTimestamps(profile));
      const profileId = requiredProfileId(validated);
      const records = await Promise.all(readLocalRecords().map((record) => validate(record)));
      const nextRecords = [
        ...records.filter((record) => record.profile_id !== profileId),
        validated,
      ];
      try {
        getLocalStorage().setItem(LOCAL_STORAGE_KEY, JSON.stringify(nextRecords));
      } catch {
        throw new Error(
          "The profile could not be saved in browser storage. Storage may be full or disabled; export a JSON backup and configure Supabase for persistent storage.",
        );
      }
      return validated;
    },

    async delete(profileId) {
      const records = await Promise.all(readLocalRecords().map((record) => validate(record)));
      try {
        getLocalStorage().setItem(
          LOCAL_STORAGE_KEY,
          JSON.stringify(records.filter((record) => record.profile_id !== profileId)),
        );
      } catch {
        throw new Error("The profile could not be deleted from browser storage.");
      }
    },
  };
}

function createConfigurationErrorRepository(message: string): ProfileRepository {
  const raise = (): never => {
    throw new Error(message);
  };
  return {
    mode: "unavailable",
    async loadAll() {
      return raise();
    },
    async save() {
      return raise();
    },
    async delete() {
      return raise();
    },
  };
}

function supabaseError(operation: string, error: { message: string }): Error {
  return new Error(
    `Could not ${operation} in Supabase. Check the project connection and profile-table RLS policies. ${error.message}`,
  );
}

function createSupabaseRepository(
  validate: ProfileValidator,
  url: string,
  publishableKey: string,
): ProfileRepository {
  const supabase = getSupabaseClient(url, publishableKey);

  let identityPromise: Promise<string> | null = null;
  const getOwnerId = (): Promise<string> => {
    if (!identityPromise) {
      identityPromise = (async () => {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw supabaseError("load the session", sessionError);
        const user = sessionData.session?.user;
        if (!user?.id || user.is_anonymous) throw new ProfileAuthenticationRequiredError();
        return user.id;
      })().catch((error: unknown) => {
        identityPromise = null;
        throw error;
      });
    }
    return identityPromise;
  };

  return {
    mode: "supabase",

    async loadAll() {
      await getOwnerId();
      const { data, error } = await supabase
        .from(SUPABASE_TABLE)
        .select("profile")
        .order("updated_at", { ascending: false });
      if (error) throw supabaseError("load profiles", error);

      const rows = (data ?? []) as unknown as Pick<SupabaseProfileRow, "profile">[];
      return Promise.all(rows.map((row) => validate(row.profile)));
    },

    async signIn(email, password) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw supabaseError("sign in", error);
      if (!data.user?.id || data.user.is_anonymous) {
        throw new Error("Supabase did not return a signed-in account.");
      }
      identityPromise = Promise.resolve(data.user.id);
      return this.loadAll();
    },

    async signUp(email, password) {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });
      if (error) throw supabaseError("create account", error);
      if (data.session && data.user?.id && !data.user.is_anonymous) {
        identityPromise = Promise.resolve(data.user.id);
        return { authenticated: true, profiles: await this.loadAll() };
      }
      return { authenticated: false, profiles: [] };
    },

    async signOut() {
      const { error } = await supabase.auth.signOut();
      identityPromise = null;
      if (error) throw supabaseError("sign out", error);
    },

    async save(profile) {
      const validated = await validate(withSaveTimestamps(profile));
      const profileId = requiredProfileId(validated);
      const ownerId = await getOwnerId();
      const { data, error } = await supabase
        .from(SUPABASE_TABLE)
        .upsert(
          {
            profile_id: profileId,
            owner_id: ownerId,
            profile: validated,
            schema_version: validated.schema_version,
            created_at: validated.created_at,
            updated_at: validated.updated_at,
          },
          { onConflict: "profile_id" },
        )
        .select("profile")
        .single();
      if (error) throw supabaseError("save the profile", error);
      return validate(data.profile);
    },

    async delete(profileId) {
      await getOwnerId();
      const { error } = await supabase
        .from(SUPABASE_TABLE)
        .delete()
        .eq("profile_id", profileId);
      if (error) throw supabaseError("delete the profile", error);
    },
  };
}

export function createProfileRepository(validate: ProfileValidator): ProfileRepository {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? "";
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";

  if (!url && !publishableKey) return createLocalRepository(validate);
  if (!url || !publishableKey) {
    return createConfigurationErrorRepository(
      "Supabase profile storage needs both VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY. Fill in both values or clear both to use local browser storage.",
    );
  }
  return createSupabaseRepository(validate, url, publishableKey);
}
