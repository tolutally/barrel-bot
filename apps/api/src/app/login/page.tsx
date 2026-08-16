"use client";

import { FormEvent, useState } from "react";

export default function LoginPage() {
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(undefined);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/internal/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
    });
    const body = await response.json() as { error?: string };
    if (!response.ok) {
      setError(body.error ?? "Unable to sign in");
      setSubmitting(false);
      return;
    }
    window.location.assign("/ops");
  }

  return <main style={{ maxWidth: 380, margin: "10vh auto", padding: 24 }}>
    <h1>Barrel operator sign in</h1>
    <form onSubmit={signIn}>
      <label>Email<input name="email" type="email" autoComplete="email" required /></label>
      <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
      {error ? <p role="alert">{error}</p> : null}
      <button type="submit" disabled={submitting}>{submitting ? "Signing in…" : "Sign in"}</button>
    </form>
  </main>;
}
