import { NextResponse } from "next/server";
import { createWhatsAppServices } from "../../../../../../lib/whatsapp-service";
import { OperatorAuthError, requireOperator } from "../../../../../../lib/operator-auth";

export async function POST(request: Request, context: { params: Promise<{ conversationId: string }> }): Promise<Response> {
  try {
    const operator = await requireOperator(request);
    const { conversationId } = await context.params;
    await createWhatsAppServices().handoffs.finishConversation({ conversationId, operatorId: operator.operatorId });
    return NextResponse.json({ status: "finished" });
  } catch (error) {
    if (error instanceof OperatorAuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
