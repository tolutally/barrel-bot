import { NextResponse } from "next/server";
import { getAuthorizedOperator } from "../../../../../lib/require-operator";

function apiUrl(path: string): URL {
  const base = process.env.BARREL_API_URL;
  if (!base) throw new Error("BARREL_API_URL is required");
  return new URL(path, base.endsWith("/") ? base : `${base}/`);
}

export async function POST(request: Request, { params }: { params: Promise<{ conversationId: string }> }): Promise<Response> {
  const auth = await getAuthorizedOperator();
  if ("reason" in auth) return NextResponse.json({ error: "Authentication required" }, { status: auth.reason === "UNAUTHENTICATED" ? 401 : 403 });
  const { conversationId } = await params;
  const contentType = request.headers.get("content-type") ?? "";
  const body = contentType.startsWith("multipart/form-data") ? await request.formData() : await request.text();
  const response = await fetch(apiUrl(`/api/internal/conversations/${encodeURIComponent(conversationId)}/messages`), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${auth.accessToken}`,
      "Idempotency-Key": request.headers.get("idempotency-key") ?? "",
      ...(typeof body === "string" ? { "Content-Type": "application/json" } : {}),
    },
    body,
    cache: "no-store",
  });
  return new NextResponse(await response.text(), { status: response.status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
