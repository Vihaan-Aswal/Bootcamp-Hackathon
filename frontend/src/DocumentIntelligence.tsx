import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { ReactNode } from "react";

import { api, type ExtractionResult, type HealthResponse } from "./lib/api";
import type { components } from "./lib/api-types";

type AnalysisMode = "jd" | "resume";
type SkillSuggestion = components["schemas"]["Skill"];
type EducationSuggestion = components["schemas"]["EducationItem"];
type ProjectSuggestion = components["schemas"]["ProjectItem"];
type ExperienceSuggestion = components["schemas"]["ExperienceItem"];

type ReviewItem<T> = {
  id: string;
  accepted: boolean;
  value: T;
};

function reviewItems<T>(values: T[], prefix: string): ReviewItem<T>[] {
  return values.map((value, index) => ({ id: `${prefix}-${index}`, accepted: false, value }));
}

function sourceLocation(result: ExtractionResult, page?: number | null, paragraph?: number | null) {
  const place = page ? `Page ${page}` : paragraph !== null && paragraph !== undefined ? `Paragraph ${paragraph + 1}` : "Source text";
  return `${result.filename} · ${place}`;
}

function fileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type RequirementType = "required" | "preferred" | "mentioned" | "unclear";

export function ExtractionReview({
  result,
  onJdUpdated,
  onResumeAccepted,
}: {
  result: ExtractionResult;
  onJdUpdated?: (result: ExtractionResult) => void;
  onResumeAccepted?: (result: ExtractionResult) => void;
}) {
  const skills = result.skills ?? [];
  const education = result.education ?? [];
  const projects = result.projects ?? [];
  const experience = result.experience ?? [];
  const rejectedClaims = result.rejected_claims ?? [];
  const warnings = result.metadata.warnings ?? [];

  return (
    <section aria-label="Extraction results" className="extraction-results">
      <div className="result-heading">
        <div>
          <h3>{result.source_type === "jd" ? "JD analysis" : "Resume suggestions"}</h3>
          <p className="muted">
            {result.filename} · {skills.length} evidence-backed skill
            {skills.length === 1 ? "" : "s"} · {result.metadata.provider}
            {result.metadata.model ? ` / ${result.metadata.model}` : ""}
          </p>
        </div>
        <span className="status status-ready">Evidence checked</span>
      </div>

      {result.metadata.redaction_applied && (
        <p className="notice" role="note">
          Name, email and phone patterns were removed before the external provider request.
        </p>
      )}

      {warnings.map((warning) => (
        <p className="notice" key={warning} role="note">
          {warning}
        </p>
      ))}

      {result.source_type === "jd" && skills.length > 0 ? (
        <>
        <p className="muted requirement-review-note">
          Review each label against its quoted evidence. Only skills you confirm as required count
          toward Skill Match scoring.
        </p>
        <ul className="evidence-list">
          {skills.map((skill, index) => (
            <li key={`${skill.skill_id ?? skill.skill_name}-${index}`}>
              <div className="skill-title">
                <strong>{skill.skill_name}</strong>
                <span className="code-chip">{skill.category_code}</span>
              </div>
              <label className="requirement-review-control">
                Requirement classification
                <select
                  aria-label={`Requirement classification for ${skill.skill_name}`}
                  value={skill.requirement_type ?? "unclear"}
                  onChange={(event) => {
                    const requirementType = event.target.value as RequirementType;
                    onJdUpdated?.({
                      ...result,
                      skills: skills.map((item, itemIndex) => itemIndex === index
                        ? { ...item, requirement_type: requirementType }
                        : item,
                      ),
                    });
                  }}
                >
                  <option value="required">Required</option>
                  <option value="preferred">Preferred</option>
                  <option value="mentioned">Mentioned</option>
                  <option value="unclear">Unclear</option>
                </select>
              </label>
              <blockquote>{skill.evidence}</blockquote>
              <p className="source-line">
                {skill.source_ref
                  ? sourceLocation(result, skill.source_ref.page, skill.source_ref.paragraph)
                  : "Source location unavailable"}
              </p>
            </li>
          ))}
        </ul>
        </>
      ) : result.source_type === "jd" ? (
        <p className="muted">No skill claims had verifiable supporting text.</p>
      ) : null}

      {result.source_type === "resume" && (
        <ResumeSuggestionReview
          key={result.document_id}
          result={result}
          skills={skills}
          education={education}
          projects={projects}
          experience={experience}
          onAccept={onResumeAccepted}
        />
      )}

      {rejectedClaims.length > 0 && (
        <details className="rejected-claims">
          <summary>{rejectedClaims.length} claim(s) need review</summary>
          <ul className="suggestion-list">
            {rejectedClaims.map((claim, index) => (
              <li key={`${claim.claim}-${index}`}>
                <strong>{claim.claim}</strong>
                <span>{claim.reason}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function ResumeSuggestionReview({
  result,
  skills: initialSkills,
  education: initialEducation,
  projects: initialProjects,
  experience: initialExperience,
  onAccept,
}: {
  result: ExtractionResult;
  skills: SkillSuggestion[];
  education: EducationSuggestion[];
  projects: ProjectSuggestion[];
  experience: ExperienceSuggestion[];
  onAccept?: (result: ExtractionResult) => void;
}) {
  const [skills, setSkills] = useState(() => reviewItems(initialSkills, "skill"));
  const [education, setEducation] = useState(() => reviewItems(initialEducation, "education"));
  const [projects, setProjects] = useState(() => reviewItems(initialProjects, "project"));
  const [experience, setExperience] = useState(() => reviewItems(initialExperience, "experience"));
  const acceptedCount = [skills, education, projects, experience]
    .reduce((sum, items) => sum + items.filter((item) => item.accepted).length, 0);

  return (
    <div className="resume-sections" aria-label="Editable resume suggestions">
      <p className="muted review-summary">
        Edit suggestions, accept the facts to keep, or remove anything that does not belong.
        {` ${acceptedCount} accepted. Evidence quotes and locations stay tied to the original document after edits.`}
      </p>
      {onAccept && (
        <button
          type="button"
          disabled={acceptedCount === 0}
          onClick={() => onAccept({
            ...result,
            skills: skills.filter((item) => item.accepted).map((item) => item.value),
            education: education.filter((item) => item.accepted).map((item) => item.value),
            projects: projects.filter((item) => item.accepted).map((item) => item.value),
            experience: experience.filter((item) => item.accepted).map((item) => item.value),
          })}
        >
          Merge accepted suggestions into Profile Builder
        </button>
      )}
      <SuggestionSection title="Skill suggestions" emptyText="No supported skills were found." hasItems={skills.length > 0}>
        {skills.map(({ id, accepted, value }) => (
          <li key={id}>
            <div className="review-controls">
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  aria-label={`Accept ${value.skill_name}`}
                  checked={accepted}
                  onChange={(event) => setSkills((items) => items.map((item) =>
                    item.id === id ? { ...item, accepted: event.target.checked } : item,
                  ))}
                />
                Accept
              </label>
              <button type="button" aria-label={`Remove skill ${value.skill_name}`} onClick={() => setSkills((items) => items.filter((item) => item.id !== id))}>
                Remove
              </button>
            </div>
            <label className="edit-field">
              Skill
              <input
                value={value.skill_name}
                aria-label={`Edit ${value.skill_name}`}
                onChange={(event) => setSkills((items) => items.map((item) => item.id === id
                  ? { ...item, accepted: false, value: {
                    ...item.value,
                    skill_name: event.target.value,
                    skill_id: null,
                    category_code: "OTHER",
                    evidence_status: "unverified",
                  } }
                  : item,
                ))}
              />
            </label>
            <span className="skill-meta"><span className="code-chip">{value.category_code}</span> {value.requirement_type ?? "Resume skill"}</span>
            {value.evidence && <blockquote>{value.evidence}</blockquote>}
            {value.source_ref && (
              <span className="source-line">{sourceLocation(result, value.source_ref.page, value.source_ref.paragraph)}</span>
            )}
          </li>
        ))}
      </SuggestionSection>

      <SuggestionSection title="Education suggestions" emptyText="No education suggestions were found." hasItems={education.length > 0}>
        {education.map(({ id, accepted, value }) => (
          <li key={id}>
            <div className="review-controls">
              <label className="checkbox-row">
                <input type="checkbox" aria-label={`Accept education ${value.institution}`} checked={accepted}
                  onChange={(event) => setEducation((items) => items.map((item) =>
                    item.id === id ? { ...item, accepted: event.target.checked } : item,
                  ))} />
                Accept
              </label>
              <button type="button" aria-label={`Remove education ${value.institution}`} onClick={() => setEducation((items) => items.filter((item) => item.id !== id))}>
                Remove
              </button>
            </div>
            <label className="edit-field">Institution
              <input aria-label={`Edit institution ${value.institution}`} value={value.institution}
                onChange={(event) => setEducation((items) => items.map((item) => item.id === id
                  ? { ...item, accepted: false, value: { ...item.value, institution: event.target.value } }
                  : item,
                ))} />
            </label>
            <label className="edit-field">Qualification
              <input aria-label={`Edit qualification for ${value.institution}`} value={value.qualification ?? ""}
                onChange={(event) => setEducation((items) => items.map((item) => item.id === id
                  ? { ...item, accepted: false, value: { ...item.value, qualification: event.target.value || null } }
                  : item,
                ))} />
            </label>
            <label className="edit-field">Field of study
              <input aria-label={`Edit field of study for ${value.institution}`} value={value.field_of_study ?? ""}
                onChange={(event) => setEducation((items) => items.map((item) => item.id === id
                  ? { ...item, accepted: false, value: { ...item.value, field_of_study: event.target.value || null } }
                  : item,
                ))} />
            </label>
            <div className="year-fields">
              <label className="edit-field">Start year
                <input type="number" min="1900" max="2100" aria-label={`Edit education start year at ${value.institution}`}
                  value={value.start_year ?? ""}
                  onChange={(event) => setEducation((items) => items.map((item) => item.id === id
                    ? { ...item, accepted: false, value: { ...item.value, start_year: event.target.value ? Number(event.target.value) : null } }
                    : item,
                  ))} />
              </label>
              <label className="edit-field">End year
                <input type="number" min="1900" max="2100" aria-label={`Edit education end year at ${value.institution}`}
                  value={value.end_year ?? ""}
                  onChange={(event) => setEducation((items) => items.map((item) => item.id === id
                    ? { ...item, accepted: false, value: { ...item.value, end_year: event.target.value ? Number(event.target.value) : null } }
                    : item,
                  ))} />
              </label>
            </div>
            {value.evidence && <blockquote>{value.evidence}</blockquote>}
            {value.source_ref && <span className="source-line">{sourceLocation(result, value.source_ref.page, value.source_ref.paragraph)}</span>}
          </li>
        ))}
      </SuggestionSection>

      <SuggestionSection title="Project suggestions" emptyText="No project suggestions were found." hasItems={projects.length > 0}>
        {projects.map(({ id, accepted, value }) => (
          <li key={id}>
            <div className="review-controls">
              <label className="checkbox-row">
                <input type="checkbox" aria-label={`Accept project ${value.name}`} checked={accepted}
                  onChange={(event) => setProjects((items) => items.map((item) =>
                    item.id === id ? { ...item, accepted: event.target.checked } : item,
                  ))} />
                Accept
              </label>
              <button type="button" aria-label={`Remove project ${value.name}`} onClick={() => setProjects((items) => items.filter((item) => item.id !== id))}>
                Remove
              </button>
            </div>
            <label className="edit-field">Project name
              <input aria-label={`Edit project ${value.name}`} value={value.name}
                onChange={(event) => setProjects((items) => items.map((item) => item.id === id
                  ? { ...item, accepted: false, value: { ...item.value, name: event.target.value } }
                  : item,
                ))} />
            </label>
            <label className="edit-field">Summary
              <textarea aria-label={`Edit summary for ${value.name}`} value={value.summary ?? ""}
                onChange={(event) => setProjects((items) => items.map((item) => item.id === id
                  ? { ...item, accepted: false, value: { ...item.value, summary: event.target.value || null } }
                  : item,
                ))} />
            </label>
            {value.evidence && <blockquote>{value.evidence}</blockquote>}
            {value.source_ref && <span className="source-line">{sourceLocation(result, value.source_ref.page, value.source_ref.paragraph)}</span>}
          </li>
        ))}
      </SuggestionSection>

      <SuggestionSection title="Experience suggestions" emptyText="No experience suggestions were found." hasItems={experience.length > 0}>
        {experience.map(({ id, accepted, value }) => (
          <li key={id}>
            <div className="review-controls">
              <label className="checkbox-row">
                <input type="checkbox" aria-label={`Accept experience ${value.employer}`} checked={accepted}
                  onChange={(event) => setExperience((items) => items.map((item) =>
                    item.id === id ? { ...item, accepted: event.target.checked } : item,
                  ))} />
                Accept
              </label>
              <button type="button" aria-label={`Remove experience ${value.employer}`} onClick={() => setExperience((items) => items.filter((item) => item.id !== id))}>
                Remove
              </button>
            </div>
            <label className="edit-field">Employer
              <input aria-label={`Edit employer ${value.employer}`} value={value.employer}
                onChange={(event) => setExperience((items) => items.map((item) => item.id === id
                  ? { ...item, accepted: false, value: { ...item.value, employer: event.target.value } }
                  : item,
                ))} />
            </label>
            <label className="edit-field">Title
              <input aria-label={`Edit title at ${value.employer}`} value={value.title ?? ""}
                onChange={(event) => setExperience((items) => items.map((item) => item.id === id
                  ? { ...item, accepted: false, value: { ...item.value, title: event.target.value || null } }
                  : item,
                ))} />
            </label>
            <div className="year-fields">
              <label className="edit-field">Start year
                <input type="number" min="1900" max="2100" aria-label={`Edit experience start year at ${value.employer}`}
                  value={value.start_year ?? ""}
                  onChange={(event) => setExperience((items) => items.map((item) => item.id === id
                    ? { ...item, accepted: false, value: { ...item.value, start_year: event.target.value ? Number(event.target.value) : null } }
                    : item,
                  ))} />
              </label>
              <label className="edit-field">End year
                <input type="number" min="1900" max="2100" aria-label={`Edit experience end year at ${value.employer}`}
                  value={value.end_year ?? ""}
                  onChange={(event) => setExperience((items) => items.map((item) => item.id === id
                    ? { ...item, accepted: false, value: { ...item.value, end_year: event.target.value ? Number(event.target.value) : null } }
                    : item,
                  ))} />
              </label>
            </div>
            <label className="edit-field">Summary
              <textarea aria-label={`Edit experience summary at ${value.employer}`} value={value.summary ?? ""}
                onChange={(event) => setExperience((items) => items.map((item) => item.id === id
                  ? { ...item, accepted: false, value: { ...item.value, summary: event.target.value || null } }
                  : item,
                ))} />
            </label>
            {value.evidence && <blockquote>{value.evidence}</blockquote>}
            {value.source_ref && <span className="source-line">{sourceLocation(result, value.source_ref.page, value.source_ref.paragraph)}</span>}
          </li>
        ))}
      </SuggestionSection>
    </div>
  );
}

function SuggestionSection({
  title,
  emptyText,
  hasItems,
  children,
}: {
  title: string;
  emptyText: string;
  hasItems: boolean;
  children: ReactNode;
}) {
  return (
    <section>
      <h4>{title}</h4>
      {hasItems ? <ul className="suggestion-list">{children}</ul> : <p className="muted">{emptyText}</p>}
    </section>
  );
}

export default function DocumentIntelligence({
  provider,
  onJdAnalyzed,
  onResumeAccepted,
}: {
  provider: HealthResponse["provider"];
  onJdAnalyzed?: (result: ExtractionResult | null) => void;
  onResumeAccepted?: (result: ExtractionResult) => void;
}) {
  const [mode, setMode] = useState<AnalysisMode>("jd");
  const tabRefs = useRef<Record<AnalysisMode, HTMLButtonElement | null>>({ jd: null, resume: null });
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);

  const isExternalResume = mode === "resume" && provider.external;
  const isExternalJd = mode === "jd" && provider.external;
  const resumeTermsReviewed = provider.configured && provider.resume_processing_allowed;
  const jdTermsReviewed = provider.configured && provider.jd_processing_allowed;
  const processingBlocked =
    (isExternalResume && !resumeTermsReviewed) || (isExternalJd && !jdTermsReviewed);
  const consentRequired =
    (isExternalResume && resumeTermsReviewed) || (isExternalJd && jdTermsReviewed);
  const canSubmit = Boolean(
    file && provider.configured && !busy && !processingBlocked && (!consentRequired || consent),
  );

  function chooseMode(nextMode: AnalysisMode) {
    setMode(nextMode);
    setFile(null);
    setResult(null);
    setError(null);
    setConsent(false);
  }

  function moveTabFocus(event: KeyboardEvent<HTMLButtonElement>) {
    const order: AnalysisMode[] = ["jd", "resume"];
    const current = order.indexOf(mode);
    let next = current;
    if (event.key === "ArrowRight") next = (current + 1) % order.length;
    else if (event.key === "ArrowLeft") next = (current - 1 + order.length) % order.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = order.length - 1;
    else return;
    event.preventDefault();
    tabRefs.current[order[next]]?.focus();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !canSubmit) return;
    setBusy(true);
    setError(null);
    setResult(null);
    if (mode === "jd") onJdAnalyzed?.(null);
    try {
      const extracted = mode === "jd"
        ? await api.analyzeJd(file, consent)
        : await api.parseResume(file, consent);
      setResult(extracted);
      if (extracted.source_type === "jd") onJdAnalyzed?.(extracted);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "The document could not be analyzed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="document-panel" aria-labelledby="document-intelligence-title">
      <div className="section-heading">
        <div>
          <h2 id="document-intelligence-title">Document intelligence</h2>
          <p className="section-purpose">Analyze one job description or review editable resume suggestions.</p>
        </div>
        <span className={`status ${provider.configured ? "status-ready" : "status-review"}`}>
          {provider.configured ? `Provider ${provider.name}` : "Provider not configured"}
        </span>
      </div>

      <div
        className="mode-tabs"
        role="tablist"
        aria-label="Document type"
      >
        <button
          type="button"
          role="tab"
          id="document-tab-jd"
          aria-selected={mode === "jd"}
          aria-controls="document-tab-panel"
          tabIndex={mode === "jd" ? 0 : -1}
          ref={(node) => { tabRefs.current.jd = node; }}
          onClick={() => chooseMode("jd")}
          onKeyDown={moveTabFocus}
        >
          Job description
        </button>
        <button
          type="button"
          role="tab"
          id="document-tab-resume"
          aria-selected={mode === "resume"}
          aria-controls="document-tab-panel"
          tabIndex={mode === "resume" ? 0 : -1}
          ref={(node) => { tabRefs.current.resume = node; }}
          onClick={() => chooseMode("resume")}
          onKeyDown={moveTabFocus}
        >
          Resume
        </button>
      </div>

      <div
        className="mode-panel"
        id="document-tab-panel"
        role="tabpanel"
        aria-labelledby={mode === "jd" ? "document-tab-jd" : "document-tab-resume"}
      >
        <form className="upload-form" onSubmit={submit} aria-busy={busy}>
          <label className="file-field" htmlFor="document-file">
            <span className="file-field-copy">
              <strong>{mode === "jd" ? "Job description" : "Resume"} (PDF or DOCX)</strong>
              <span className="muted">
                {file
                  ? `${file.name} · ${fileSize(file.size)} · ready to analyze`
                  : "Choose a file. PDF or DOCX only."}
              </span>
            </span>
            <input
              id="document-file"
              aria-label={mode === "jd" ? "Job description (PDF or DOCX)" : "Resume (PDF or DOCX)"}
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setResult(null);
                setError(null);
                if (mode === "jd") onJdAnalyzed?.(null);
              }}
            />
          </label>

          {isExternalResume && (
            <div className="privacy-block">
              {!resumeTermsReviewed ? (
                <p className="notice" role="note">
                  External resume processing is blocked. An administrator must review the current
                  terms for every provider in this route before enabling it.
                </p>
              ) : (
                <>
                  <ProviderSummary provider={provider} />
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={consent}
                      onChange={(event) => setConsent(event.target.checked)}
                      disabled={!resumeTermsReviewed}
                    />
                    I reviewed this route’s current terms and consent that the redacted resume may be
                    sent to each listed provider in order until one returns a valid result.
                  </label>
                </>
              )}
            </div>
          )}

          {isExternalJd && (
            <div className="privacy-block">
              {!jdTermsReviewed ? (
                <p className="notice" role="note">
                  External job-description processing is blocked until an administrator reviews the
                  current terms for every provider in this route.
                </p>
              ) : (
                <>
                  <ProviderSummary provider={provider} />
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={consent}
                      onChange={(event) => setConsent(event.target.checked)}
                    />
                    I reviewed this route’s current terms and consent that the job description may be
                    sent to each listed provider in order until one returns a valid result.
                  </label>
                </>
              )}
            </div>
          )}

          {!provider.configured && (
            <p className="notice" role="note">
              Configure an available backend provider to analyze documents. The default local mock
              mode works without credentials.
            </p>
          )}
          <p className="muted privacy-note">
            Uploads are processed for this request only. The app does not save raw document files.
          </p>
          <button type="submit" disabled={!canSubmit}>
            {busy ? "Analyzing…" : mode === "jd" ? "Analyze job description" : "Parse resume"}
          </button>
        </form>

        {busy && (
          <p className="work-state" role="status">
            {mode === "jd" ? "Analyzing the job description" : "Parsing the resume"} and checking
            every claim against its source. The result will appear here.
          </p>
        )}
        {error && <p className="error" role="alert">{error}</p>}
        {!result && !busy && !error && (
          <p className="empty-state">
            No document analyzed yet. The extracted skills, quotes and source locations will appear
            here — and nothing is saved until you choose to use it.
          </p>
        )}
        {result && (
          <ExtractionReview
            result={result}
            onJdUpdated={(updated) => {
              setResult(updated);
              onJdAnalyzed?.(updated);
            }}
            onResumeAccepted={onResumeAccepted}
          />
        )}
      </div>
    </section>
  );
}

function ProviderSummary({ provider }: { provider: HealthResponse["provider"] }) {
  const route = provider.route ?? [];
  return (
    <div className="provider-summary">
      <p>
        Processing route: <strong>{provider.name}</strong>
        {route.length > 1 ? ` · ${route.length} providers in order` : ""}
      </p>
      {route.length > 1 && (
        <details>
          <summary>View provider order and model IDs</summary>
          <ol>
            {route.map((entry) => <li key={entry}><code>{entry}</code></li>)}
          </ol>
        </details>
      )}
    </div>
  );
}
