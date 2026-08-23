import type { NextRequest } from "next/server";
import { updateSupabaseSession } from "./lib/supabase/update-session";

export function proxy(request: NextRequest) {
  return updateSupabaseSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|site.webmanifest|service-worker.js|web-app-manifest-.*\\.png$).*)"],
};
