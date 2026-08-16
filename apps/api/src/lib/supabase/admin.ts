import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseUrl } from "./config";

export function createSupabaseAdminClient() {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error("missing required server environment: SUPABASE_SECRET_KEY");
  return createClient(supabaseUrl(), secret, { auth: { autoRefreshToken: false, persistSession: false } });
}
