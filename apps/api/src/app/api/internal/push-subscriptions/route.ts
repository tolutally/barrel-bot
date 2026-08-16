import { NextResponse } from "next/server";
import { z } from "zod";
import { OperatorAuthError, requireOperator } from "../../../../lib/operator-auth";
import { removeOperatorPushSubscription, saveOperatorPushSubscription } from "../../../../lib/push-notifications";

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(2_048),
  keys: z.object({ p256dh: z.string().min(16).max(1_024), auth: z.string().min(8).max(1_024) }),
});

async function operatorResponse(request: Request): Promise<{ operatorId: string } | Response> {
  try {
    return await requireOperator(request);
  } catch (error) {
    if (error instanceof OperatorAuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

export async function POST(request: Request): Promise<Response> {
  const operator = await operatorResponse(request);
  if (operator instanceof Response) return operator;
  const parsed = subscriptionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid push subscription" }, { status: 400 });
  await saveOperatorPushSubscription(operator.operatorId, parsed.data);
  return NextResponse.json({ status: "subscribed" }, { status: 201 });
}

export async function DELETE(request: Request): Promise<Response> {
  const operator = await operatorResponse(request);
  if (operator instanceof Response) return operator;
  const parsed = z.object({ endpoint: z.string().url().max(2_048) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid push subscription" }, { status: 400 });
  await removeOperatorPushSubscription(operator.operatorId, parsed.data.endpoint);
  return NextResponse.json({ status: "unsubscribed" });
}
