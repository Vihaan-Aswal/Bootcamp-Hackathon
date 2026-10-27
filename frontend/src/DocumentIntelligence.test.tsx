import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import DocumentIntelligence, { ExtractionReview } from "./DocumentIntelligence";
import type { ExtractionResult, HealthResponse } from "./lib/api";

const mockProvider: HealthResponse["provider"] = {
  name: "mock",
  configured: true,
  supports_json_schema: false,
  external: false,
  resume_processing_allowed: true,
};

const externalProvider: HealthResponse["provider"] = {
  name: "openrouter",
  configured: true,
  supports_json_schema: true,
  external: true,
  resume_processing_allowed: true,
};

const extraction: ExtractionResult = {
  schema_version: "1.0.0",
  document_id: "11111111-1111-4111-8111-111111111111",
  source_type: "jd",
  filename: "role.docx",
  company: null,
  role: null,
  skills: [
    {
      skill_name: "Python",
      skill_id: "python",
      category_code: "COD",
      evidence: "Python is required for this role.",
      evidence_status: "exact",
      confidence: "high",
      requirement_type: "required",
      origin: "jd",
      source_ref: {
        element_id: "docx-3",
        filename: "role.docx",
        page: null,
        paragraph: 3,
        heading: "Qualifications",
      },
    },
  ],
  education: [],
  projects: [],
  experience: [],
  metadata: {
    provider: "mock",
    model: "local-registry-rules",
    extracted_at: "2026-10-28T10:00:00Z",
    source_format: "docx",
    element_count: 5,
    page_count: null,
    redaction_applied: false,
    warnings: [],
  },
  rejected_claims: [],
};

const resumeExtraction: ExtractionResult = {
  ...extraction,
  source_type: "resume",
  filename: "candidate.docx",
  skills: [{ ...extraction.skills![0], origin: "resume", requirement_type: null }],
  education: [{ institution: "Radix University", qualification: "B.Tech", field_of_study: "CS", start_year: 2020, end_year: 2024 }],
  projects: [{ name: "Talent Match", summary: "A matching tool." }],
  experience: [{ employer: "Example Co", title: "Intern", summary: "Built features." }],
};

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

describe("document intelligence screen", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uploads a JD and displays its evidence and source location", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(extraction));
    const onJdAnalyzed = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<DocumentIntelligence provider={mockProvider} onJdAnalyzed={onJdAnalyzed} />);

    const file = new File(["mock JD text"], "role.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    fireEvent.change(screen.getByLabelText(/Job description \(PDF or DOCX\)/), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Analyze job description" }));

    expect(await screen.findByText("Python is required for this role.")).toBeTruthy();
    expect(onJdAnalyzed).toHaveBeenLastCalledWith(extraction);
    expect(screen.getByText("role.docx · Paragraph 4")).toBeTruthy();
    const [url, options] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/v1/jds/analyze");
    expect((options.body as FormData).get("file")).toBe(file);
  });

  it("requires current-terms opt-in and user consent before external resume upload", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ...extraction, source_type: "resume" }));
    vi.stubGlobal("fetch", fetchMock);
    render(<DocumentIntelligence provider={externalProvider} />);

    fireEvent.click(screen.getByRole("tab", { name: "Resume" }));
    const file = new File(["mock resume text"], "resume.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText(/Resume \(PDF or DOCX\)/), {
      target: { files: [file] },
    });
    const submit = screen.getByRole("button", { name: "Parse resume" });
    expect(submit).toHaveProperty("disabled", true);
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByLabelText(/reviewed the provider’s current terms and consent/i),
    );
    fireEvent.click(submit);

    expect(await screen.findByText("Python is required for this role.")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/v1/resumes/parse");
    expect((options.body as FormData).get("allow_external_processing")).toBe("true");
  });

  it("keeps external resume processing blocked until backend terms review is enabled", () => {
    render(
      <DocumentIntelligence
        provider={{ ...externalProvider, resume_processing_allowed: false }}
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: "Resume" }));

    expect(screen.getByText(/External resume processing is blocked/)).toBeTruthy();
    expect(screen.queryByLabelText(/consent to send this redacted resume/i)).toBeNull();
  });

  it("lets candidates edit, accept, and remove resume suggestions", () => {
    const { rerender } = render(<ExtractionReview result={resumeExtraction} />);

    fireEvent.change(screen.getByLabelText("Edit Python"), { target: { value: "Python 3" } });
    expect(screen.getByLabelText("Accept Python 3")).toHaveProperty("checked", false);
    fireEvent.click(screen.getByLabelText("Accept Python 3"));
    expect(screen.getByText(/1 accepted\./)).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Edit institution Radix University"), {
      target: { value: "Radix Institute" },
    });
    expect(screen.getByLabelText("Edit institution Radix Institute")).toHaveProperty("value", "Radix Institute");
    fireEvent.change(screen.getByLabelText("Edit education end year at Radix Institute"), {
      target: { value: "2025" },
    });
    expect(screen.getByLabelText("Edit education end year at Radix Institute")).toHaveProperty("value", "2025");
    fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[3]);
    expect(screen.queryByLabelText(/Edit employer Example Co/)).toBeNull();

    rerender(
      <ExtractionReview
        result={{
          ...resumeExtraction,
          document_id: "22222222-2222-4222-8222-222222222222",
          skills: [{ ...resumeExtraction.skills![0], skill_name: "SQL", skill_id: "sql" }],
          education: [],
          projects: [],
          experience: [],
        }}
      />,
    );
    expect(screen.getByLabelText("Edit SQL")).toBeTruthy();
    expect(screen.queryByLabelText("Edit Python 3")).toBeNull();
  });
});
