import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabasePublishableKey, supabaseUrl } from "./config";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (values, headers) => {
        try {
          values.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          void headers;
        } catch { /* Proxy refreshes cookies before Server Components render. */ }
      },
    },
  });
}
