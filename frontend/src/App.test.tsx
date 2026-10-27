import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
      jd_processing_allowed: false,
      route: ["mock/local-registry-rules"],
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
    expect(screen.getByRole("heading", { name: "Talent Check" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Google" })).toBeTruthy();
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
      expect(within(screen.getByRole("region", { name: "Profile Builder" })).getByLabelText("Saved profile")).toHaveProperty(
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

  it.each([
    {
      candidate: "Candidate Alpha",
      email: "alpha@example.com",
      resumeSkill: "Python",
      resumeSkillId: "python",
      jdSkill: "Python",
      jdSkillId: "python",
      matchScore: 100,
      readinessScore: 88,
    },
    {
      candidate: "Candidate Beta",
      email: "beta@example.com",
      resumeSkill: "SQL",
      resumeSkillId: "sql",
      jdSkill: "Python",
      jdSkillId: "python",
      matchScore: 0,
      readinessScore: 42,
    },
  ])(
    "runs JD analysis, resume merge, profile save, Talent Check and Skill Match for $candidate",
    async (scenario) => {
      const categoryRows = [
        ["COD", "Coding"],
        ["DSA", "Data Structures and Algorithms"],
        ["OOD", "Object-Oriented Programming and Design"],
        ["APTI", "Aptitude and Problem Solving"],
        ["COMM", "Communication Skills"],
        ["AI", "AI Native Engineering"],
        ["CLOUD", "DevOps and Cloud"],
        ["SQL", "SQL and Design"],
        ["SWE", "Software Engineering"],
        ["SYSD", "System Design and Architecture"],
        ["NETW", "Computer Networking"],
        ["OS", "Operating System"],
      ] as const;
      const companies = {
        data_version: dataVersion,
        source_status: "provisional_csv_fallback",
        official_json_confirmed: false,
        source_note: "CSV-derived fallback.",
        companies: [{ company_id: "google", display_name: "Google" }],
      };
      const categoryData = {
        registry_version: "1.0.0",
        categories: categoryRows.map(([code, name]) => ({
          code,
          name,
          levels: Array.from({ length: 10 }, (_, index) => ({
            level: index + 1,
            topics: [`${name} level ${index + 1}`],
          })),
        })),
        warnings: [],
      };
      const companyBar = {
        company_id: "google",
        display_name: "Google",
        skillsets: categoryRows.map(([category_code, category_name]) => ({
          category_code,
          category_name,
          required_level: 7,
          bloom_code: null,
          source_value: null,
        })),
      };
      const sourceRef = (filename: string) => ({
        element_id: "docx-1",
        filename,
        page: null,
        paragraph: 1,
        heading: "Requirements",
      });
      const jdSkill = {
        skill_name: scenario.jdSkill,
        skill_id: scenario.jdSkillId,
        category_code: scenario.jdSkillId === "sql" ? "SQL" : "COD",
        evidence: `${scenario.jdSkill} is required for this role.`,
        evidence_status: "exact",
        confidence: "high",
        requirement_type: "mentioned",
        origin: "jd",
        source_ref: sourceRef("role.docx"),
      };
      const jdResult = {
        schema_version: "1.0.0",
        document_id: "11111111-1111-4111-8111-111111111111",
        source_type: "jd",
        filename: "role.docx",
        company: "RADIX Demo",
        role: "Demo role",
        skills: [jdSkill],
        education: [],
        projects: [],
        experience: [],
        metadata: {
          provider: "mock",
          model: "local-registry-rules",
          extracted_at: "2026-10-28T00:00:00Z",
          source_format: "docx",
          element_count: 2,
          page_count: null,
          redaction_applied: false,
          warnings: [],
        },
        rejected_claims: [],
      };
      const resumeResult = {
        ...jdResult,
        document_id: "22222222-2222-4222-8222-222222222222",
        source_type: "resume",
        filename: "resume.docx",
        company: null,
        role: null,
        skills: [{
          ...jdSkill,
          skill_name: scenario.resumeSkill,
          skill_id: scenario.resumeSkillId,
          category_code: scenario.resumeSkillId === "sql" ? "SQL" : "COD",
          evidence: `I have used ${scenario.resumeSkill}.`,
          requirement_type: null,
          origin: "resume",
          source_ref: sourceRef("resume.docx"),
        }],
        metadata: { ...jdResult.metadata, redaction_applied: true },
      };
      const validatedProfiles: Record<string, unknown>[] = [];
      const matchRequests: Record<string, unknown>[] = [];
      const health = {
        ...bodies["/api/v1/health"] as Record<string, unknown>,
        modules: [
          { key: "jd_analytics", name: "JD Analytics", milestone: "M2", status: "ready" },
          { key: "resume_parsing", name: "Resume Parsing", milestone: "M2", status: "ready" },
          { key: "profile_builder", name: "Profile Builder", milestone: "M3", status: "ready" },
          { key: "talent_check", name: "Talent Check", milestone: "M4", status: "ready" },
          { key: "skill_matching", name: "Skill Matching", milestone: "M4", status: "ready" },
        ],
      };
      vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = String(input);
        if (path === "/api/v1/health") return jsonResponse(health);
        if (path === "/api/v1/companies") return jsonResponse(companies);
        if (path === "/api/v1/reference/skill-categories") return jsonResponse(categoryData);
        if (path === "/api/v1/companies/google") return jsonResponse(companyBar);
        if (path === "/api/v1/jds/analyze") return jsonResponse(jdResult);
        if (path === "/api/v1/resumes/parse") return jsonResponse(resumeResult);
        if (path === "/api/v1/profiles/validate") {
          const profile = JSON.parse(String(init?.body)) as Record<string, unknown>;
          validatedProfiles.push(profile);
          return jsonResponse(profile);
        }
        if (path === "/api/v1/companies/google/talent-check") {
          const profile = JSON.parse(String(init?.body)) as Record<string, unknown>;
          const levels = profile.skillset_levels as { category_code: string; level: number }[];
          return jsonResponse({
            schema_version: "1.0.0",
            company_id: "google",
            profile_id: profile.profile_id,
            company_data_version: dataVersion,
            status: "complete",
            readiness_score: scenario.readinessScore,
            missing_categories: [],
            rows: categoryRows.map(([category_code, category_name]) => ({
              category_code,
              category_name,
              required_level: 7,
              candidate_level: levels.find((row) => row.category_code === category_code)?.level ?? null,
              gap: false,
              gap_size: 0,
              bloom_code: null,
            })),
            formula_version: "readiness_v1",
          });
        }
        if (path === "/api/v1/skill-matches/score") {
          const request = JSON.parse(String(init?.body)) as {
            profile: { profile_id: string; skills: { skill_id?: string | null }[] };
            jd: { document_id: string; skills: typeof jdResult.skills };
          };
          matchRequests.push(request as unknown as Record<string, unknown>);
          const matched = request.profile.skills.some((skill) => skill.skill_id === scenario.jdSkillId);
          return jsonResponse({
            schema_version: "1.0.0",
            jd_document_id: request.jd.document_id,
            profile_id: request.profile.profile_id,
            status: "scorable",
            match_score: matched ? 100 : 0,
            distinct_required_skill_count: 1,
            matched: matched ? request.jd.skills : [],
            missing_required: matched ? [] : request.jd.skills,
            preferred: [],
            mentioned: [],
            unclear: [],
            possible: [],
            requirement_evidence: [],
            match_methods: matched ? ["registry_id"] : [],
            registry_version: "1.0.0",
            formula_version: "match_v1",
          });
        }
        return { ok: false, status: 404, json: async () => ({ detail: "Not found" }) } as Response;
      }));

      render(<App />);
      expect(await screen.findByText(/M3 profile builder/)).toBeTruthy();

      const jdFile = new File(["Required: Python is needed."], "role.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
      fireEvent.change(screen.getByLabelText(/Job description \(PDF or DOCX\)/), {
        target: { files: [jdFile] },
      });
      fireEvent.click(screen.getByRole("button", { name: "Analyze job description" }));
      expect(await screen.findByText(`${scenario.jdSkill} is required for this role.`)).toBeTruthy();
      fireEvent.change(screen.getByLabelText(`Requirement classification for ${scenario.jdSkill}`), {
        target: { value: "required" },
      });

      const resumeFile = new File(["I have used a documented skill."], "resume.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
      fireEvent.click(screen.getByRole("tab", { name: "Resume" }));
      fireEvent.change(screen.getByLabelText(/Resume \(PDF or DOCX\)/), {
        target: { files: [resumeFile] },
      });
      fireEvent.click(screen.getByRole("button", { name: "Parse resume" }));
      expect(await screen.findByText(`I have used ${scenario.resumeSkill}.`)).toBeTruthy();
      fireEvent.click(screen.getByLabelText(`Accept ${scenario.resumeSkill}`));
      fireEvent.click(screen.getByRole("button", { name: "Merge accepted suggestions into Profile Builder" }));
      expect(await screen.findByText("Accepted resume suggestions merged. Review the profile and save your changes.")).toBeTruthy();

      fireEvent.change(screen.getByLabelText("Full name"), { target: { value: scenario.candidate } });
      fireEvent.change(screen.getByLabelText("Email"), { target: { value: scenario.email } });
      for (const [, categoryName] of categoryRows) {
        fireEvent.change(screen.getByLabelText(`${categoryName} self-reported rating`), {
          target: { value: "5" },
        });
      }
      fireEvent.submit(screen.getByLabelText("Full name").closest("form")!);
      expect(await screen.findByText("Profile saved.")).toBeTruthy();
      expect(validatedProfiles).toHaveLength(1);
      expect(validatedProfiles[0].cv_filename).toBe("resume.docx");
      expect(validatedProfiles[0].skills).toEqual(resumeResult.skills);
      expect(validatedProfiles[0]).not.toHaveProperty("raw_resume_text");
      expect((validatedProfiles[0].skillset_levels as unknown[]).length).toBe(12);

      await waitFor(() => expect(screen.getByRole("button", { name: "Run Talent Check" })).toHaveProperty("disabled", false));
      fireEvent.click(screen.getByRole("button", { name: "Run Talent Check" }));
      const talentPanel = within(screen.getByRole("region", { name: "Talent Check" }));
      await waitFor(() => {
        const score = talentPanel.getByText((_, element) =>
          Boolean(element?.classList.contains("readiness-score")),
        );
        expect(score.textContent).toContain(
          `Self-reported readiness indicator: ${scenario.readinessScore}%`,
        );
      });

      fireEvent.click(screen.getByRole("button", { name: "Run Skill Match" }));
      const matchPanel = within(screen.getByRole("region", { name: "Skill Matching" }));
      await waitFor(() => {
        const score = matchPanel.getByText((_, element) =>
          Boolean(element?.classList.contains("readiness-score")),
        );
        expect(score.textContent).toContain(`Required-skill match: ${scenario.matchScore}%`);
      });
      expect(matchRequests).toHaveLength(1);
      const request = matchRequests[0] as unknown as {
        profile: { skills: { skill_id?: string | null }[] };
        jd: { filename: string };
      };
      expect(request.profile.skills.some((skill) => skill.skill_id === scenario.resumeSkillId)).toBe(true);
      expect(request.jd.filename).toBe("role.docx");
      expect((request as unknown as { jd: { skills: { requirement_type: string }[] } }).jd.skills[0].requirement_type).toBe("required");
    },
  );
});
