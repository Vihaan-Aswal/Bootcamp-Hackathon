import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createProfileRepository } from "./profileRepository";
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
});
