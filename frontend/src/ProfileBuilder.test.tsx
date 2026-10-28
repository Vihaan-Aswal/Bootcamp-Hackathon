import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";

import ProfileBuilder, { exportCandidateProfile, mergeResumeSuggestions, type EditableProfile } from "./ProfileBuilder";
import type { ExtractionResult, HealthResponse, SkillCategoryListResponse } from "./lib/api";

const categoryCodes = ["COD", "DSA", "OOD", "APTI", "COMM", "AI", "CLOUD", "SQL", "SWE", "SYSD", "NETW", "OS"] as const;

const categories: SkillCategoryListResponse = {
  registry_version: "skills-v1",
  warnings: [],
  categories: categoryCodes.map((code) => ({
    code,
    name: code === "COD" ? "Coding" : `${code} category`,
    levels: Array.from({ length: 10 }, (_, index) => ({ level: index + 1, topics: [`Topic ${index + 1}`] })),
  })),
};

const localProvider: HealthResponse["provider"] = {
  name: "mock",
  configured: true,
  supports_json_schema: false,
  external: false,
  resume_processing_allowed: true,
  jd_processing_allowed: false,
  route: ["mock/local-registry-rules"],
};

function profile(
  id = "11111111-1111-4111-8111-111111111111",
  overrides: Partial<EditableProfile> = {},
): EditableProfile {
  const now = "2026-10-28T00:00:00Z";
  return {
    schema_version: "1.0.0",
    profile_id: id,
    created_at: now,
    updated_at: now,
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
    ...overrides,
  };
}

function extraction(skills: ExtractionResult["skills"] = []): ExtractionResult {
  return {
    schema_version: "1.0.0",
    source_type: "resume",
    filename: "resume.docx",
    skills,
    education: [{ institution: "Example University", qualification: "BSc", field_of_study: "Computer Science", start_year: 2020, end_year: 2024 }],
    projects: [{ name: "Talent Match", summary: "Built a matching app." }],
    experience: [{ employer: "Example Labs", title: "Intern", summary: "Built tools.", start_year: 2023 }],
    metadata: {
      provider: "mock",
      source_format: "docx",
      element_count: 3,
      redaction_applied: false,
      warnings: [],
    },
  };
}

