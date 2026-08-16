import { NextResponse } from "next/server";
import { createWhatsAppServices } from "../../../../../../lib/whatsapp-service";
import { OperatorAuthError, requireOperator } from "../../../../../../lib/operator-auth";
import { OperatorMessageError } from "../../../../../../lib/operator-message-service";

const MAX_TEXT_LENGTH = 4_096;
const MAX_IDEMPOTENCY_KEY_LENGTH = 200;

export async function POST(request: Request, context: { params: Promise<{ conversationId: string }> }): Promise<Response> {
  try {
    const operator = await requireOperator(request);
    const idempotencyKey = request.headers.get("idempotency-key")?.trim();
    if (!idempotencyKey || idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
      return NextResponse.json({ error: "Idempotency-Key is required" }, { status: 400 });
    }
    let payload: { text?: unknown };
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const text = typeof payload.text === "string" ? payload.text.trim() : "";
    if (!text || text.length > MAX_TEXT_LENGTH) {
      return NextResponse.json({ error: "Text must be between 1 and 4096 characters" }, { status: 400 });
    }
    const { conversationId } = await context.params;
    const result = await createWhatsAppServices().operatorMessages.send({
      conversationId,
      operatorId: operator.operatorId,
      text,
      idempotencyKey,
    });
    return NextResponse.json({
      status: "sent",
      idempotent: result.idempotent,
      sentAt: result.sentAt.toISOString(),
    }, { status: result.idempotent ? 200 : 201 });
  } catch (error) {
    if (error instanceof OperatorAuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof OperatorMessageError) return NextResponse.json({ error: error.code }, { status: error.status });
    throw error;
  }
}
