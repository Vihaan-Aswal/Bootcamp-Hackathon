import type { components } from "./api-types";

export type HealthResponse = components["schemas"]["HealthResponse"];
export type CompanyListResponse = components["schemas"]["CompanyListResponse"];
export type SkillCategoryListResponse =
  components["schemas"]["SkillCategoryListResponse"];

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`${path} failed with HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

export const api = {
  health: () => getJson<HealthResponse>("/api/v1/health"),
  companies: () => getJson<CompanyListResponse>("/api/v1/companies"),
  skillCategories: () =>
    getJson<SkillCategoryListResponse>("/api/v1/reference/skill-categories"),
};
