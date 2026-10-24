"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, LockKeyhole, Sparkles } from "lucide-react";

export function LoginForm({ configured }: { configured: boolean }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not sign in.");
      window.location.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-wrap">
      <section className="panel login-card" aria-labelledby="login-title">
        <div className="brand-wrap">
          <span className="brand-mark"><Sparkles size={17} aria-hidden="true" /></span>
          <span className="brand-name">Zenti Content Engine</span>
          <span className="prototype-tag">Prototype</span>
        </div>
        <h1 id="login-title">A focused editorial workspace.</h1>
        <p>Sign in to create source-backed content packages and video prompts for your chosen tool.</p>
        {!configured ? (
          <div className="status-message status-error" role="alert">
            Private access is not configured. Add an <code>APP_PASSWORD</code> with at least 12 characters and a <code>SESSION_SECRET</code> with at least 32 characters to your environment.
          </div>
        ) : (
          <form onSubmit={submit}>
            <div className="field">
              <label htmlFor="password">Workspace password</label>
              <input id="password" className="control" type="password" autoComplete="current-password" required maxLength={256} value={password} onChange={(event) => setPassword(event.target.value)} />
            </div>
            {error && <div className="status-message status-error" role="alert">{error}</div>}
            <button className="btn btn-primary" type="submit" disabled={busy || !password}>
              <LockKeyhole size={15} aria-hidden="true" /> {busy ? "Checking…" : "Enter workspace"} {!busy && <ArrowRight size={15} aria-hidden="true" />}
            </button>
          </form>
        )}
        <div className="security-note">Private prototype · API credentials stay on the server · No media is generated or stored here.</div>
      </section>
    </main>
  );
}
