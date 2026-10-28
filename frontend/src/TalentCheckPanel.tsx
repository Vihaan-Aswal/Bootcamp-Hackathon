import { useEffect, useMemo, useState, type FormEvent } from "react";

import {
  api,
  type CandidateProfile,
  type CompanyListResponse,
  type CompanySkillBar,
  type TalentCheckResult,
} from "./lib/api";

type Props = {
  companies: CompanyListResponse;
  profiles: CandidateProfile[];
  selectedProfileId: string | null;
  onProfileChange: (profileId: string | null) => void;
};

function profileLabel(profile: CandidateProfile): string {
  return profile.basic_details.full_name.trim() || profile.basic_details.email;
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : "The Talent Check could not be completed.";
}

function displayResult(result: TalentCheckResult) {
  const missingCategories = result.missing_categories ?? [];
  const orderedRows = [...result.rows].sort(
    (left, right) =>
      Number(right.candidate_level === null) - Number(left.candidate_level === null) ||
      Number(right.gap) - Number(left.gap) ||
      right.gap_size - left.gap_size,
  );
  const met = result.rows.filter((row) => row.candidate_level !== null && !row.gap).length;
  const below = result.rows.filter((row) => row.gap).length;
  const unrated = result.rows.filter((row) => row.candidate_level === null).length;

  return (
    <div className="m4-result">
      {result.status === "incomplete" ? (
        <div className="score-withheld">
          <p className="notice" role="status">
            Incomplete: add self-reported ratings for {missingCategories.length} remaining
            skillset{missingCategories.length === 1 ? "" : "s"}. No readiness score is shown.
          </p>
          <p className="score-arithmetic">
            <span>{met} at or above bar</span>
            <span>{below} below</span>
            <span>{unrated} not rated</span>
          </p>
          <CoverageMeter rows={result.rows} />
        </div>
      ) : (
        <div className="score-stamp">
          <p className="score-arithmetic">
            <span>{met} at or above bar</span>
            <span>{below} below</span>
            <span>{unrated} not rated</span>
          </p>
          <p className="readiness-score" role="status">
            Self-reported readiness indicator: <strong>{result.readiness_score}%</strong>
          </p>
          <CoverageMeter rows={result.rows} />
        </div>
      )}

      <p className="method-note">
        Equal-weighted coverage, capped at each company requirement. Ratings describe candidate
        self-reports; this score is not a hiring outcome or a ready/not-ready decision.
      </p>

      <h3>Skillset gaps</h3>
      <div className="table-scroll">
        <table className="m4-table">
          <caption className="visually-hidden">Company requirement and self-reported level for each skillset</caption>
          <thead>
            <tr>
              <th scope="col">Skillset</th>
              <th scope="col">Company level</th>
              <th scope="col">Self-reported</th>
              <th scope="col">Gap</th>
              <th scope="col">Bloom context</th>
            </tr>
          </thead>
          <tbody>
            {orderedRows.map((row) => (
              <tr key={row.category_code} className={row.gap ? "gap-row" : undefined}>
                <th scope="row" data-label="Skillset">
                  <span>{row.category_name}</span> <code>{row.category_code}</code>
                </th>
                <td data-label="Company level">{row.required_level}</td>
                <td data-label="Self-reported">{row.candidate_level ?? "Not rated"}</td>
                <td data-label="Gap">
                  {row.candidate_level === null
                    ? "Not assessed"
                    : row.gap
                      ? `${row.gap_size} level${row.gap_size === 1 ? "" : "s"} below`
                      : "Meets or exceeds"}
                </td>
                <td data-label="Bloom context">{row.bloom_code ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CoverageMeter({ rows }: { rows: TalentCheckResult["rows"] }) {
  return (
    <div className="coverage-meter" aria-hidden="true">
      {rows.map((row) => (
        <span
          key={row.category_code}
          className={
            row.candidate_level === null
              ? "is-unrated"
              : row.gap
                ? "is-below"
                : "is-met"
          }
        />
      ))}
    </div>
  );
}

export default function TalentCheckPanel({
  companies,
  profiles,
  selectedProfileId,
  onProfileChange,
}: Props) {
  const [companyId, setCompanyId] = useState(companies.companies[0]?.company_id ?? "");
  const [companyBar, setCompanyBar] = useState<CompanySkillBar | null>(null);
  const [barLoading, setBarLoading] = useState(false);
  const [result, setResult] = useState<TalentCheckResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.profile_id === selectedProfileId) ?? null,
    [profiles, selectedProfileId],
  );

  useEffect(() => {
    if (!companyId && companies.companies.length > 0) {
      setCompanyId(companies.companies[0].company_id);
    }
  }, [companies.companies, companyId]);

  useEffect(() => {
    let cancelled = false;
    setCompanyBar(null);
    setResult(null);
    setError(null);
    if (!companyId) return;

    setBarLoading(true);
    api.company(companyId)
      .then((bar) => {
        if (!cancelled) setCompanyBar(bar);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(errorMessage(reason));
      })
      .finally(() => {
        if (!cancelled) setBarLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [companyId]);

  async function runCheck(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProfile || !companyId || !companyBar || busy) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await api.talentCheck(companyId, selectedProfile));
    } catch (reason: unknown) {
      setResult(null);
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="document-panel m4-panel" aria-labelledby="talent-check-title">
      <div className="section-heading">
        <div>
          <h2 id="talent-check-title">Talent Check</h2>
          <p className="section-purpose">Compare saved self-reported ratings with one company's 12-skillset bar.</p>
        </div>
        <span className="status status-info">M4 scoring</span>
      </div>

      {companies.source_status === "provisional_csv_fallback" && (
        <p className="notice" role="note">
          Provisional company snapshot generated from the supplied CSV. It has not been confirmed
          as the official JSON.
        </p>
      )}

      <form className="m4-controls" onSubmit={runCheck}>
        <label className="edit-field">
          Saved profile
          <select
            aria-label="Talent Check profile"
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

        <label className="edit-field">
          Company
          <select
            aria-label="Company"
            value={companyId}
            onChange={(event) => setCompanyId(event.target.value)}
          >
            {companies.companies.map((company) => (
              <option key={company.company_id} value={company.company_id}>
                {company.display_name}
              </option>
            ))}
          </select>
        </label>

        <button type="submit" disabled={!selectedProfile || !companyBar || busy || barLoading}>
          {busy ? "Calculating…" : barLoading ? "Loading company bar…" : "Run Talent Check"}
        </button>
      </form>

      {profiles.length === 0 && (
        <p className="empty-state">Create and save a profile in Profile Builder before running a check.</p>
      )}
      {companyBar && (
        <details className="company-bar-preview">
          <summary>{companyBar.display_name} 12-skillset requirement snapshot</summary>
          <ul className="chips">
            {companyBar.skillsets.map((row) => (
              <li key={row.category_code}>
                <code>{row.category_code}</code> {row.category_name}: {row.required_level}
                {row.bloom_code ? ` · ${row.bloom_code}` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      {result && displayResult(result)}
    </section>
  );
}
