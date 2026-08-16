"use client";

import { FormEvent, useState } from "react";
import { signInOperator } from "../lib/browser-auth";

export function LoginForm({ denied }: { denied: boolean }) {
  const [error, setError] = useState(denied ? "This account is not authorized for Barrel Ops." : "");
  const [pending, setPending] = useState(false);
  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError("");
    const form = new FormData(event.currentTarget);
    const signInError = await signInOperator(String(form.get("email") ?? ""), String(form.get("password") ?? ""));
    if (signInError) { setError(signInError); setPending(false); return; }
    window.location.assign("/inbox");
  }
  return <form onSubmit={signIn}><label>Email<input name="email" type="email" autoComplete="email" required /></label><label>Password<input name="password" type="password" autoComplete="current-password" required /></label>{error ? <p role="alert">{error}</p> : null}<button disabled={pending} type="submit">{pending ? "Signing in…" : "Sign in"}</button></form>;
}
