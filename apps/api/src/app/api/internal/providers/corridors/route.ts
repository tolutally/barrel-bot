import { NextResponse } from "next/server";
import { OperatorAuthError, requireOperator } from "../../../../../lib/operator-auth";
import { listProviderCorridors } from "../../../../../lib/provider-corridors";

export async function GET(request: Request): Promise<Response> {
  try {
    await requireOperator(request);
    return NextResponse.json(await listProviderCorridors(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof OperatorAuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
