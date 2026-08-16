import "server-only";
import { BarrelInternalApiClient, InternalApiError, type OperatorIdentity } from "./api-client";
import { createSupabaseServerClient } from "./supabase/server";

export async function getAuthorizedOperator(): Promise<{ operator: OperatorIdentity; accessToken: string } | { reason: "UNAUTHENTICATED" | "NOT_AUTHORIZED" }> {
  const supabase = await createSupabaseServerClient();
  const { data: claims, error } = await supabase.auth.getClaims();
  if (error || !claims?.claims?.sub) return { reason: "UNAUTHENTICATED" };
  const { data: session } = await supabase.auth.getSession();
  if (!session.session?.access_token) return { reason: "UNAUTHENTICATED" };
  try {
    return { operator: await new BarrelInternalApiClient(session.session.access_token).me(), accessToken: session.session.access_token };
  } catch (apiError) {
    if (apiError instanceof InternalApiError && (apiError.status === 401 || apiError.status === 403)) return { reason: "NOT_AUTHORIZED" };
    throw apiError;
  }
}
