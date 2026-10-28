import { useEffect, useMemo, useState } from "react";

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

function newProfileId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
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
        <div>
          <h1>RADIX Talent Match</h1>
          <p className="subtitle">
            {`M3 profile builder · M4 scoring · contract v${health.contract_version}, skill registry v${health.registry_version}`}
          </p>
        </div>
        {profileRepository.mode === "supabase" && !authRequired && (
          <button type="button" onClick={() => void signOut()}>
            Sign out
          </button>
        )}
      </header>

      {authActionError && <p className="error" role="alert">{authActionError}</p>}

      {warnings.length > 0 && (
        <ul className="warnings">
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}

      <DocumentIntelligence
        provider={health.provider}
        onJdAnalyzed={setJdResult}
        onResumeAccepted={setReviewedResumeSuggestions}
      />

      {authRequired && profileRepository.mode === "supabase" && (
        <section className="cloud-auth-prompt" aria-labelledby="cloud-auth-heading">
          <div>
            <h2 id="cloud-auth-heading">Save profiles to Supabase</h2>
            <p className="muted">
              JD and resume analysis works without signing in. Sign in or create an account to save
              cloud profiles.
            </p>
          </div>
          <SupabaseSignIn onSignIn={signIn} onSignUp={signUp} />
          {authActionError && <p className="error" role="alert">{authActionError}</p>}
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
      />

      <TalentCheckPanel
        companies={companies}
        profiles={profiles}
        selectedProfileId={selectedProfileId}
        onProfileChange={setSelectedProfileId}
      />

      <SkillMatchPanel
        profiles={profiles}
        selectedProfileId={selectedProfileId}
        onProfileChange={setSelectedProfileId}
        jd={jdResult}
      />

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
