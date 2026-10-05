import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { cleanupExpiredConversationMedia } from "../../../../../lib/conversation-media";

function authorized(request: Request): boolean {
  const secret = process.env.MEDIA_CLEANUP_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secret || !supplied || secret.length !== supplied.length) return false;
  return timingSafeEqual(Buffer.from(secret), Buffer.from(supplied));
}

export async function POST(request: Request): Promise<Response> {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const expired = await cleanupExpiredConversationMedia();
  return NextResponse.json({ expired });
}
