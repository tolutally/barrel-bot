import { NextResponse } from "next/server";
import { OperatorAuthError, requireOperator } from "../../../../../lib/operator-auth";
import { sendOperatorTestNotification } from "../../../../../lib/push-notifications";

export async function POST(request: Request): Promise<Response> {
  try {
    const operator = await requireOperator(request);
    const delivered = await sendOperatorTestNotification(operator.operatorId);
    if (delivered === 0) {
      return NextResponse.json({ error: "No active notification device was found" }, { status: 409 });
    }
    return NextResponse.json({ status: "sent", delivered });
  } catch (error) {
    if (error instanceof OperatorAuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