function renderBuilder(overrides: Partial<ComponentProps<typeof ProfileBuilder>> = {}) {
  const onSave = vi.fn(async (_candidate: EditableProfile) => undefined);
  const onDelete = vi.fn(async (_profileId: string) => undefined);
  const onImport = vi.fn(async (jsonText: string) => JSON.parse(jsonText) as EditableProfile);
  const onParseResume = vi.fn(async (_file: File, _allowExternalProcessing: boolean) => extraction());
  const onSelect = vi.fn((_profileId: string | null) => undefined);
  const props = {
    profiles: [],
    selectedProfileId: null,
    onSelect,
    onSave,
    onDelete,
    onImport,
    onParseResume,
    categories,
    provider: localProvider,
    storageMode: "local" as const,
    ...overrides,
  };
  const view = render(<ProfileBuilder {...props} />);
  return { ...view, props, onSave, onDelete, onImport, onParseResume, onSelect };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Profile Builder", () => {
  it("edits details and a self-reported rating without filling other ratings", async () => {
    const { onSave } = renderBuilder();
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Grace Hopper" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "grace@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Add skill" }));
    fireEvent.change(screen.getByLabelText("Skill 1"), { target: { value: "TypeScript" } });
    fireEvent.change(screen.getByLabelText("Category for skill 1"), { target: { value: "COD" } });
    fireEvent.change(screen.getByLabelText("Coding self-reported rating"), { target: { value: "7" } });
    fireEvent.change(screen.getByLabelText("Coding rating note"), { target: { value: "I use it weekly." } });
    fireEvent.submit(screen.getByLabelText("Full name").closest("form")!);

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const saved = onSave.mock.calls[0][0] as EditableProfile;
    expect(saved.basic_details).toEqual({ full_name: "Grace Hopper", email: "grace@example.com" });
    expect(saved.skills?.[0]).toMatchObject({ skill_name: "TypeScript", category_code: "COD", origin: "manual", evidence_status: "manual" });
    expect(saved.skillset_levels).toEqual([{ category_code: "COD", level: 7, evidence_note: "I use it weekly.", source: "self_reported" }]);
  });

  it("stops blank or malformed required details before calling save", async () => {
    const { onSave } = renderBuilder();
    fireEvent.submit(screen.getByLabelText("Full name").closest("form")!);
    expect((await screen.findByRole("alert")).textContent).toContain("Enter your full name");
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Ada" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "not-an-email" } });
    fireEvent.submit(screen.getByLabelText("Full name").closest("form")!);
    expect((await screen.findByRole("alert")).textContent).toContain("valid email address");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("requires incomplete profile rows to be filled or removed before saving", async () => {
    const { onSave } = renderBuilder();
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Ada Lovelace" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ada@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Add skill" }));
    fireEvent.submit(screen.getByLabelText("Full name").closest("form")!);

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Complete or remove the blank skill",
    );
    expect(onSave).not.toHaveBeenCalled();
  });

  it("imports JSON through the validation callback and exports a profile file", async () => {
    const imported = profile("22222222-2222-4222-8222-222222222222");
    const onImport = vi.fn(async (jsonText: string) => JSON.parse(jsonText) as EditableProfile);
    const { onSelect } = renderBuilder({ onImport });
    const jsonFile = new File([JSON.stringify(imported)], "profile.json", { type: "application/json" });
    Object.defineProperty(jsonFile, "text", { value: async () => JSON.stringify(imported) });
    fireEvent.change(screen.getByLabelText("Import profile JSON"), { target: { files: [jsonFile] } });

    await screen.findByText("Profile imported and saved.");
    expect(onImport).toHaveBeenCalledWith(JSON.stringify(imported));
    expect(onSelect).toHaveBeenCalledWith(imported.profile_id);

    const createObjectURL = vi.fn(() => "blob:profile");
    const revokeObjectURL = vi.fn();
    const previousCreateObjectURL = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
    const previousRevokeObjectURL = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });
    try {
      exportCandidateProfile(imported);
      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(anchorClick).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith("blob:profile"));
    } finally {
      if (previousCreateObjectURL) Object.defineProperty(URL, "createObjectURL", previousCreateObjectURL);
      else Reflect.deleteProperty(URL, "createObjectURL");
      if (previousRevokeObjectURL) Object.defineProperty(URL, "revokeObjectURL", previousRevokeObjectURL);
      else Reflect.deleteProperty(URL, "revokeObjectURL");
    }
  });

  it("merges resume suggestions without duplicates or inferred ratings", () => {
    const current = profile("33333333-3333-4333-8333-333333333333", {
      skills: [
        { skill_name: "Python", skill_id: "python", category_code: "COD", evidence_status: "manual", confidence: "medium", origin: "manual" },
        { skill_name: "C", skill_id: null, category_code: "COD", evidence_status: "manual", confidence: "medium", origin: "manual" },
      ],
      skillset_levels: [{ category_code: "OS", level: 3, evidence_note: null, source: "self_reported" }],
    });
    const result = mergeResumeSuggestions(current, extraction([
      { skill_name: "Python 3", skill_id: "python", category_code: "COD", evidence: "Used Python 3", evidence_status: "exact", confidence: "high", requirement_type: null, origin: "resume", source_ref: { element_id: "p1", filename: "resume.docx", page: null, paragraph: 1, heading: "Skills" } },
      { skill_name: "C++", skill_id: null, category_code: "COD", evidence: "Used C++", evidence_status: "exact", confidence: "high", requirement_type: null, origin: "resume", source_ref: { element_id: "p2", filename: "resume.docx", page: null, paragraph: 2, heading: "Skills" } },
      { skill_name: "C#", skill_id: null, category_code: "COD", evidence: "Used C#", evidence_status: "exact", confidence: "high", requirement_type: null, origin: "resume", source_ref: { element_id: "p3", filename: "resume.docx", page: null, paragraph: 3, heading: "Skills" } },
    ]));

    expect(result.skills).toHaveLength(4);
    expect(result.skills?.map((skill) => skill.skill_name)).toEqual(["Python", "C", "C++", "C#"]);
    expect(result.education?.[0].institution).toBe("Example University");
    expect(result.projects?.[0].name).toBe("Talent Match");
    expect(result.experience?.[0].employer).toBe("Example Labs");
    expect(result.skillset_levels).toEqual(current.skillset_levels);
  });

  it("merges accepted suggestions from the document review into the profile draft", async () => {
    const reviewed = {
      ...extraction([
        {
          skill_name: "Python",
          skill_id: "python",
          category_code: "COD",
          evidence: "Built with Python.",
          evidence_status: "exact",
          confidence: "high",
          requirement_type: null,
          origin: "resume",
          source_ref: {
            element_id: "p-1",
            filename: "resume.docx",
            page: null,
            paragraph: 0,
            heading: null,
          },
        },
      ]),
      document_id: "reviewed-resume-1",
    } as ExtractionResult;

    renderBuilder({ reviewedResumeSuggestions: reviewed });

    expect(await screen.findByLabelText("Skill 1")).toHaveProperty("value", "Python");
    expect(await screen.findByText(/Accepted resume suggestions merged/)).toBeTruthy();
    expect(screen.getByLabelText("Coding self-reported rating")).toHaveProperty("value", "");
  });

  it("calls resume parsing, keeps the filename, and requires consent for external providers", async () => {
    const external: HealthResponse["provider"] = { ...localProvider, name: "openrouter", external: true };
    const { onParseResume } = renderBuilder({ provider: external });
    const file = new File(["resume body"], "candidate.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText("Choose resume (PDF or DOCX)"), { target: { files: [file] } });
    const parseButton = screen.getByRole("button", { name: "Parse and merge suggestions" });
    expect(parseButton).toHaveProperty("disabled", true);

    fireEvent.click(screen.getByLabelText(/reviewed this route’s current terms and consent/i));
    fireEvent.click(parseButton);
    expect(await screen.findByText("Resume suggestions merged. Review every item before saving.")).toBeTruthy();
    expect(onParseResume).toHaveBeenCalledWith(file, true);
    expect(screen.getByText("candidate.pdf")).toBeTruthy();
    expect(screen.getByLabelText("AI category self-reported rating")).toHaveProperty("value", "");
    expect(
      screen.getByLabelText(/reviewed this route’s current terms and consent/i),
    ).toHaveProperty("checked", false);

    const secondFile = new File(["second resume body"], "second.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText("Choose resume (PDF or DOCX)"), {
      target: { files: [secondFile] },
    });
    expect(parseButton).toHaveProperty("disabled", true);
    expect(onParseResume).toHaveBeenCalledTimes(1);
  });

  it("marks unsaved edits and blocks saving until Supabase sign-in", async () => {
    const { onSave } = renderBuilder({
      storageMode: "supabase",
      saveBlockedReason: "Sign in above to save to Supabase.",
    });

    expect(screen.getByText("No unsaved changes")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Ada Lovelace" } });
    expect(screen.getByText("Unsaved changes")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save profile" })).toHaveProperty("disabled", true);
    expect(screen.getByText("Sign in above to save to Supabase.")).toBeTruthy();

    fireEvent.submit(screen.getByLabelText("Full name").closest("form")!);
    expect((await screen.findByRole("alert")).textContent).toContain("Sign in above to save");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("loads an existing profile and deletes the selected profile", async () => {
    const first = profile("44444444-4444-4444-8444-444444444444");
    const second = profile("55555555-5555-4555-8555-555555555555", {
      basic_details: { full_name: "Katherine Johnson", email: "kj@example.com" },
    });
    const { onDelete, onSelect, props, rerender } = renderBuilder({ profiles: [first, second], selectedProfileId: first.profile_id! });
    expect(screen.getByLabelText("Full name")).toHaveProperty("value", "Ada Lovelace");
    fireEvent.change(screen.getByLabelText("Saved profile"), { target: { value: second.profile_id } });
    expect(onSelect).toHaveBeenCalledWith(second.profile_id);
    rerender(<ProfileBuilder {...props} selectedProfileId={second.profile_id!} />);
    await waitFor(() => expect(screen.getByLabelText("Full name")).toHaveProperty("value", "Katherine Johnson"));
    fireEvent.click(screen.getByRole("button", { name: "Delete profile" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm delete" }));
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith(second.profile_id));
    expect(onSelect).toHaveBeenCalledWith(null);
  });
});
