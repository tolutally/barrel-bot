import { NextResponse } from "next/server";
import { createWhatsAppServices } from "../../../../../../lib/whatsapp-service";
import { OperatorAuthError, requireOperator } from "../../../../../../lib/operator-auth";
import { OperatorMessageError } from "../../../../../../lib/operator-message-service";
import { ConversationMediaError, validateConversationMedia } from "../../../../../../lib/conversation-media";

const MAX_TEXT_LENGTH = 4_096;
const MAX_IDEMPOTENCY_KEY_LENGTH = 200;

export async function POST(request: Request, context: { params: Promise<{ conversationId: string }> }): Promise<Response> {
  try {
    const operator = await requireOperator(request);
    const idempotencyKey = request.headers.get("idempotency-key")?.trim();
    if (!idempotencyKey || idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
      return NextResponse.json({ error: "Idempotency-Key is required" }, { status: 400 });
    }
    const isMultipart = request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data") ?? false;
    let text = "";
    let attachment: { bytes: Uint8Array; mimeType: string; fileName: string } | undefined;
    try {
      if (isMultipart) {
        const form = await request.formData();
        text = typeof form.get("text") === "string" ? String(form.get("text")).trim() : "";
        const files = form.getAll("attachment").filter((value): value is File => value instanceof File && value.size > 0);
        if (files.length !== 1) return NextResponse.json({ error: "Exactly one attachment is required" }, { status: 400 });
        const file = files[0]!;
        attachment = { bytes: new Uint8Array(await file.arrayBuffer()), mimeType: file.type, fileName: file.name };
        validateConversationMedia({ bytes: attachment.bytes, claimedMimeType: attachment.mimeType, fileName: attachment.fileName });
      } else {
        const payload = await request.json() as { text?: unknown };
        text = typeof payload.text === "string" ? payload.text.trim() : "";
      }
    } catch (error) {
      if (error instanceof ConversationMediaError) return NextResponse.json({ error: error.code }, { status: 400 });
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    if ((!text && !attachment) || text.length > MAX_TEXT_LENGTH) {
      return NextResponse.json({ error: "A message or attachment is required; captions are limited to 4096 characters" }, { status: 400 });
    }
    const { conversationId } = await context.params;
    const result = await createWhatsAppServices().operatorMessages.send({
      conversationId,
      operatorId: operator.operatorId,
      text,
      idempotencyKey,
      attachment,
    });
    return NextResponse.json({
      status: "sent",
      idempotent: result.idempotent,
      sentAt: result.sentAt.toISOString(),
    }, { status: result.idempotent ? 200 : 201 });
  } catch (error) {
    if (error instanceof OperatorAuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof OperatorMessageError) return NextResponse.json({ error: error.code }, { status: error.status });
    if (error instanceof ConversationMediaError) return NextResponse.json({ error: error.code }, { status: 400 });
    throw error;
  }
}
