import { useEffect, useState } from "react";

import { api } from "./lib/api";
import DocumentIntelligence from "./DocumentIntelligence";
import type {
  CompanyListResponse,
  HealthResponse,
  SkillCategoryListResponse,
} from "./lib/api";

export default function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [companies, setCompanies] = useState<CompanyListResponse | null>(null);
  const [categories, setCategories] = useState<SkillCategoryListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.health(), api.companies(), api.skillCategories()])
      .then(([healthData, companyData, categoryData]) => {
        if (cancelled) return;
        setHealth(healthData);
        setCompanies(companyData);
        setCategories(categoryData);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <main className="app">
        <h1>RADIX Talent Match</h1>
        <p className="error" role="alert">
          The backend is not reachable ({error}). Start it with{" "}
          <code>uv run uvicorn app.main:app --reload</code> from <code>backend/</code>.
        </p>
      </main>
    );
  }

  if (!health || !companies || !categories) {
    return (
      <main className="app">
        <h1>RADIX Talent Match</h1>
        <p>Loading foundation data…</p>
      </main>
    );
  }

  const provisional = health.company_data.source_status === "provisional_csv_fallback";
  const warnings = health.warnings ?? [];

  return (
    <main className="app">
      <header>
        <h1>RADIX Talent Match</h1>
        <p className="subtitle">
          {`M2 document intelligence · contract v${health.contract_version}, skill registry v${health.registry_version}`}
        </p>
      </header>

      {warnings.length > 0 && (
        <ul className="warnings">
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}

      <DocumentIntelligence provider={health.provider} />

      <section>
        <h2>Modules</h2>
        <ul className="modules">
          {health.modules.map((module) => (
            <li key={module.key}>
              <span className={`badge badge-${module.status}`}>{module.status}</span>
              <strong>{module.name}</strong>
              <span className="muted">{module.milestone}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Company snapshots</h2>
        <p className="muted">
          {companies.companies.length} companies · {companies.data_version.slice(0, 12)}…
        </p>
        {provisional && (
          <p className="notice" role="note">
            Provisional data: generated from the supplied company CSV, not the official
            snapshot. {companies.source_note}
          </p>
        )}
        <ul className="cards">
          {companies.companies.map((company) => (
            <li key={company.company_id}>
              <strong>{company.display_name}</strong>
              <span className="muted">{company.company_id}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>The 12 skillsets</h2>
        <ul className="chips">
          {categories.categories.map((category) => (
            <li key={category.code} title={`${category.levels?.length ?? 0} level descriptions`}>
              <code>{category.code}</code> {category.name}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
