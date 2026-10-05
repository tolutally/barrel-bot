"use client";

import { useEffect } from "react";
import { createSupabaseBrowserClient } from "../lib/supabase/browser";

const REFRESH_AHEAD_SECONDS = 120;

/** Refreshes a short-lived access token when an installed mobile app resumes. */
export function SessionLifecycle() {
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let refresh: Promise<unknown> | null = null;

    const refreshIfNeeded = async () => {
      if (document.visibilityState !== "visible" || refresh) return;
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session?.expires_at) return;
      const secondsRemaining = data.session.expires_at - Math.floor(Date.now() / 1000);
      if (secondsRemaining > REFRESH_AHEAD_SECONDS) return;
      refresh = supabase.auth.refreshSession().finally(() => { refresh = null; });
      await refresh;
    };

    const onResume = () => { void refreshIfNeeded(); };
    document.addEventListener("visibilitychange", onResume);
    window.addEventListener("focus", onResume);
    window.addEventListener("online", onResume);
    void refreshIfNeeded();
    return () => {
      document.removeEventListener("visibilitychange", onResume);
      window.removeEventListener("focus", onResume);
      window.removeEventListener("online", onResume);
    };
  }, []);

  return null;
}
