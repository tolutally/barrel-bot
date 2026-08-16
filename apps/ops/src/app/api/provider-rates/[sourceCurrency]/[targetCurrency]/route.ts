import { NextResponse } from "next/server";
import { getAuthorizedOperator } from "../../../../../lib/require-operator";

function apiUrl(path: string): URL {
  const base = process.env.BARREL_API_URL;
  if (!base) throw new Error("BARREL_API_URL is required");
  return new URL(path, base.endsWith("/") ? base : `${base}/`);
}

export async function GET(_request: Request, { params }: { params: Promise<{ sourceCurrency: string; targetCurrency: string }> }): Promise<Response> {
  const auth = await getAuthorizedOperator();
  if ("reason" in auth) return NextResponse.json({ error: auth.reason === "UNAUTHENTICATED" ? "Authentication required" : "Not authorized" }, { status: auth.reason === "UNAUTHENTICATED" ? 401 : 403 });
  const { sourceCurrency, targetCurrency } = await params;
  const response = await fetch(apiUrl(`/api/internal/providers/corridors/${encodeURIComponent(sourceCurrency)}/${encodeURIComponent(targetCurrency)}/rate`), {
    headers: { Authorization: `Bearer ${auth.accessToken}` }, cache: "no-store",
  });
  return new NextResponse(await response.text(), { status: response.status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
