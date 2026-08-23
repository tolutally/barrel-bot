import { NextResponse } from "next/server";
import { getAuthorizedOperator } from "../../../../lib/require-operator";

function apiUrl(path: string): URL {
  const base = process.env.BARREL_API_URL;
  if (!base) throw new Error("BARREL_API_URL is required");
  return new URL(path, base.endsWith("/") ? base : `${base}/`);
}

export async function POST(): Promise<Response> {
  const identity = await getAuthorizedOperator();
  if ("reason" in identity) {
    return NextResponse.json({ error: "Authentication required" }, { status: identity.reason === "UNAUTHENTICATED" ? 401 : 403 });
  }
  const response = await fetch(apiUrl("/api/internal/push-subscriptions/test"), {
    method: "POST",
    headers: { Authorization: `Bearer ${identity.accessToken}` },
    cache: "no-store",
  });
  return new Response(response.body, { status: response.status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
