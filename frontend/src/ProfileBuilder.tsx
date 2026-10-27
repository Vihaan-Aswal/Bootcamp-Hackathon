import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

import type { ExtractionResult, HealthResponse, SkillCategoryListResponse } from "./lib/api";
import type { components } from "./lib/api-types";
import "./profile-builder.css";

type ContractProfile = components["schemas"]["CandidateProfile"];
type EducationItem = components["schemas"]["EducationItem"];
type ExperienceItem = components["schemas"]["ExperienceItem"];
type ProjectItem = components["schemas"]["ProjectItem"];
type Skill = components["schemas"]["Skill"];
type SkillCategory = components["schemas"]["SkillCategory"];
type CategoryCode = components["schemas"]["CategoryCode"];
type SourceRef = components["schemas"]["SourceRef"];

// The profile schema grows additively: these fields hold the editable resume
// suggestions added to the shared v1 contract alongside education.
export type EditableProfile = ContractProfile & {
  projects?: ProjectItem[];
  experience?: ExperienceItem[];
};

type Props = {
  profiles: EditableProfile[];
  selectedProfileId: string | null;
  onSelect: (profileId: string | null) => void;
  onSave: (profile: EditableProfile) => Promise<void | EditableProfile>;
  onDelete: (profileId: string) => Promise<void>;
  onImport: (jsonText: string) => Promise<EditableProfile>;
  onParseResume: (
    file: File,
    allowExternalProcessing: boolean,
  ) => Promise<ExtractionResult>;
  categories: SkillCategoryListResponse;
  provider: HealthResponse["provider"];
  storageMode: "local" | "supabase" | "unavailable";
};

