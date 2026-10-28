import { useState, type FormEvent } from "react";

type Props = {
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (email: string, password: string) => Promise<boolean>;
};

export default function SupabaseSignIn({ onSignIn, onSignUp }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (creatingAccount) {
        const signedIn = await onSignUp(email, password);
        if (!signedIn) {
          setNotice("Account request received. Check your email to confirm it, then sign in here.");
          setCreatingAccount(false);
          setPassword("");
        }
      } else {
        await onSignIn(email, password);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="auth-panel" aria-labelledby="supabase-sign-in-heading">
      <h2 id="supabase-sign-in-heading">{creatingAccount ? "Create account" : "Sign in"}</h2>
      <p>Use an email and password to save profiles to your RADIX cloud database.</p>
      <form className="auth-form" onSubmit={(event) => void submit(event)}>
        <label className="edit-field" htmlFor="supabase-email">
          Email
          <input
            id="supabase-email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label className="edit-field" htmlFor="supabase-password">
          Password
          <input
            id="supabase-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        {notice && <p role="status">{notice}</p>}
        <button type="submit" disabled={busy}>
          {busy
            ? creatingAccount ? "Creating account…" : "Signing in…"
            : creatingAccount ? "Create account" : "Sign in"}
        </button>
      </form>
      <button
        className="auth-mode-toggle"
        type="button"
        disabled={busy}
        onClick={() => {
          setCreatingAccount((current) => !current);
          setError(null);
          setNotice(null);
        }}
      >
        {creatingAccount ? "Already have an account? Sign in" : "New here? Create an account"}
      </button>
    </section>
  );
}
