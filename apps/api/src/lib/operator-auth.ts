import "server-only";
import { prisma } from "@barrel/db";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "./supabase/server";
import { supabasePublishableKey, supabaseUrl } from "./supabase/config";

export type OperatorIdentity = {
  operatorId: string;
  authUserId: string;
  email: string;
  displayName?: string;
  role: "ADMIN" | "OPERATOR";
};

export class OperatorAuthError extends Error {
  constructor(readonly status: 401 | 403, message: string) {
    super(message);
  }
}

export async function requireOperator(request?: Request): Promise<OperatorIdentity> {
  const authorization = request?.headers.get("authorization");
  const accessToken = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : undefined;
  const supabase = authorization?.startsWith("Bearer ")
    ? createClient(supabaseUrl(), supabasePublishableKey(), {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { headers: { Authorization: authorization } },
      })
    : await createSupabaseServerClient();
  const { data: claims, error: claimsError } = await supabase.auth.getClaims(accessToken);
  const authUserId = claims?.claims?.sub;
  if (claimsError || typeof authUserId !== "string") throw new OperatorAuthError(401, "Authentication required");

  const { data: user, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !user.user?.email) throw new OperatorAuthError(401, "Authentication required");
  const operator = await prisma.operator.findUnique({ where: { authUserId } });
  if (!operator || operator.status !== "ACTIVE") throw new OperatorAuthError(403, "Operator access required");

  return {
    operatorId: operator.id,
    authUserId,
    email: operator.email,
    ...(operator.displayName ? { displayName: operator.displayName } : {}),
    role: operator.role,
  };
}