function makeId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function blankProfile(): EditableProfile {
  const now = new Date().toISOString();
  return {
    schema_version: "1.0.0",
    profile_id: makeId(),
    created_at: now,
    updated_at: now,
    basic_details: { full_name: "", email: "" },
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
}

function displayProfile(profile: EditableProfile): string {
  return profile.basic_details.full_name.trim() || profile.basic_details.email || "Untitled profile";
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : "The request could not be completed.";
}

function normalizeSkillName(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/\s*\+\s*\+/g, "++")
    .replace(/\s*#/g, "#")
    .replace(/[^\p{L}\p{N}+#]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sameText(left: string | null | undefined, right: string | null | undefined): boolean {
  return normalizeSkillName(left ?? "") === normalizeSkillName(right ?? "");
}

function mergeUnique<T>(existing: T[], additions: T[], isDuplicate: (left: T, right: T) => boolean): T[] {
  const merged = [...existing];
  for (const item of additions) {
    if (!merged.some((current) => isDuplicate(current, item))) merged.push(item);
  }
  return merged;
}

export function mergeResumeSuggestions(
  profile: EditableProfile,
  extraction: ExtractionResult,
): EditableProfile {
  const skills = profile.skills ?? [];
  const incomingSkills = extraction.skills ?? [];
  const education = profile.education ?? [];
  const incomingEducation = extraction.education ?? [];
  const projects = profile.projects ?? [];
  const incomingProjects = extraction.projects ?? [];
  const experience = profile.experience ?? [];
  const incomingExperience = extraction.experience ?? [];

  return {
    ...profile,
    skills: mergeUnique(skills, incomingSkills, (left: Skill, right: Skill) => {
      if (left.skill_id && right.skill_id && left.skill_id === right.skill_id) return true;
      return sameText(left.skill_name, right.skill_name);
    }),
    education: mergeUnique(education, incomingEducation, (left: EducationItem, right: EducationItem) =>
      sameText(left.institution, right.institution) &&
      sameText(left.qualification, right.qualification) &&
      sameText(left.field_of_study, right.field_of_study) &&
      (left.start_year ?? null) === (right.start_year ?? null),
    ),
    projects: mergeUnique(projects, incomingProjects, (left: ProjectItem, right: ProjectItem) =>
      sameText(left.name, right.name),
    ),
    experience: mergeUnique(experience, incomingExperience, (left: ExperienceItem, right: ExperienceItem) =>
      sameText(left.employer, right.employer) &&
      sameText(left.title, right.title) &&
      (left.start_year ?? null) === (right.start_year ?? null),
    ),
  };
}

function makeManualSkill(): Skill {
  return {
    skill_name: "",
    skill_id: null,
    category_code: "OTHER",
    evidence: null,
    evidence_status: "manual",
    confidence: "medium",
    requirement_type: null,
    origin: "manual",
    source_ref: null,
  };
}

function markEditedSkill(skill: Skill): Skill {
  if (skill.origin === "manual") return skill;
  return {
    ...skill,
    skill_id: null,
    origin: "manual",
    evidence: null,
    evidence_status: "manual",
    source_ref: null,
  };
}

function blankEducation(): EducationItem {
  return { institution: "", qualification: null, field_of_study: null, start_year: null, end_year: null, evidence: null, source_ref: null };
}

function blankProject(): ProjectItem {
  return { name: "", summary: null, evidence: null, source_ref: null };
}

function blankExperience(): ExperienceItem {
  return { employer: "", title: null, start_year: null, end_year: null, summary: null, evidence: null, source_ref: null };
}

function manualEditEvidenceItem<T extends { evidence?: string | null; source_ref?: SourceRef | null }>(
  item: T,
  changes: Partial<T>,
): T {
  return {
    ...item,
    ...(item.source_ref ? { evidence: null, source_ref: null } : {}),
    ...changes,
  };
}

function SuggestionSource({ item }: { item: { evidence?: string | null; source_ref?: SourceRef | null } }) {
  return (
    <div className="profile-item-meta">
      <span className="profile-origin">{item.source_ref ? "Resume suggestion" : "Manual entry"}</span>
      {item.evidence && <blockquote className="profile-evidence">{item.evidence}</blockquote>}
      {item.source_ref && (
        <span className="muted">
          {item.source_ref.filename}
          {item.source_ref.page ? ` · Page ${item.source_ref.page}` : item.source_ref.paragraph !== null && item.source_ref.paragraph !== undefined ? ` · Paragraph ${item.source_ref.paragraph + 1}` : ""}
        </span>
      )}
    </div>
  );
}

function blankLevel(code: CategoryCode, level: number, note: string): components["schemas"]["SkillsetLevel"] {
  return { category_code: code, level, evidence_note: note.trim() || null, source: "self_reported" };
}

function yearValue(value: string): number | null {
  return value.trim() ? Number(value) : null;
}

export function exportCandidateProfile(profile: EditableProfile): void {
  const payload = new Blob([JSON.stringify(profile, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(payload);
  const link = document.createElement("a");
  link.href = url;
  link.download = "candidate-profile.json";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export default function ProfileBuilder({
  profiles,
  selectedProfileId,
  onSelect,
  onSave,
  onDelete,
  onImport,
  onParseResume,
  categories,
  provider,
  storageMode,
}: Props) {
  const profilesRef = useRef(profiles);
  profilesRef.current = profiles;
  const selectedProfile = profiles.find((profile) => profile.profile_id === selectedProfileId);
  const [draft, setDraft] = useState<EditableProfile>(() => selectedProfile ?? blankProfile());
  const [busy, setBusy] = useState(false);
  const [parseBusy, setParseBusy] = useState(false);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const resumeInput = useRef<HTMLInputElement | null>(null);
  const [externalConsent, setExternalConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const profile = selectedProfileId
      ? profilesRef.current.find((item) => item.profile_id === selectedProfileId)
      : undefined;
    setDraft(profile ?? blankProfile());
    setError(null);
    setMessage(null);
    setResumeFile(null);
    if (resumeInput.current) resumeInput.current.value = "";
    setExternalConsent(false);
  }, [selectedProfileId]);

  const rateableCategories = categories.categories.filter((category) => category.code !== "OTHER");
  const updateDraft = (change: (profile: EditableProfile) => EditableProfile) => {
    setDraft((current) => change(current));
    setError(null);
    setMessage(null);
  };

  function startNewProfile() {
    setDraft(blankProfile());
    setResumeFile(null);
    if (resumeInput.current) resumeInput.current.value = "";
    setExternalConsent(false);
    setError(null);
    setMessage(null);
    onSelect(null);
  }

  function updateRating(category: SkillCategory, rawLevel: string, note?: string) {
    setDraft((profile) => {
      const existing = profile.skillset_levels ?? [];
      const current = existing.find((rating) => rating.category_code === category.code);
      const nextNote = note ?? current?.evidence_note ?? "";
      const next = rawLevel
        ? [
            ...existing.filter((rating) => rating.category_code !== category.code),
            blankLevel(category.code, Number(rawLevel), nextNote),
          ]
        : existing.filter((rating) => rating.category_code !== category.code);
      return { ...profile, skillset_levels: next };
    });
    setError(null);
    setMessage(null);
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = draft.basic_details.full_name.trim();
    const email = draft.basic_details.email.trim();
    if (!name) {
      setError("Enter your full name before saving.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Enter a valid email address before saving.");
      return;
    }

    const incompleteGroup = [
      { entries: (draft.skills ?? []).map((item) => item.skill_name), label: "skill" },
      { entries: (draft.education ?? []).map((item) => item.institution), label: "education" },
      { entries: (draft.projects ?? []).map((item) => item.name), label: "project" },
      { entries: (draft.experience ?? []).map((item) => item.employer), label: "experience" },
      { entries: (draft.hackathons ?? []).map((item) => item.name), label: "hackathon" },
      { entries: (draft.internships ?? []).map((item) => item.employer), label: "internship" },
      { entries: (draft.certifications ?? []).map((item) => item.name), label: "certification" },
    ].find(({ entries }) => entries.some((value) => !value.trim()));
    if (incompleteGroup) {
      setError(`Complete or remove the blank ${incompleteGroup.label} before saving.`);
      return;
    }
    if (draft.cv_filename && draft.cv_filename.length > 255) {
      setError("The resume filename is too long to save in this profile.");
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const saved = {
        ...draft,
        basic_details: { full_name: name, email },
        preferred_roles: (draft.preferred_roles ?? []).map((role) => role.trim()).filter(Boolean),
        updated_at: new Date().toISOString(),
      };
      const persisted = await onSave(saved);
      const nextProfile = persisted ?? saved;
      onSelect(nextProfile.profile_id ?? null);
      setDraft(nextProfile);
      setMessage("Profile saved.");
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function removeProfile() {
    if (!selectedProfileId) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await onDelete(selectedProfileId);
      onSelect(null);
      setDraft(blankProfile());
      setResumeFile(null);
      if (resumeInput.current) resumeInput.current.value = "";
      setExternalConsent(false);
      setMessage("Profile deleted.");
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function importProfile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const imported = await onImport(await file.text());
      onSelect(imported.profile_id ?? null);
      setDraft(imported);
      setMessage("Profile imported and saved.");
    } catch (reason) {
      setError(`Could not import profile: ${errorMessage(reason)}`);
    } finally {
      setBusy(false);
    }
  }

  async function parseResume() {
    if (!resumeFile) return;
    setParseBusy(true);
    setError(null);
    setMessage(null);
    const file = resumeFile;
    updateDraft((profile) => ({ ...profile, cv_filename: file.name }));
    try {
      const extraction = await onParseResume(file, externalConsent);
      if (extraction.source_type !== "resume") {
        throw new Error("The parser returned a job description result instead of resume suggestions.");
      }
      setDraft((profile) => mergeResumeSuggestions(profile, extraction));
      setMessage("Resume suggestions merged. Review every item before saving.");
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setResumeFile(null);
      if (resumeInput.current) resumeInput.current.value = "";
      setExternalConsent(false);
      setParseBusy(false);
    }
  }

  const chosenLevel = (category: SkillCategory) =>
    draft.skillset_levels?.find((rating) => rating.category_code === category.code);

  return (
    <section className="profile-builder" aria-labelledby="profile-builder-heading">
      <div className="profile-builder-heading">
        <div>
          <h2 id="profile-builder-heading">Profile Builder</h2>
          <p className="muted">Edit your profile and your own self-reported skillset ratings.</p>
        </div>
        <span className={`profile-storage-badge profile-storage-${storageMode}`}>
          {storageMode === "supabase"
            ? "Private Supabase storage"
            : storageMode === "local"
              ? "This device only"
              : "Storage setup required"}
        </span>
      </div>

      <div className="profile-toolbar">
        <label className="profile-field">
          <span>Saved profile</span>
          <select
            aria-label="Saved profile"
            value={selectedProfileId ?? ""}
            onChange={(event) => onSelect(event.target.value || null)}
          >
            <option value="">New profile</option>
            {profiles.map((profile) => {
              const profileId = profile.profile_id;
              return profileId ? (
                <option key={profileId} value={profileId}>{displayProfile(profile)}</option>
              ) : null;
            })}
          </select>
        </label>
        <button type="button" onClick={startNewProfile} disabled={busy || parseBusy}>
          New profile
        </button>
        <label className="profile-import-control">
          Import JSON
          <input
            aria-label="Import profile JSON"
            type="file"
            accept=".json,application/json"
            disabled={busy || parseBusy}
            onChange={(event) => {
              void importProfile(event.target.files?.[0]);
              event.currentTarget.value = "";
            }}
          />
        </label>
        {draft.profile_id && (
          <button
            type="button"
            onClick={() => exportCandidateProfile(draft)}
            disabled={busy || parseBusy}
          >
            Export JSON
          </button>
        )}
        {selectedProfileId && (
          <button type="button" className="profile-delete-button" onClick={() => void removeProfile()} disabled={busy || parseBusy}>
            Delete profile
          </button>
        )}
      </div>

      <p className="profile-storage-note" role="note">
        {storageMode === "supabase"
          ? "Profiles are saved to your anonymous Supabase session and protected by row-level ownership rules. Keep an exported JSON backup if you need to move devices."
          : storageMode === "local"
            ? "Supabase is not configured, so profiles are saved in this browser only. Export JSON to keep a portable backup."
            : "Supabase storage is only partly configured. Complete both project values; saves are unavailable until then and will not fall back to this browser."}
      </p>

      {error && <p className="error" role="alert">{error}</p>}
      {message && <p className="profile-success" role="status">{message}</p>}

      <form className="profile-form" onSubmit={(event) => void saveProfile(event)}>
        <fieldset className="profile-fieldset">
          <legend>Basic details</legend>
          <div className="profile-grid two-columns">
            <label className="profile-field">
              <span>Full name</span>
              <input
                aria-label="Full name"
                autoComplete="name"
                maxLength={120}
                required
                value={draft.basic_details.full_name}
                onChange={(event) => updateDraft((profile) => ({
                  ...profile,
                  basic_details: { ...profile.basic_details, full_name: event.target.value },
                }))}
              />
            </label>
            <label className="profile-field">
              <span>Email</span>
              <input
                aria-label="Email"
                autoComplete="email"
                maxLength={254}
                required
                type="email"
                value={draft.basic_details.email}
                onChange={(event) => updateDraft((profile) => ({
                  ...profile,
                  basic_details: { ...profile.basic_details, email: event.target.value },
                }))}
              />
            </label>
          </div>
        </fieldset>

        <fieldset className="profile-fieldset">
          <legend>Resume</legend>
          <p className="muted">Upload a PDF or DOCX to get editable suggestions. Only its filename is kept in your profile; the raw upload is processed for this request.</p>
          {draft.cv_filename && <p className="profile-file-name">Current filename: <strong>{draft.cv_filename}</strong></p>}
          <label className="profile-field">
            <span>Choose resume (PDF or DOCX)</span>
            <input
              aria-label="Choose resume (PDF or DOCX)"
              ref={resumeInput}
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              disabled={parseBusy || busy}
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                setError(null);
                setMessage(null);
                setExternalConsent(false);
                if (file && !/\.(pdf|docx)$/i.test(file.name)) {
                  setResumeFile(null);
                  setError("Choose a PDF or DOCX resume.");
                  event.currentTarget.value = "";
                  return;
                }
                setResumeFile(file);
                if (file) updateDraft((profile) => ({ ...profile, cv_filename: file.name }));
              }}
            />
          </label>

          {provider.external && !provider.resume_processing_allowed ? (
            <p className="notice" role="note">External resume processing is blocked. An administrator must review the selected provider’s current terms before enabling it.</p>
          ) : provider.external ? (
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={externalConsent}
                onChange={(event) => setExternalConsent(event.target.checked)}
                disabled={parseBusy || busy}
              />
              I reviewed the provider’s current terms and consent to send this redacted resume for parsing.
            </label>
          ) : null}

          {!provider.configured && (
            <p className="notice" role="note">The document provider is not configured. You can still edit and save this profile manually.</p>
          )}
          {resumeFile && (
            <button
              type="button"
              onClick={() => void parseResume()}
              disabled={
                parseBusy || busy || !provider.configured ||
                (provider.external && (!provider.resume_processing_allowed || !externalConsent))
              }
            >
              {parseBusy ? "Parsing resume…" : "Parse and merge suggestions"}
            </button>
          )}
        </fieldset>

        <fieldset className="profile-fieldset">
          <legend>Skills</legend>
          <div className="fieldset-actions">
            <button type="button" onClick={() => updateDraft((profile) => ({ ...profile, skills: [...(profile.skills ?? []), makeManualSkill()] }))} disabled={busy || parseBusy}>
              Add skill
            </button>
          </div>
          <p className="muted">Resume suggestions stay editable and include their supporting source. Hand-entered items are marked manual.</p>
          {(draft.skills ?? []).length === 0 ? <p className="muted">No skills added yet.</p> : null}
          <div className="profile-list">
            {(draft.skills ?? []).map((skill, index) => (
              <div className="profile-item-card" key={`${skill.skill_id ?? skill.skill_name}-${index}`}>
                <div className="profile-grid two-columns">
                  <label className="profile-field">
                    <span>Skill</span>
                    <input
                      aria-label={`Skill ${index + 1}`}
                      maxLength={120}
                      value={skill.skill_name}
                      onChange={(event) => updateDraft((profile) => ({
                        ...profile,
                        skills: (profile.skills ?? []).map((item, itemIndex) => itemIndex === index
                          ? { ...markEditedSkill(item), skill_name: event.target.value }
                          : item),
                      }))}
                    />
                  </label>
                  <label className="profile-field">
                    <span>Category</span>
                    <select
                      aria-label={`Category for skill ${index + 1}`}
                      value={skill.category_code}
                      onChange={(event) => updateDraft((profile) => ({
                        ...profile,
                        skills: (profile.skills ?? []).map((item, itemIndex) => itemIndex === index
                          ? { ...markEditedSkill(item), category_code: event.target.value as CategoryCode }
                          : item),
                      }))}
                    >
                      {categories.categories.map((category) => <option key={category.code} value={category.code}>{category.code} · {category.name}</option>)}
                    </select>
                  </label>
                </div>
                <label className="profile-field">
                  <span>Evidence or manual note</span>
                  <textarea
                    aria-label={`Evidence for skill ${index + 1}`}
                    maxLength={1000}
                    value={skill.evidence ?? ""}
                    placeholder="Add a supporting quote or note"
                    onChange={(event) => updateDraft((profile) => ({
                      ...profile,
                      skills: (profile.skills ?? []).map((item, itemIndex) => itemIndex === index
                        ? { ...markEditedSkill(item), evidence: event.target.value || null }
                        : item),
                    }))}
                  />
                </label>
                <div className="profile-item-meta">
                  <span className="profile-origin">{skill.origin === "manual" ? "Manual entry" : `Resume suggestion · ${skill.evidence_status}`}</span>
                  {skill.source_ref && <span className="muted">{skill.source_ref.filename}{skill.source_ref.page ? ` · Page ${skill.source_ref.page}` : skill.source_ref.paragraph !== null && skill.source_ref.paragraph !== undefined ? ` · Paragraph ${skill.source_ref.paragraph + 1}` : ""}</span>}
                  <button type="button" className="profile-remove-button" onClick={() => updateDraft((profile) => ({ ...profile, skills: (profile.skills ?? []).filter((_, itemIndex) => itemIndex !== index) }))} disabled={busy || parseBusy}>Remove</button>
                </div>
              </div>
            ))}
          </div>
        </fieldset>

        <fieldset className="profile-fieldset">
          <legend>Self-reported skillset levels</legend>
          <div className="profile-rating-note">
            <span className="profile-origin">Resume text never sets a rating</span>
          </div>
          <p className="muted">Rate yourself from 1 to 10 using the supplied topic ladder. Every rating is optional in a draft and is your own self-report.</p>
          <div className="rating-list">
            {rateableCategories.map((category) => {
              const rating = chosenLevel(category);
              const selectedLevel = rating?.level;
              return (
                <div className="rating-row" key={category.code}>
                  <div className="rating-title"><strong>{category.code}</strong><span>{category.name}</span></div>
                  <label className="profile-field rating-level">
                    <span>Self-rating (optional)</span>
                    <select
                      aria-label={`${category.name} self-reported rating`}
                      value={selectedLevel ?? ""}
                      onChange={(event) => updateRating(category, event.target.value)}
                    >
                      <option value="">Not rated</option>
                      {Array.from({ length: 10 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}
                    </select>
                  </label>
                  <label className="profile-field rating-note">
                    <span>Optional evidence note</span>
                    <input
                      aria-label={`${category.name} rating note`}
                      maxLength={280}
                      disabled={!rating}
                      value={rating?.evidence_note ?? ""}
                      onChange={(event) => {
                        const value = event.target.value;
                        if (rating) updateRating(category, String(rating.level), value);
                      }}
                      placeholder="What informs your self-rating?"
                    />
                  </label>
                  <details className="level-guide">
                    <summary>View level guide</summary>
                    {category.levels?.length ? (
                      <ol>
                        {category.levels.map((level) => <li key={level.level}><strong>Level {level.level}:</strong> {level.topics?.join(", ") || "No topic description supplied."}</li>)}
                      </ol>
                    ) : <p className="muted">The topic ladder is unavailable for this category.</p>}
                  </details>
                </div>
              );
            })}
          </div>
        </fieldset>

        <CollectionEditor<components["schemas"]["EducationItem"]>
          title="Education"
          values={draft.education ?? []}
          emptyText="No education entries added."
          addLabel="Add education"
          onAdd={() => updateDraft((profile) => ({ ...profile, education: [...(profile.education ?? []), blankEducation()] }))}
          onRemove={(index) => updateDraft((profile) => ({ ...profile, education: (profile.education ?? []).filter((_, itemIndex) => itemIndex !== index) }))}
          onPatch={(index, patch) => updateDraft((profile) => ({ ...profile, education: (profile.education ?? []).map((item, itemIndex) => itemIndex === index ? manualEditEvidenceItem(item, patch) : item) }))}
          busy={busy || parseBusy}
          render={(item, index, patch) => <>
            <label className="profile-field"><span>Institution</span><input aria-label={`Education institution ${index + 1}`} maxLength={200} value={item.institution} onChange={(event) => patch({ institution: event.target.value })} /></label>
            <div className="profile-grid two-columns">
              <label className="profile-field"><span>Qualification</span><input aria-label={`Education qualification ${index + 1}`} maxLength={200} value={item.qualification ?? ""} onChange={(event) => patch({ qualification: event.target.value || null })} /></label>
              <label className="profile-field"><span>Field of study</span><input aria-label={`Education field of study ${index + 1}`} maxLength={200} value={item.field_of_study ?? ""} onChange={(event) => patch({ field_of_study: event.target.value || null })} /></label>
            </div>
            <YearPair startLabel={`Education start year ${index + 1}`} endLabel={`Education end year ${index + 1}`} start={item.start_year ?? null} end={item.end_year ?? null} patch={patch} />
            <SuggestionSource item={item} />
          </>}
        />

        <CollectionEditor<components["schemas"]["ProjectItem"]>
          title="Projects"
          values={draft.projects ?? []}
          emptyText="No projects added."
          addLabel="Add project"
          onAdd={() => updateDraft((profile) => ({ ...profile, projects: [...(profile.projects ?? []), blankProject()] }))}
          onRemove={(index) => updateDraft((profile) => ({ ...profile, projects: (profile.projects ?? []).filter((_, itemIndex) => itemIndex !== index) }))}
          onPatch={(index, patch) => updateDraft((profile) => ({ ...profile, projects: (profile.projects ?? []).map((item, itemIndex) => itemIndex === index ? manualEditEvidenceItem(item, patch) : item) }))}
          busy={busy || parseBusy}
          render={(item, index, patch) => <>
            <label className="profile-field"><span>Project name</span><input aria-label={`Project name ${index + 1}`} maxLength={200} value={item.name} onChange={(event) => patch({ name: event.target.value })} /></label>
            <label className="profile-field"><span>Summary</span><textarea aria-label={`Project summary ${index + 1}`} maxLength={1000} value={item.summary ?? ""} onChange={(event) => patch({ summary: event.target.value || null })} /></label>
            <SuggestionSource item={item} />
          </>}
        />

        <CollectionEditor<components["schemas"]["ExperienceItem"]>
          title="Experience"
          values={draft.experience ?? []}
          emptyText="No experience added."
          addLabel="Add experience"
          onAdd={() => updateDraft((profile) => ({ ...profile, experience: [...(profile.experience ?? []), blankExperience()] }))}
          onRemove={(index) => updateDraft((profile) => ({ ...profile, experience: (profile.experience ?? []).filter((_, itemIndex) => itemIndex !== index) }))}
          onPatch={(index, patch) => updateDraft((profile) => ({ ...profile, experience: (profile.experience ?? []).map((item, itemIndex) => itemIndex === index ? manualEditEvidenceItem(item, patch) : item) }))}
          busy={busy || parseBusy}
          render={(item, index, patch) => <>
            <label className="profile-field"><span>Employer</span><input aria-label={`Experience employer ${index + 1}`} maxLength={200} value={item.employer} onChange={(event) => patch({ employer: event.target.value })} /></label>
            <label className="profile-field"><span>Title</span><input aria-label={`Experience title ${index + 1}`} maxLength={200} value={item.title ?? ""} onChange={(event) => patch({ title: event.target.value || null })} /></label>
            <YearPair startLabel={`Experience start year ${index + 1}`} endLabel={`Experience end year ${index + 1}`} start={item.start_year ?? null} end={item.end_year ?? null} patch={patch} />
            <label className="profile-field"><span>Summary</span><textarea aria-label={`Experience summary ${index + 1}`} maxLength={1000} value={item.summary ?? ""} onChange={(event) => patch({ summary: event.target.value || null })} /></label>
            <SuggestionSource item={item} />
          </>}
        />

        <fieldset className="profile-fieldset">
          <legend>Hackathons</legend>
          <div className="fieldset-actions">
            <button type="button" onClick={() => updateDraft((profile) => ({ ...profile, hackathons: [...(profile.hackathons ?? []), { name: "", summary: null, year: null }] }))} disabled={busy || parseBusy}>Add hackathon</button>
          </div>
          {(draft.hackathons ?? []).length === 0 ? <p className="muted">No hackathons added.</p> : null}
          {(draft.hackathons ?? []).map((entry, index) => (
            <div className="profile-item-card" key={`hackathon-${index}`}>
              <label className="profile-field"><span>Name</span><input aria-label={`Hackathon name ${index + 1}`} maxLength={200} value={entry.name} onChange={(event) => updateDraft((profile) => ({ ...profile, hackathons: (profile.hackathons ?? []).map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item) }))} /></label>
              <label className="profile-field"><span>Summary</span><textarea aria-label={`Hackathon summary ${index + 1}`} maxLength={500} value={entry.summary ?? ""} onChange={(event) => updateDraft((profile) => ({ ...profile, hackathons: (profile.hackathons ?? []).map((item, itemIndex) => itemIndex === index ? { ...item, summary: event.target.value || null } : item) }))} /></label>
              <label className="profile-field"><span>Year</span><input aria-label={`Hackathon year ${index + 1}`} type="number" min={1900} max={2100} value={entry.year ?? ""} onChange={(event) => updateDraft((profile) => ({ ...profile, hackathons: (profile.hackathons ?? []).map((item, itemIndex) => itemIndex === index ? { ...item, year: yearValue(event.target.value) } : item) }))} /></label>
              <button type="button" className="profile-remove-button" onClick={() => updateDraft((profile) => ({ ...profile, hackathons: (profile.hackathons ?? []).filter((_, itemIndex) => itemIndex !== index) }))} disabled={busy || parseBusy}>Remove</button>
            </div>
          ))}
        </fieldset>

        <fieldset className="profile-fieldset">
          <legend>Internships</legend>
          <div className="fieldset-actions">
            <button type="button" onClick={() => updateDraft((profile) => ({ ...profile, internships: [...(profile.internships ?? []), { employer: "", role: null, summary: null, year: null }] }))} disabled={busy || parseBusy}>Add internship</button>
          </div>
          {(draft.internships ?? []).length === 0 ? <p className="muted">No internships added.</p> : null}
          {(draft.internships ?? []).map((entry, index) => (
            <div className="profile-item-card" key={`internship-${index}`}>
              <label className="profile-field"><span>Employer</span><input aria-label={`Internship employer ${index + 1}`} maxLength={200} value={entry.employer} onChange={(event) => updateDraft((profile) => ({ ...profile, internships: (profile.internships ?? []).map((item, itemIndex) => itemIndex === index ? { ...item, employer: event.target.value } : item) }))} /></label>
              <label className="profile-field"><span>Role</span><input aria-label={`Internship role ${index + 1}`} maxLength={200} value={entry.role ?? ""} onChange={(event) => updateDraft((profile) => ({ ...profile, internships: (profile.internships ?? []).map((item, itemIndex) => itemIndex === index ? { ...item, role: event.target.value || null } : item) }))} /></label>
              <label className="profile-field"><span>Summary</span><textarea aria-label={`Internship summary ${index + 1}`} maxLength={500} value={entry.summary ?? ""} onChange={(event) => updateDraft((profile) => ({ ...profile, internships: (profile.internships ?? []).map((item, itemIndex) => itemIndex === index ? { ...item, summary: event.target.value || null } : item) }))} /></label>
              <label className="profile-field"><span>Year</span><input aria-label={`Internship year ${index + 1}`} type="number" min={1900} max={2100} value={entry.year ?? ""} onChange={(event) => updateDraft((profile) => ({ ...profile, internships: (profile.internships ?? []).map((item, itemIndex) => itemIndex === index ? { ...item, year: yearValue(event.target.value) } : item) }))} /></label>
              <button type="button" className="profile-remove-button" onClick={() => updateDraft((profile) => ({ ...profile, internships: (profile.internships ?? []).filter((_, itemIndex) => itemIndex !== index) }))} disabled={busy || parseBusy}>Remove</button>
            </div>
          ))}
        </fieldset>

        <fieldset className="profile-fieldset">
          <legend>Certifications</legend>
          <div className="fieldset-actions">
            <button type="button" onClick={() => updateDraft((profile) => ({ ...profile, certifications: [...(profile.certifications ?? []), { name: "", issuer: null, year: null }] }))} disabled={busy || parseBusy}>Add certification</button>
          </div>
          {(draft.certifications ?? []).length === 0 ? <p className="muted">No certifications added.</p> : null}
          {(draft.certifications ?? []).map((entry, index) => (
            <div className="profile-item-card" key={`certification-${index}`}>
              <label className="profile-field"><span>Certification</span><input aria-label={`Certification name ${index + 1}`} maxLength={200} value={entry.name} onChange={(event) => updateDraft((profile) => ({ ...profile, certifications: (profile.certifications ?? []).map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item) }))} /></label>
              <label className="profile-field"><span>Issuer</span><input aria-label={`Certification issuer ${index + 1}`} maxLength={200} value={entry.issuer ?? ""} onChange={(event) => updateDraft((profile) => ({ ...profile, certifications: (profile.certifications ?? []).map((item, itemIndex) => itemIndex === index ? { ...item, issuer: event.target.value || null } : item) }))} /></label>
              <label className="profile-field"><span>Year</span><input aria-label={`Certification year ${index + 1}`} type="number" min={1900} max={2100} value={entry.year ?? ""} onChange={(event) => updateDraft((profile) => ({ ...profile, certifications: (profile.certifications ?? []).map((item, itemIndex) => itemIndex === index ? { ...item, year: yearValue(event.target.value) } : item) }))} /></label>
              <button type="button" className="profile-remove-button" onClick={() => updateDraft((profile) => ({ ...profile, certifications: (profile.certifications ?? []).filter((_, itemIndex) => itemIndex !== index) }))} disabled={busy || parseBusy}>Remove</button>
            </div>
          ))}
        </fieldset>

        <fieldset className="profile-fieldset">
          <legend>Preferred roles</legend>
          <div className="fieldset-actions">
            <button type="button" onClick={() => updateDraft((profile) => ({ ...profile, preferred_roles: [...(profile.preferred_roles ?? []), ""] }))} disabled={busy || parseBusy}>Add role</button>
          </div>
          {(draft.preferred_roles ?? []).length === 0 ? <p className="muted">No preferred roles added.</p> : null}
          {(draft.preferred_roles ?? []).map((role, index) => (
            <div className="profile-role-row" key={`role-${index}`}>
              <label className="profile-field"><span>Role</span><input aria-label={`Preferred role ${index + 1}`} maxLength={120} value={role} onChange={(event) => updateDraft((profile) => ({ ...profile, preferred_roles: (profile.preferred_roles ?? []).map((item, itemIndex) => itemIndex === index ? event.target.value : item) }))} /></label>
              <button type="button" className="profile-remove-button" onClick={() => updateDraft((profile) => ({ ...profile, preferred_roles: (profile.preferred_roles ?? []).filter((_, itemIndex) => itemIndex !== index) }))} disabled={busy || parseBusy}>Remove</button>
            </div>
          ))}
        </fieldset>

        <div className="profile-submit-row">
          <button type="submit" disabled={busy || parseBusy}>{busy ? "Saving…" : "Save profile"}</button>
          <span className="muted">Missing ratings are allowed here; Talent Check needs all 12 before it can show a score.</span>
        </div>
      </form>
    </section>
  );
}

type CollectionEditorProps<T> = {
  title: string;
  values: T[];
  emptyText: string;
  addLabel: string;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onPatch: (index: number, patch: Partial<T>) => void;
  busy: boolean;
  render: (item: T, index: number, patch: (changes: Partial<T>) => void) => ReactNode;
};

function CollectionEditor<T>({ title, values, emptyText, addLabel, onAdd, onRemove, onPatch, busy, render }: CollectionEditorProps<T>) {
  return (
    <fieldset className="profile-fieldset">
      <legend>{title}</legend>
      <div className="fieldset-actions">
        <button type="button" onClick={onAdd} disabled={busy}>{addLabel}</button>
      </div>
      {values.length === 0 ? <p className="muted">{emptyText}</p> : null}
      <div className="profile-list">
        {values.map((item, index) => (
          <div className="profile-item-card" key={`${title}-${index}`}>
            {render(item, index, (changes) => onPatch(index, changes))}
            <button type="button" className="profile-remove-button" onClick={() => onRemove(index)} disabled={busy}>Remove</button>
          </div>
        ))}
      </div>
    </fieldset>
  );
}

function YearPair<T extends { start_year?: number | null; end_year?: number | null }>({
  startLabel,
  endLabel,
  start,
  end,
  patch,
}: {
  startLabel: string;
  endLabel: string;
  start: number | null;
  end: number | null;
  patch: (changes: Partial<T>) => void;
}) {
  return (
    <div className="profile-grid two-columns">
      <label className="profile-field"><span>Start year</span><input aria-label={startLabel} type="number" min={1900} max={2100} value={start ?? ""} onChange={(event) => patch({ start_year: yearValue(event.target.value) } as Partial<T>)} /></label>
      <label className="profile-field"><span>End year</span><input aria-label={endLabel} type="number" min={1900} max={2100} value={end ?? ""} onChange={(event) => patch({ end_year: yearValue(event.target.value) } as Partial<T>)} /></label>
    </div>
  );
}
