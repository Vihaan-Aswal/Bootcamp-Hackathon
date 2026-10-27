import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

beforeEach(() => {
  // Keep automated UI coverage offline even when a developer has configured
  // a real Supabase project in frontend/.env.local.
  vi.stubEnv("VITE_SUPABASE_URL", "");
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "");
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});
