import type { components } from "./api-types";

export type HealthResponse = components["schemas"]["HealthResponse"];
export type CompanyListResponse = components["schemas"]["CompanyListResponse"];
export type SkillCategoryListResponse =
  components["schemas"]["SkillCategoryListResponse"];
export type ExtractionResult = components["schemas"]["ExtractionResult"];
export type CandidateProfile = components["schemas"]["CandidateProfile"];
export type CompanySkillBar = components["schemas"]["CompanySkillBar"];
export type TalentCheckResult = components["schemas"]["TalentCheckResult"];
export type SkillMatchResult = components["schemas"]["SkillMatchResult"];
export type SkillMatchRequest = components["schemas"]["SkillMatchRequest"];
export type MatchConfirmation = components["schemas"]["MatchConfirmation"];
export type PossibleMatch = components["schemas"]["PossibleMatch"];
export type Skill = components["schemas"]["Skill"];

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`${path} failed with HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

async function postFile<T>(path: string, file: File, allowExternalProcessing?: boolean): Promise<T> {
  const body = new FormData();
  body.append("file", file);
  if (allowExternalProcessing !== undefined) {
    body.append("allow_external_processing", String(allowExternalProcessing));
  }
  const response = await fetch(path, { method: "POST", body });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { detail?: { message?: string } | string }
      | null;
    const detail = payload?.detail;
    const message =
      typeof detail === "string" ? detail : detail?.message ?? `${path} failed with HTTP ${response.status}`;
    throw new Error(message);
  }
  return (await response.json()) as T;
}

async function postJson<T>(path: string, value: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(value),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { detail?: unknown }
      | null;
    const detail = payload?.detail;
    const message =
      typeof detail === "string"
        ? detail
        : response.status === 422
          ? "The profile JSON does not match the supported profile schema."
          : `Profile validation failed with HTTP ${response.status}`;
    throw new Error(message);
  }
  return (await response.json()) as T;
}

export const api = {
  health: () => getJson<HealthResponse>("/api/v1/health"),
  companies: () => getJson<CompanyListResponse>("/api/v1/companies"),
  company: (companyId: string) =>
    getJson<CompanySkillBar>(`/api/v1/companies/${encodeURIComponent(companyId)}`),
  skillCategories: () =>
    getJson<SkillCategoryListResponse>("/api/v1/reference/skill-categories"),
  analyzeJd: (file: File) => postFile<ExtractionResult>("/api/v1/jds/analyze", file),
  parseResume: (file: File, allowExternalProcessing: boolean) =>
    postFile<ExtractionResult>("/api/v1/resumes/parse", file, allowExternalProcessing),
  validateProfile: (profile: unknown) =>
    postJson<CandidateProfile>("/api/v1/profiles/validate", profile),
  talentCheck: (companyId: string, profile: CandidateProfile) =>
    postJson<TalentCheckResult>(
      `/api/v1/companies/${encodeURIComponent(companyId)}/talent-check`,
      profile,
    ),
  skillMatch: (request: SkillMatchRequest) =>
    postJson<SkillMatchResult>("/api/v1/skill-matches/score", request),
};
