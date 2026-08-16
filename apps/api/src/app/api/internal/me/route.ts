import { NextResponse } from "next/server";
import { OperatorAuthError, requireOperator } from "../../../../lib/operator-auth";

export async function GET(request: Request): Promise<Response> {
  try {
    return NextResponse.json({ operator: await requireOperator(request) });
  } catch (error) {
    if (error instanceof OperatorAuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
