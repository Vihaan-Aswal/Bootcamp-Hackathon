import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import TalentCheckPanel from "./TalentCheckPanel";
import type {
  CandidateProfile,
  CompanyListResponse,
  CompanySkillBar,
  TalentCheckResult,
} from "./lib/api";

const profileId = "33333333-3333-4333-8333-333333333333";
const categoryCodes = ["COD", "DSA", "OOD", "APTI", "COMM", "AI", "CLOUD", "SQL", "SWE", "SYSD", "NETW", "OS"] as const;
const profile = {
  schema_version: "1.0.0",
  profile_id: profileId,
  basic_details: { full_name: "Ada Lovelace", email: "ada@example.com" },
  skillset_levels: [],
} as CandidateProfile;
const companies: CompanyListResponse = {
  data_version: "a".repeat(64),
  source_status: "provisional_csv_fallback",
  official_json_confirmed: false,
  source_note: "Generated from supplied CSV.",
  companies: [{ company_id: "google", display_name: "Google" }],
};
const companyBar: CompanySkillBar = {
  company_id: "google",
  display_name: "Google",
  skillsets: categoryCodes.map((category_code, index) => ({
    category_code,
    category_name: `${category_code} category`,
    required_level: 6,
    bloom_code: index === 0 ? "AP" : null,
  })),
};

function checkResult(status: "complete" | "incomplete"): TalentCheckResult {
  const missing = status === "incomplete" ? ["COD"] : [];
  return {
    schema_version: "1.0.0",
    company_id: "google",
    profile_id: profileId,
    company_data_version: "b".repeat(64),
    status,
    readiness_score: status === "complete" ? 92 : null,
    missing_categories: missing as TalentCheckResult["missing_categories"],
    rows: categoryCodes.map((category_code, index) => ({
      category_code,
      category_name: `${category_code} category`,
      required_level: 6,
      candidate_level: status === "incomplete" && index === 0 ? null : index === 0 ? 4 : 6,
      gap: index === 0,
      gap_size: index === 0 ? 2 : 0,
      bloom_code: index === 0 ? "AP" : null,
    })),
    formula_version: "readiness_v1",
  };
}

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

describe("Talent Check panel", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("loads the 12-skill company bar and displays a score and gap rows", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
      String(input).endsWith("/companies/google") ? jsonResponse(companyBar) : jsonResponse(checkResult("complete")),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <TalentCheckPanel
        companies={companies}
        profiles={[profile]}
        selectedProfileId={profileId}
        onProfileChange={vi.fn()}
      />,
    );

    fireEvent.click(await screen.findByText(/Google 12-skillset requirement snapshot/));
    expect(screen.getByText("COD", { selector: "code" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Run Talent Check" }));

    expect(await screen.findByText(/Self-reported readiness indicator:/)).toBeTruthy();
    expect(screen.getByText("92%" )).toBeTruthy();
    expect(screen.getByText("2 levels below")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/companies/google/talent-check",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("withholds the score and explains missing ratings", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) =>
      String(input).endsWith("/companies/google") ? jsonResponse(companyBar) : jsonResponse(checkResult("incomplete")),
    ));

    render(
      <TalentCheckPanel
        companies={companies}
        profiles={[profile]}
        selectedProfileId={profileId}
        onProfileChange={vi.fn()}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Run Talent Check" }));

    expect(await screen.findByText(/No readiness score is shown/)).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("92%")).toBeNull());
    expect(screen.getByText("Not rated")).toBeTruthy();
  });
});
