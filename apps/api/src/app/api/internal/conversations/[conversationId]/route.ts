import { NextResponse } from "next/server";
import { getInternalConversation } from "../../../../../lib/internal-conversations";
import { OperatorAuthError, requireOperator } from "../../../../../lib/operator-auth";

export async function GET(request: Request, context: { params: Promise<{ conversationId: string }> }): Promise<Response> {
  try {
    await requireOperator(request);
    const { conversationId } = await context.params;
    const result = await getInternalConversation(conversationId, new URL(request.url).searchParams);
    return result ? NextResponse.json(result) : NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  } catch (error) {
    if (error instanceof OperatorAuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
