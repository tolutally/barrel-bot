import { NextResponse } from "next/server";
import { getAuthorizedOperator } from "../../../lib/require-operator";

function apiUrl(path: string): URL {
  const base = process.env.BARREL_API_URL;
  if (!base) throw new Error("BARREL_API_URL is required");
  return new URL(path, base.endsWith("/") ? base : `${base}/`);
}

async function proxy(request: Request): Promise<Response> {
  const identity = await getAuthorizedOperator();
  if ("reason" in identity) {
    return NextResponse.json({ error: "Authentication required" }, { status: identity.reason === "UNAUTHENTICATED" ? 401 : 403 });
  }
  const body = await request.text();
  const response = await fetch(apiUrl("/api/internal/push-subscriptions"), {
    method: request.method,
    headers: { Authorization: `Bearer ${identity.accessToken}`, "Content-Type": "application/json" },
    body,
    cache: "no-store",
  });
  return new Response(response.body, { status: response.status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

export async function POST(request: Request): Promise<Response> {
  return proxy(request);
}

export async function DELETE(request: Request): Promise<Response> {
  return proxy(request);
}
