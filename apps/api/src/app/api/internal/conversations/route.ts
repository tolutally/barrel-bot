import { NextResponse } from "next/server";
import { listInternalConversations } from "../../../../lib/internal-conversations";
import { OperatorAuthError, requireOperator } from "../../../../lib/operator-auth";

export async function GET(request: Request): Promise<Response> {
  try {
    await requireOperator(request);
    return NextResponse.json(await listInternalConversations(new URL(request.url).searchParams));
  } catch (error) {
    if (error instanceof OperatorAuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
