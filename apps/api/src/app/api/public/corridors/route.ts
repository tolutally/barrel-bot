import { parsePublicWebOrigins, publicPreflightResponse } from "@barrel/public-api";
import { createPublicApiService } from "../../../../lib/public-api-service";
import { publicJsonRoute } from "../../../../lib/public-http";

export const runtime = "nodejs";
export function OPTIONS(request: Request): Response {
  return publicPreflightResponse(request, ["GET"], parsePublicWebOrigins(process.env.PUBLIC_WEB_ORIGINS));
}
export function GET(request: Request): Promise<Response> {
  return publicJsonRoute({ request, endpoint: "public_corridors", execute: async () => ({ corridors: await createPublicApiService().listCorridors() }) });
}
