import type { components } from "./api-types";

export type HealthResponse = components["schemas"]["HealthResponse"];
export type CompanyListResponse = components["schemas"]["CompanyListResponse"];
export type SkillCategoryListResponse =
  components["schemas"]["SkillCategoryListResponse"];
export type ExtractionResult = components["schemas"]["ExtractionResult"];

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

export const api = {
  health: () => getJson<HealthResponse>("/api/v1/health"),
  companies: () => getJson<CompanyListResponse>("/api/v1/companies"),
  skillCategories: () =>
    getJson<SkillCategoryListResponse>("/api/v1/reference/skill-categories"),
  analyzeJd: (file: File) => postFile<ExtractionResult>("/api/v1/jds/analyze", file),
  parseResume: (file: File, allowExternalProcessing: boolean) =>
    postFile<ExtractionResult>("/api/v1/resumes/parse", file, allowExternalProcessing),
};
