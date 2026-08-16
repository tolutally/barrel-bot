import { PublicApiError } from "./contracts";

export function parsePublicWebOrigins(raw: string | undefined): Set<string> {
  return new Set((raw ?? "").split(",").map((value) => value.trim()).filter(Boolean).map((value) => new URL(value).origin));
}

export function publicCorsHeaders(origin: string | null, allowed: ReadonlySet<string>): Headers {
  if (origin && !allowed.has(origin)) throw new PublicApiError("INVALID_REQUEST", "Origin is not allowed.", 403);
  const headers = new Headers({
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Vary": "Origin",
  });
  if (origin) headers.set("Access-Control-Allow-Origin", origin);
  return headers;
}

export function publicPreflightResponse(request: Request, methods: string[], allowed: ReadonlySet<string>): Response {
  try {
    const headers = publicCorsHeaders(request.headers.get("origin"), allowed);
    headers.set("Access-Control-Allow-Methods", [...methods, "OPTIONS"].join(", "));
    headers.set("Access-Control-Allow-Headers", "Content-Type, Idempotency-Key, X-Request-ID");
    headers.set("Access-Control-Max-Age", "600");
    return new Response(null, { status: 204, headers });
  } catch {
    return new Response(null, { status: 403 });
  }
}

export class InMemoryRateLimiter {
  private readonly entries = new Map<string, number[]>();
  constructor(private readonly limit: number, private readonly windowMs = 60_000, private readonly now = () => Date.now()) {}
  check(key: string): void {
    const threshold = this.now() - this.windowMs;
    const recent = (this.entries.get(key) ?? []).filter((time) => time > threshold);
    if (recent.length >= this.limit) throw new PublicApiError("RATE_LIMITED", "Too many requests. Please try again shortly.", 429);
    recent.push(this.now());
    this.entries.set(key, recent);
  }
}
