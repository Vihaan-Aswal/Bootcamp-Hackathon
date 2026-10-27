import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "./App";

const dataVersion = "a".repeat(64);

const bodies: Record<string, unknown> = {
  "/api/v1/health": {
    status: "ok",
    contract_version: "1.0.0",
    registry_version: "1.0.0",
    provider: {
      name: "mock",
      configured: true,
      supports_json_schema: false,
      external: false,
      resume_processing_allowed: true,
    },
    company_data: {
      available: true,
      data_version: dataVersion,
      source_status: "provisional_csv_fallback",
      official_json_confirmed: false,
      company_count: 2,
    },
    modules: [
      { key: "talent_check", name: "Talent Check", milestone: "M4", status: "planned" },
    ],
    warnings: [],
  },
  "/api/v1/companies": {
    data_version: dataVersion,
    source_status: "provisional_csv_fallback",
    official_json_confirmed: false,
    source_note: "CSV-derived fallback.",
    companies: [
      { company_id: "google", display_name: "Google" },
      { company_id: "microsoft", display_name: "Microsoft" },
    ],
  },
  "/api/v1/reference/skill-categories": {
    registry_version: "1.0.0",
    categories: [{ code: "COD", name: "Coding", levels: [{ level: 1, topics: ["Variables"] }] }],
    warnings: [],
  },
};

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

describe("foundation screen", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it("renders contract, company and category data from the API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => jsonResponse(bodies[String(input)])),
    );

    render(<App />);

    expect(await screen.findByText(/M3 profile builder/)).toBeTruthy();
    expect(screen.getByText("Talent Check")).toBeTruthy();
    expect(screen.getByText("Google")).toBeTruthy();
    expect(screen.getByText("COD", { selector: "code" })).toBeTruthy();
    expect(screen.getByText(/Provisional data/)).toBeTruthy();
  });

  it("imports through Pydantic validation and assigns a new profile identity", async () => {
    const originalId = "11111111-1111-4111-8111-111111111111";
    const validationBodies: Record<string, unknown>[] = [];
    const profile = {
      schema_version: "1.0.0",
      profile_id: originalId,
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
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === "/api/v1/profiles/validate") {
          const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
          validationBodies.push(body);
          return jsonResponse(body);
        }
        return jsonResponse(bodies[String(input)]);
      }),
    );

    render(<App />);
    const file = new File([JSON.stringify(profile)], "profile.json", { type: "application/json" });
    Object.defineProperty(file, "text", { value: async () => JSON.stringify(profile) });
    fireEvent.change(await screen.findByLabelText("Import profile JSON"), {
      target: { files: [file] },
    });

    expect(await screen.findByText("Profile imported and saved.")).toBeTruthy();
    await waitFor(() => expect(validationBodies).toHaveLength(2));
    expect(validationBodies[0].profile_id).toBe(originalId);
    expect(validationBodies[1].profile_id).not.toBe(originalId);
    await waitFor(() =>
      expect(screen.getByLabelText("Saved profile")).toHaveProperty(
        "value",
        validationBodies[1].profile_id,
      ),
    );
    expect(screen.getByLabelText("Full name")).toHaveProperty("value", "Ada Lovelace");
  });

  it("tells the user how to start the backend when the API is down", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503 }) as Response));

    render(<App />);

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText(/uv run uvicorn/)).toBeTruthy();
  });
});
