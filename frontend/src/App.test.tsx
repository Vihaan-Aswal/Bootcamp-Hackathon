import { render, screen } from "@testing-library/react";
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
  });

  it("renders contract, company and category data from the API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => jsonResponse(bodies[String(input)])),
    );

    render(<App />);

    expect(await screen.findByText(/M2 document intelligence/)).toBeTruthy();
    expect(screen.getByText("Talent Check")).toBeTruthy();
    expect(screen.getByText("Google")).toBeTruthy();
    expect(screen.getByText("COD")).toBeTruthy();
    expect(screen.getByText(/Provisional data/)).toBeTruthy();
  });

  it("tells the user how to start the backend when the API is down", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503 }) as Response));

    render(<App />);

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText(/uv run uvicorn/)).toBeTruthy();
  });
});
