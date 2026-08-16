import { prisma } from "@barrel/db";
import { NextResponse } from "next/server";
import { createSupabaseRouteClient } from "../../../../lib/supabase/route";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  let payload: { email?: unknown; password?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (typeof payload.email !== "string" || typeof payload.password !== "string" || !payload.email || !payload.password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }

  const response = NextResponse.json({ ok: true });
  const supabase = createSupabaseRouteClient(request, response);
  const { data, error } = await supabase.auth.signInWithPassword({ email: payload.email, password: payload.password });
  if (error || !data.user) return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });

  const operator = await prisma.operator.findUnique({ where: { authUserId: data.user.id } });
  if (!operator || operator.status !== "ACTIVE") {
    await supabase.auth.signOut();
    return NextResponse.json({ error: "This account is not authorized for operator access" }, { status: 403 });
  }
  return response;
}
