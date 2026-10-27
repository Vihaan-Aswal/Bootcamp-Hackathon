import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import SkillMatchPanel from "./SkillMatchPanel";
import type {
  CandidateProfile,
  ExtractionResult,
  Skill,
  SkillMatchResult,
} from "./lib/api";

const profileId = "33333333-3333-4333-8333-333333333333";
const documentId = "11111111-1111-4111-8111-111111111111";
const jdSkill = {
  skill_name: "GraphQL APIs",
  skill_id: null,
  category_code: "OTHER",
  evidence: "GraphQL APIs are required.",
  evidence_status: "exact",
  confidence: "high",
  requirement_type: "required",
  origin: "jd",
  source_ref: {
    element_id: "p3",
    filename: "role.docx",
    page: null,
    paragraph: 3,
    heading: "Requirements",
  },
} as Skill;
const duplicateJdSkill = {
  ...jdSkill,
  skill_name: "graphql APIs",
  evidence: "graphql APIs are needed in the role.",
  source_ref: { ...jdSkill.source_ref!, element_id: "p4", paragraph: 4 },
} as Skill;
const preferredSkill = {
  ...jdSkill,
  skill_name: "Kubernetes",
  requirement_type: "preferred",
} as Skill;
const profile = {
  schema_version: "1.0.0",
  profile_id: profileId,
  basic_details: { full_name: "Ada Lovelace", email: "ada@example.com" },
  skills: [
    {
      ...jdSkill,
      skill_name: "GraphQL API",
      evidence_status: "exact",
      origin: "resume",
      requirement_type: null,
    },
  ],
} as CandidateProfile;
const jd = {
  schema_version: "1.0.0",
  document_id: documentId,
  source_type: "jd",
  filename: "role.docx",
  skills: [jdSkill, duplicateJdSkill, preferredSkill],
  metadata: { provider: "mock", source_format: "docx", element_count: 1, redaction_applied: false },
} as ExtractionResult;

function result(confirmed: boolean): SkillMatchResult {
  return {
    schema_version: "1.0.0",
    jd_document_id: documentId,
    profile_id: profileId,
    status: "scorable",
    match_score: confirmed ? 100 : 0,
    distinct_required_skill_count: 1,
    matched: confirmed ? [jdSkill] : [],
    missing_required: confirmed ? [] : [jdSkill],
    preferred: [preferredSkill],
    mentioned: [],
    unclear: [],
    requirement_evidence: [
      {
        group_key: "required:text:graphql api",
        requirement_type: "required",
        evidence: [jdSkill, duplicateJdSkill],
      },
    ],
    possible: confirmed
      ? []
      : [{ jd_skill_name: "GraphQL APIs", candidate_skill_name: "GraphQL API", similarity: 0.96, method: "fuzzy" }],
    match_methods: confirmed ? ["confirmed_fuzzy"] : [],
    registry_version: "1.0.0",
    formula_version: "match_v1",
  };
}

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

describe("Skill Match panel", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("loads JD requirements, keeps groups separate and counts fuzzy matches only after confirmation", async () => {
    const requestBodies: Record<string, unknown>[] = [];
    let matchCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        matchCount += 1;
        return jsonResponse(result(matchCount > 1));
      }),
    );

    render(
      <SkillMatchPanel
        profiles={[profile]}
        selectedProfileId={profileId}
        onProfileChange={vi.fn()}
        jd={jd}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Run Skill Match" }));
    expect(await screen.findByText("Missing required skills (1)")).toBeTruthy();
    expect(screen.getByText("Preferred skills (1)")).toBeTruthy();
    expect(screen.getByText(/JD source evidence \(2 quotes\)/)).toBeTruthy();
    expect(screen.getByText("Possible matches")).toBeTruthy();

    fireEvent.click(screen.getByRole("checkbox", { name: "Confirm GraphQL API as GraphQL APIs" }));
    fireEvent.click(screen.getByRole("button", { name: "Recalculate with review decisions" }));

    await waitFor(() => expect(matchCount).toBe(2));
    expect(screen.getByText("100%")).toBeTruthy();
    const confirmations = requestBodies[1].confirmations as { confirmed: boolean }[];
    expect(confirmations).toHaveLength(1);
    expect(confirmations[0].confirmed).toBe(true);
  });
});
