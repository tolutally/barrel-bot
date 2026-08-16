import "server-only";
import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import { supabasePublishableKey, supabaseUrl } from "./config";

export function createSupabaseRouteClient(request: Request, response: NextResponse) {
  return createServerClient(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll: () => request.headers.get("cookie")?.split(/;\s*/).flatMap((entry) => {
        const separator = entry.indexOf("=");
        return separator > 0 ? [{ name: entry.slice(0, separator), value: entry.slice(separator + 1) }] : [];
      }) ?? [],
      setAll: (cookiesToSet) => cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options)),
    },
  });
}
