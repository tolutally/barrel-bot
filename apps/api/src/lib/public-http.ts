import { randomUUID } from "node:crypto";
import { InMemoryRateLimiter, parsePublicWebOrigins, PublicApiError, publicCorsHeaders } from "@barrel/public-api";

export const quoteLimiter = new InMemoryRateLimiter(Number(process.env.PUBLIC_QUOTE_RATE_LIMIT ?? "30"));
export const tradeLimiter = new InMemoryRateLimiter(Number(process.env.PUBLIC_TRADE_REQUEST_RATE_LIMIT ?? "10"));

function requestId(request: Request): string {
  const supplied = request.headers.get("x-request-id");
  return supplied && /^[A-Za-z0-9._-]{8,100}$/.test(supplied) ? supplied : randomUUID();
}

export async function publicJsonRoute<T>(input: {
  request: Request;
  endpoint: string;
  status?: number;
  requireJson?: boolean;
  rateLimiter?: InMemoryRateLimiter;
  execute(): Promise<T>;
}): Promise<Response> {
  const started = Date.now();
  const id = requestId(input.request);
  try {
    const headers = publicCorsHeaders(input.request.headers.get("origin"), parsePublicWebOrigins(process.env.PUBLIC_WEB_ORIGINS));
    headers.set("X-Request-ID", id);
    if (input.requireJson && !input.request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
      throw new PublicApiError("INVALID_REQUEST", "Content-Type must be application/json.", 415);
    }
    const forwarded = input.request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    input.rateLimiter?.check(`${input.endpoint}:${forwarded ?? "unknown"}`);
    const body = await input.execute();
    console.info({ requestId: id, endpoint: input.endpoint, durationMs: Date.now() - started, result: "success", origin: "WEB" });
    return Response.json(body, { status: input.status ?? 200, headers });
  } catch (error) {
    const safe = error instanceof PublicApiError ? error : new PublicApiError("INTERNAL_ERROR", "An unexpected error occurred.", 500);
    const headers = new Headers({ "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "X-Request-ID": id });
    console.error({ requestId: id, endpoint: input.endpoint, durationMs: Date.now() - started, result: safe.code, origin: "WEB" });
    return Response.json({ error: { code: safe.code, message: safe.message, requestId: id } }, { status: safe.status, headers });
  }
}
