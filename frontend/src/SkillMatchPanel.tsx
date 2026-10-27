import { useEffect, useMemo, useState, type FormEvent } from "react";

import {
  api,
  type CandidateProfile,
  type ExtractionResult,
  type MatchConfirmation,
  type PossibleMatch,
  type Skill,
  type SkillMatchResult,
} from "./lib/api";

type Props = {
  profiles: CandidateProfile[];
  selectedProfileId: string | null;
  onProfileChange: (profileId: string | null) => void;
  jd: ExtractionResult | null;
};

function profileLabel(profile: CandidateProfile): string {
  return profile.basic_details.full_name.trim() || profile.basic_details.email;
}

function pairKey(match: Pick<PossibleMatch, "jd_skill_name" | "candidate_skill_name">): string {
  return JSON.stringify([match.jd_skill_name.trim().toLowerCase(), match.candidate_skill_name.trim().toLowerCase()]);
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : "Skill Matching could not be completed.";
}

function SkillList({ title, skills, emptyText }: { title: string; skills: Skill[]; emptyText: string }) {
  return (
    <section className="match-group">
      <h3>{title}</h3>
      {skills.length === 0 ? (
        <p className="muted">{emptyText}</p>
      ) : (
        <ul className="evidence-list">
          {skills.map((skill, index) => (
            <li key={`${skill.skill_id ?? skill.skill_name}-${index}`}>
              <div className="skill-title">
                <strong>{skill.skill_name}</strong>
                <span className="badge">{skill.category_code}</span>
                {skill.requirement_type && <span className="muted">{skill.requirement_type}</span>}
              </div>
              {skill.evidence && <blockquote>{skill.evidence}</blockquote>}
              {skill.source_ref && (
                <p className="muted">
                  {skill.source_ref.filename}
                  {skill.source_ref.page ? ` · Page ${skill.source_ref.page}` : ""}
                  {skill.source_ref.paragraph !== null && skill.source_ref.paragraph !== undefined
                    ? ` · Paragraph ${skill.source_ref.paragraph + 1}`
                    : ""}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ResultView({ result }: { result: SkillMatchResult }) {
  const missingRequired = result.missing_required ?? [];
  const matched = result.matched ?? [];
  const preferred = result.preferred ?? [];
  const mentioned = result.mentioned ?? [];
  const unclear = result.unclear ?? [];
  const evidenceGroups = result.requirement_evidence ?? [];
  return (
    <div className="m4-result" aria-live="polite">
      <SkillList
        title={`Missing required skills (${missingRequired.length})`}
        skills={missingRequired}
        emptyText="No required skills are missing."
      />

      {result.status === "not_scorable" ? (
        <p className="notice" role="status">
          No score: JD Analytics did not identify any evidence-backed required skills for this JD.
        </p>
      ) : (
        <p className="readiness-score" role="status">
          Required-skill match: <strong>{result.match_score}%</strong>
          <span className="muted">
            {` · ${result.distinct_required_skill_count} distinct required skill${result.distinct_required_skill_count === 1 ? "" : "s"}`}
          </span>
        </p>
      )}

      <SkillList
        title={`Matched required skills (${matched.length})`}
        skills={matched}
        emptyText="No required skills are confirmed yet."
      />
      <SkillList title={`Preferred skills (${preferred.length})`} skills={preferred} emptyText="No preferred skills were identified." />
      <SkillList title={`Mentioned skills (${mentioned.length})`} skills={mentioned} emptyText="No additional skills were classified as mentioned." />
      <SkillList title={`Needs-review skills (${unclear.length})`} skills={unclear} emptyText="No unclear skill requirements were identified." />

      {evidenceGroups.length > 0 && (
        <details className="company-bar-preview jd-evidence-preview">
          <summary>JD source evidence ({evidenceGroups.reduce((total, group) => total + group.evidence.length, 0)} quotes)</summary>
          <p className="muted">
            Equivalent requirements count once; this list keeps each source quote and parser location.
            Only exact or normalized evidence is included in scoring.
          </p>
          <ul className="evidence-list">
            {evidenceGroups.map((group) => (
              <li key={group.group_key}>
                <div className="skill-title">
                  <strong>{group.evidence[0]?.skill_name ?? "JD requirement"}</strong>
                  <span className="badge">{group.requirement_type}</span>
                  {group.evidence.length > 1 && <span className="muted">{group.evidence.length} source quotes</span>}
                </div>
                {group.evidence.map((skill, index) => (
                  <div key={`${skill.source_ref?.element_id ?? index}-${index}`}>
                    {skill.evidence && <blockquote>{skill.evidence}</blockquote>}
                    <p className="muted">
                      {skill.source_ref?.filename ?? "Source location unavailable"}
                      {skill.source_ref?.page ? ` · Page ${skill.source_ref.page}` : ""}
                      {skill.source_ref?.paragraph !== null && skill.source_ref?.paragraph !== undefined
                        ? ` · Paragraph ${skill.source_ref.paragraph + 1}`
                        : ""}
                      {` · Evidence ${skill.evidence_status}`}
                    </p>
                  </div>
                ))}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

export default function SkillMatchPanel({
  profiles,
  selectedProfileId,
  onProfileChange,
  jd,
}: Props) {
  const [result, setResult] = useState<SkillMatchResult | null>(null);
  const [suggestions, setSuggestions] = useState<PossibleMatch[]>([]);
  const [decisions, setDecisions] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.profile_id === selectedProfileId) ?? null,
    [profiles, selectedProfileId],
  );

  useEffect(() => {
    setResult(null);
    setSuggestions([]);
    setDecisions({});
    setError(null);
  }, [selectedProfileId, jd?.document_id]);

  async function runMatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProfile || !jd || jd.source_type !== "jd" || busy) return;
    setBusy(true);
    setError(null);
    try {
      const confirmations: MatchConfirmation[] = suggestions.map((suggestion) => ({
        jd_skill_name: suggestion.jd_skill_name,
        candidate_skill_name: suggestion.candidate_skill_name,
        confirmed: decisions[pairKey(suggestion)] === true,
      }));
      const next = await api.skillMatch({
        schema_version: "1.0.0",
        profile: selectedProfile,
        jd,
        confirmations,
      });
      setResult(next);
      setSuggestions((current) => {
        const known = new Set(current.map(pairKey));
        return [...current, ...(next.possible ?? []).filter((item) => !known.has(pairKey(item)))];
      });
    } catch (reason: unknown) {
      setResult(null);
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="document-panel m4-panel" aria-labelledby="skill-match-title">
      <div className="section-heading">
        <div>
          <h2 id="skill-match-title">Skill Matching</h2>
          <p className="muted">Compare a saved profile with one evidence-backed JD Analytics result.</p>
        </div>
        <span className="badge badge-ready">M4</span>
      </div>

      <form className="m4-controls" onSubmit={runMatch}>
        <label className="edit-field">
          Saved profile
          <select
            aria-label="Skill Match profile"
            value={selectedProfileId ?? ""}
            onChange={(event) => onProfileChange(event.target.value || null)}
          >
            <option value="">Choose a saved profile</option>
            {profiles.map((profile) => (
              <option key={profile.profile_id} value={profile.profile_id}>
                {profileLabel(profile)}
              </option>
            ))}
          </select>
        </label>

        <button type="submit" disabled={!selectedProfile || !jd || busy}>
          {busy ? "Matching…" : result ? "Recalculate with review decisions" : "Run Skill Match"}
        </button>
      </form>

      {profiles.length === 0 && (
        <p className="muted">Create and save a profile before matching JD requirements.</p>
      )}
      {!jd ? (
        <p className="muted">Analyze a job description above to load its JD skill list here.</p>
      ) : (
        <p className="muted jd-selection">
          Selected JD: <strong>{jd.filename}</strong> · {jd.skills?.length ?? 0} extracted skill
          {jd.skills?.length === 1 ? "" : "s"}
        </p>
      )}

      {error && <p className="error" role="alert">{error}</p>}
      {result && <ResultView result={result} />}

      {suggestions.length > 0 && (
        <section className="match-group possible-matches" aria-label="Possible fuzzy matches">
          <h3>Possible matches</h3>
          <p className="notice" role="note">
            These fuzzy suggestions do not count in the score unless you confirm an exact pair.
          </p>
          <ul className="suggestion-list">
            {suggestions.map((suggestion) => {
              const key = pairKey(suggestion);
              return (
                <li key={key}>
                  <strong>{suggestion.jd_skill_name}</strong>
                  <span>
                    Possible match: {suggestion.candidate_skill_name} · {Math.round(suggestion.similarity * 100)}% similarity
                  </span>
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      aria-label={`Confirm ${suggestion.candidate_skill_name} as ${suggestion.jd_skill_name}`}
                      checked={decisions[key] === true}
                      onChange={(event) => setDecisions((current) => ({
                        ...current,
                        [key]: event.target.checked,
                      }))}
                    />
                    Confirm this candidate skill for the JD requirement
                  </label>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </section>
  );
}
