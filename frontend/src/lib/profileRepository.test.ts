import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const supabaseMock = vi.hoisted(() => ({
  auth: {
    getSession: vi.fn(),
    signInWithPassword: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
  },
  from: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => supabaseMock),
}));

import {
  createProfileRepository,
  ProfileAuthenticationRequiredError,
} from "./profileRepository";
import type { components } from "./api-types";

type CandidateProfile = components["schemas"]["CandidateProfile"];

const profileId = "11111111-1111-4111-8111-111111111111";
const profile: CandidateProfile = {
  schema_version: "1.0.0",
  profile_id: profileId,
  created_at: "2026-10-28T00:00:00Z",
  updated_at: "2026-10-28T00:00:00Z",
  basic_details: { full_name: "Ada Lovelace", email: "ada@example.com" },
  skills: [],
  education: [],
  projects: [],
  experience: [],
  hackathons: [],
  internships: [],
  certifications: [],
  preferred_roles: [],
  cv_filename: null,
  skillset_levels: [],
};

function identityValidator() {
  return vi.fn(async (value: unknown) => value as CandidateProfile);
}

beforeEach(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "");
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "");
  supabaseMock.auth.getSession.mockReset().mockResolvedValue({
    data: { session: null },
    error: null,
  });
  supabaseMock.auth.signInWithPassword.mockReset().mockResolvedValue({
    data: { user: { id: "existing-account-id", is_anonymous: false } },
    error: null,
  });
  supabaseMock.auth.signUp.mockReset().mockResolvedValue({
    data: { user: { id: "new-account-id", is_anonymous: false }, session: null },
    error: null,
  });
  supabaseMock.auth.signOut.mockReset().mockResolvedValue({ error: null });
  const order = vi.fn().mockResolvedValue({ data: [], error: null });
  supabaseMock.from.mockReset().mockReturnValue({
    select: vi.fn(() => ({ order })),
  });
});

afterEach(() => {
  window.localStorage.clear();
  vi.unstubAllEnvs();
});

describe("profile repository", () => {
  it("validates and saves, reloads, updates, and deletes multiple local profiles", async () => {
    const validate = identityValidator();
    const repository = createProfileRepository(validate);
    const second = { ...profile, profile_id: "22222222-2222-4222-8222-222222222222" };

    expect(repository.mode).toBe("local");
    await repository.save(profile);
    await repository.save(second);
    expect((await repository.loadAll()).map((item) => item.profile_id)).toEqual([
      profileId,
      second.profile_id,
    ]);

    await repository.save({
      ...profile,
      basic_details: { full_name: "Ada Lovelace", email: "ada+updated@example.com" },
    });
    const updatedProfiles = await repository.loadAll();
    expect(updatedProfiles).toHaveLength(2);
    expect(
      updatedProfiles.find((item) => item.profile_id === profileId)?.basic_details.email,
    ).toBe("ada+updated@example.com");

    await repository.delete(second.profile_id!);
    expect((await repository.loadAll()).map((item) => item.profile_id)).toEqual([profileId]);
    expect(validate).toHaveBeenCalled();
  });

  it("leaves malformed browser data untouched and reports it", async () => {
    const raw = "{broken local profile data";
    window.localStorage.setItem("radix-talent-match:profiles:v1", raw);
    const repository = createProfileRepository(identityValidator());

    await expect(repository.loadAll()).rejects.toThrow("Saved profile data is malformed");
    expect(window.localStorage.getItem("radix-talent-match:profiles:v1")).toBe(raw);
  });

  it("does not fall back to browser storage for a partial Supabase configuration", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://radix.example.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "");
    const repository = createProfileRepository(identityValidator());

    expect(repository.mode).toBe("unavailable");
    await expect(repository.loadAll()).rejects.toThrow(
      "needs both VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY",
    );
    expect(window.localStorage.getItem("radix-talent-match:profiles:v1")).toBeNull();
  });

  it("requires an existing account session and signs in without creating anonymous users", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://radix.example.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "public-test-key");
    const repository = createProfileRepository(identityValidator());

    expect(repository.mode).toBe("supabase");
    await expect(repository.loadAll()).rejects.toBeInstanceOf(
      ProfileAuthenticationRequiredError,
    );
    expect(supabaseMock.auth.signInWithPassword).not.toHaveBeenCalled();

    await expect(repository.signIn?.(" user@example.com ", "password")).resolves.toEqual([]);
    expect(supabaseMock.auth.signInWithPassword).toHaveBeenCalledWith({
      email: "user@example.com",
      password: "password",
    });
    expect(supabaseMock.from).toHaveBeenCalledWith("rtm_candidate_profiles");
  });

  it("registers through normal email auth and waits for confirmation when Supabase returns no session", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://radix.example.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "public-test-key");
    const repository = createProfileRepository(identityValidator());

    await expect(repository.signUp?.(" user@example.com ", "password")).resolves.toEqual({
      authenticated: false,
      profiles: [],
    });
    expect(supabaseMock.auth.signUp).toHaveBeenCalledWith({
      email: "user@example.com",
      password: "password",
    });
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  it("rejects an existing anonymous session and permits sign-out", async () => {
    supabaseMock.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: "anonymous-id", is_anonymous: true } } },
      error: null,
    });
    vi.stubEnv("VITE_SUPABASE_URL", "https://radix.example.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "public-test-key");
    const repository = createProfileRepository(identityValidator());

    await expect(repository.loadAll()).rejects.toBeInstanceOf(
      ProfileAuthenticationRequiredError,
    );
    await repository.signOut?.();
    expect(supabaseMock.auth.signOut).toHaveBeenCalledOnce();
  });
});
