import { parsePublicWebOrigins, publicPreflightResponse } from "@barrel/public-api";
import { createPublicApiService } from "../../../../lib/public-api-service";
import { publicJsonRoute, quoteLimiter } from "../../../../lib/public-http";

export const runtime = "nodejs";
export function OPTIONS(request: Request): Response {
  return publicPreflightResponse(request, ["POST"], parsePublicWebOrigins(process.env.PUBLIC_WEB_ORIGINS));
}
export function POST(request: Request): Promise<Response> {
  return publicJsonRoute({
    request, endpoint: "public_quotes", status: 201, requireJson: true, rateLimiter: quoteLimiter,
    execute: async () => ({ quote: await createPublicApiService().createQuote(await request.json()) }),
  });
}
