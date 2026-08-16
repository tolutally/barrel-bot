"use client";

import { createSupabaseBrowserClient } from "./supabase/browser";

export async function signInOperator(email: string, password: string): Promise<string | null> {
  const { error } = await createSupabaseBrowserClient().auth.signInWithPassword({ email, password });
  return error ? "Invalid email or password." : null;
}

export async function signOutOperator(): Promise<void> {
  await createSupabaseBrowserClient().auth.signOut();
}
