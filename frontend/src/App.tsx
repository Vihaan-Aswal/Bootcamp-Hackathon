import { useEffect, useMemo, useState, type MouseEvent } from "react";

import { api } from "./lib/api";
import type { CandidateProfile, ExtractionResult } from "./lib/api";
import DocumentIntelligence from "./DocumentIntelligence";
import ProfileBuilder from "./ProfileBuilder";
import SkillMatchPanel from "./SkillMatchPanel";
import TalentCheckPanel from "./TalentCheckPanel";
import SupabaseSignIn from "./SupabaseSignIn";
import {
  createProfileRepository,
  ProfileAuthenticationRequiredError,
} from "./lib/profileRepository";
import type {
  CompanyListResponse,
  HealthResponse,
  SkillCategoryListResponse,
} from "./lib/api";

const STAGES = [
  { id: "stage-document", number: "01", name: "Document intelligence" },
  { id: "stage-profile", number: "02", name: "Profile Builder" },
  { id: "stage-talent", number: "03", name: "Talent Check" },
  { id: "stage-match", number: "04", name: "Skill Matching" },
] as const;

function newProfileId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function profileLabel(profile: CandidateProfile): string {
  return profile.basic_details.full_name.trim() || profile.basic_details.email || "Untitled profile";
}

export default function App() {
  const profileRepository = useMemo(() => createProfileRepository(api.validateProfile), []);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [companies, setCompanies] = useState<CompanyListResponse | null>(null);
  const [categories, setCategories] = useState<SkillCategoryListResponse | null>(null);
  const [profiles, setProfiles] = useState<CandidateProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [jdResult, setJdResult] = useState<ExtractionResult | null>(null);
  const [reviewedResumeSuggestions, setReviewedResumeSuggestions] =
    useState<ExtractionResult | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [authRequired, setAuthRequired] = useState(profileRepository.mode === "supabase");
  const [authActionError, setAuthActionError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeStage, setActiveStage] = useState<string>(STAGES[0].id);

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

  useEffect(() => {
    let cancelled = false;
    profileRepository
      .loadAll()
      .then((savedProfiles) => {
        if (!cancelled) {
          setProfiles(savedProfiles);
          setAuthRequired(false);
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          if (reason instanceof ProfileAuthenticationRequiredError) {
            setAuthRequired(true);
            setProfileError(null);
            return;
          }
          setProfileError(reason instanceof Error ? reason.message : String(reason));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [profileRepository]);

  useEffect(() => {
    if (!health || typeof IntersectionObserver === "undefined") return;
    const nodes = STAGES.map((stage) => document.getElementById(stage.id)).filter(
      (node): node is HTMLElement => node !== null,
    );
    if (nodes.length === 0) return;
    const observer = new IntersectionObserver(
      () => {
        // Read every stage, not only the entries in this batch: during a smooth
        // scroll the outgoing stage can still be the topmost intersecting one.
        const marker = window.innerHeight * 0.3;
        const current = nodes.reduce(
          (found, node) => (node.getBoundingClientRect().top <= marker ? node : found),
          nodes[0],
        );
        setActiveStage(current.id);
      },
      { rootMargin: "-20% 0px -65% 0px" },
    );
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [health]);

  useEffect(() => {
    const revealActiveTab = () => {
      if (window.innerWidth > 1119) return;
      document
        .querySelector<HTMLAnchorElement>('.rail-nav a[aria-current="step"]')
        ?.scrollIntoView({ block: "nearest", inline: "nearest" });
    };
    revealActiveTab();
    window.addEventListener("resize", revealActiveTab);
    return () => window.removeEventListener("resize", revealActiveTab);
  }, [activeStage]);

  const saveProfile = async (profile: CandidateProfile) => {
    let saved: CandidateProfile;
    try {
      saved = await profileRepository.save(profile);
    } catch (reason) {
      if (reason instanceof ProfileAuthenticationRequiredError) {
        setAuthRequired(true);
        throw new Error("Sign in or create an account before saving profiles to Supabase.");
      }
      throw reason;
    }
    const savedProfileId = saved.profile_id;
    if (!savedProfileId) throw new Error("The validated profile is missing its profile ID.");
    setProfiles((current) => [saved, ...current.filter((item) => item.profile_id !== saved.profile_id)]);
    setSelectedProfileId(savedProfileId);
    setProfileError(null);
    return saved;
  };

  const importProfile = async (jsonText: string) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText) as unknown;
    } catch {
      throw new Error("Choose a valid profile JSON file.");
    }
    const validated = await api.validateProfile(parsed);
    const now = new Date().toISOString();
    const imported: CandidateProfile = {
      ...validated,
      profile_id: newProfileId(),
      created_at: now,
      updated_at: now,
    };
    let saved: CandidateProfile;
    try {
      saved = await profileRepository.save(imported);
    } catch (reason) {
      if (reason instanceof ProfileAuthenticationRequiredError) {
        setAuthRequired(true);
        throw new Error("Sign in or create an account before saving profiles to Supabase.");
      }
      throw reason;
    }
    const savedProfileId = saved.profile_id;
    if (!savedProfileId) throw new Error("The imported profile is missing its profile ID.");
    setProfiles((current) => [saved, ...current.filter((item) => item.profile_id !== saved.profile_id)]);
    setSelectedProfileId(savedProfileId);
    setProfileError(null);
    return saved;
  };

  const deleteProfile = async (profileId: string) => {
    await profileRepository.delete(profileId);
    setProfiles((current) => current.filter((item) => item.profile_id !== profileId));
    if (selectedProfileId === profileId) setSelectedProfileId(null);
    setProfileError(null);
  };

  const signIn = async (email: string, password: string) => {
    if (!profileRepository.signIn) {
      throw new Error("Supabase sign-in is unavailable in browser-only storage mode.");
    }
    const savedProfiles = await profileRepository.signIn(email, password);
    setProfiles(savedProfiles);
    setProfileError(null);
    setAuthActionError(null);
    setAuthRequired(false);
  };

  const signUp = async (email: string, password: string) => {
    if (!profileRepository.signUp) {
      throw new Error("Supabase account creation is unavailable in browser-only storage mode.");
    }
    const result = await profileRepository.signUp(email, password);
    if (result.authenticated) {
      setProfiles(result.profiles);
      setProfileError(null);
      setAuthActionError(null);
      setAuthRequired(false);
    }
    return result.authenticated;
  };

  const signOut = async () => {
    if (!profileRepository.signOut) return;
    try {
      await profileRepository.signOut();
      setProfiles([]);
      setSelectedProfileId(null);
      setAuthRequired(true);
      setAuthActionError(null);
    } catch (reason) {
      setAuthActionError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  function goToStage(event: MouseEvent<HTMLAnchorElement>, stageId: string) {
    event.preventDefault();
    const stage = document.getElementById(stageId);
    if (!stage) return;
    const reduceMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    stage.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    setActiveStage(stageId);
    const heading = stage.querySelector("h2");
    if (heading) {
      heading.setAttribute("tabindex", "-1");
      heading.focus({ preventScroll: true });
    }
  }

  if (error) {
    return (
      <main className="standalone">
        <div className="standalone-mark" aria-hidden="true">R</div>
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
      <main className="standalone">
        <div className="standalone-mark" aria-hidden="true">R</div>
        <h1>RADIX Talent Match</h1>
        <p role="status">Loading foundation data…</p>
      </main>
    );
  }

  const provisional = health.company_data.source_status === "provisional_csv_fallback";
  const warnings = health.warnings ?? [];
  const selectedProfile = profiles.find((profile) => profile.profile_id === selectedProfileId) ?? null;
  const storageLabel =
    profileRepository.mode === "supabase"
      ? "Supabase storage"
      : profileRepository.mode === "local"
        ? "This device only"
        : "Storage unavailable";

  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <div className="app-shell">
        <aside className="rail">
          <div className="rail-brand">
            <span className="monogram" aria-hidden="true">R</span>
            <span className="rail-wordmark">
              <strong>RADIX</strong>
              <span>Talent Match</span>
            </span>
          </div>
          <nav className="rail-nav" aria-label="Workflow stages">
            <ol>
              {STAGES.map((stage) => (
                <li key={stage.id}>
                  <a
                    href={`#${stage.id}`}
                    aria-current={activeStage === stage.id ? "step" : undefined}
                    onClick={(event) => goToStage(event, stage.id)}
                  >
                    <span className="rail-number">{stage.number}</span>
                    <span>{stage.name}</span>
                  </a>
                </li>
              ))}
            </ol>
          </nav>
          <div className="rail-context">
            <p className="overline">In view</p>
            <p><span>JD</span>{jdResult?.filename ?? "No JD analyzed"}</p>
            <p><span>Profile</span>{selectedProfile ? profileLabel(selectedProfile) : "No saved profile"}</p>
          </div>
          <a className="rail-appendix" href="#appendix">System &amp; provenance</a>
        </aside>

        <div className="workspace">
          <header className="masthead">
            <div className="masthead-title">
              <p className="overline">Candidate workbench</p>
              <h1>RADIX Talent Match</h1>
              <p className="masthead-meta">
                {`M3 profile builder · M4 scoring · contract v${health.contract_version}, skill registry v${health.registry_version}`}
              </p>
            </div>
            <div className="masthead-actions">
              <p className="status status-ready">Provider {health.provider.configured ? health.provider.name : "not configured"}</p>
              <p className="status status-info">{storageLabel}</p>
              {profileRepository.mode === "supabase" && !authRequired && (
                <button type="button" className="button-quiet" onClick={() => void signOut()}>
                  Sign out
                </button>
              )}
            </div>
          </header>

          {provisional && (
            <p className="notice provisional-note" role="note">
              Provisional data: company requirements come from the supplied CSV, not the confirmed
              official snapshot. {companies.source_note}
            </p>
          )}

          {authActionError && <p className="error" role="alert">{authActionError}</p>}

          {warnings.length > 0 && (
            <ul className="warnings" aria-label="System warnings">
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}

          <main id="main">
            <div className="stage" id="stage-document">
              <p className="stage-overline"><span>Stage 01</span> · Evidence intake</p>
              <DocumentIntelligence
                provider={health.provider}
                onJdAnalyzed={setJdResult}
                onResumeAccepted={setReviewedResumeSuggestions}
              />
            </div>

            <div className="stage" id="stage-profile">
              <p className="stage-overline"><span>Stage 02</span> · Candidate record</p>

              {authRequired && profileRepository.mode === "supabase" && (
                <section className="cloud-auth-prompt" aria-labelledby="cloud-auth-heading">
                  <div className="cloud-auth-copy">
                    <h2 id="cloud-auth-heading">Save profiles to Supabase</h2>
                    <p className="muted">
                      JD and resume analysis works without signing in. Sign in or create an account
                      to save cloud profiles.
                    </p>
                  </div>
                  <SupabaseSignIn onSignIn={signIn} onSignUp={signUp} />
                </section>
              )}

              {profileError && <p className="error" role="alert">Profile storage: {profileError}</p>}
              <ProfileBuilder
                profiles={profiles}
                selectedProfileId={selectedProfileId}
                onSelect={setSelectedProfileId}
                onSave={saveProfile}
                onDelete={deleteProfile}
                onImport={importProfile}
                onParseResume={(file, allowExternalProcessing) =>
                  api.parseResume(file, allowExternalProcessing)
                }
                reviewedResumeSuggestions={reviewedResumeSuggestions}
                categories={categories}
                provider={health.provider}
                storageMode={profileRepository.mode}
                saveBlockedReason={
                  profileRepository.mode === "supabase" && authRequired
                    ? "Sign in above to save to Supabase."
                    : null
                }
              />
            </div>

            <div className="stage" id="stage-talent">
              <p className="stage-overline"><span>Stage 03</span> · Compare with a company bar</p>
              <TalentCheckPanel
                companies={companies}
                profiles={profiles}
                selectedProfileId={selectedProfileId}
                onProfileChange={setSelectedProfileId}
              />
            </div>

            <div className="stage" id="stage-match">
              <p className="stage-overline"><span>Stage 04</span> · Match against one JD</p>
              <SkillMatchPanel
                profiles={profiles}
                selectedProfileId={selectedProfileId}
                onProfileChange={setSelectedProfileId}
                jd={jdResult}
              />
            </div>
          </main>

          <section className="appendix" id="appendix" aria-labelledby="appendix-heading">
            <p className="stage-overline">Reference</p>
            <h2 id="appendix-heading">System &amp; provenance</h2>
            <p className="muted appendix-intro">
              The evidence behind the screen: contract versions, the provider route, the dataset
              status and the reference tables. Nothing here changes a score.
            </p>

            <details className="appendix-disclosure">
              <summary>Runtime and contract</summary>
              <dl className="fact-list">
                <div><dt>Contract</dt><dd>v{health.contract_version}</dd></div>
                <div><dt>Skill registry</dt><dd>v{health.registry_version}</dd></div>
                <div><dt>Provider route</dt><dd>{(health.provider.route ?? []).join(" → ") || "Not configured"}</dd></div>
                <div><dt>Profile storage</dt><dd>{storageLabel}</dd></div>
                <div><dt>Company dataset</dt><dd>{companies.data_version.slice(0, 12)}…</dd></div>
              </dl>
              <ul className="modules">
                {health.modules.map((module) => (
                  <li key={module.key}>
                    <span className={`status ${module.status === "ready" ? "status-ready" : "status-muted"}`}>
                      {module.status}
                    </span>
                    <strong>{module.name}</strong>
                    <span className="muted">{module.milestone}</span>
                  </li>
                ))}
              </ul>
            </details>

            <details className="appendix-disclosure">
              <summary>Company snapshots ({companies.companies.length})</summary>
              <p className="muted">
                {companies.companies.length} companies · {companies.data_version.slice(0, 12)}…
                {provisional ? " · provisional CSV fallback" : ""}
              </p>
              <ul className="company-list">
                {companies.companies.map((company) => (
                  <li key={company.company_id}>
                    <strong>{company.display_name}</strong>
                    <code>{company.company_id}</code>
                  </li>
                ))}
              </ul>
            </details>

            <details className="appendix-disclosure">
              <summary>The 12 skillsets</summary>
              <ul className="skillset-list">
                {categories.categories.map((category) => (
                  <li key={category.code} title={`${category.levels?.length ?? 0} level descriptions`}>
                    <code>{category.code}</code>
                    <span>{category.name}</span>
                    <span className="muted">{category.levels?.length ?? 0} levels</span>
                  </li>
                ))}
              </ul>
            </details>
          </section>
        </div>
      </div>
    </>
  );
}
