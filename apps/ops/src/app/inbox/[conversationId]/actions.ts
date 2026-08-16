"use server";

import { BarrelInternalApiClient, InternalApiError } from "../../../lib/api-client";
import { getAuthorizedOperator } from "../../../lib/require-operator";

type ActionResult = { ok: true; sentAt?: string } | { ok: false; error: string };

export async function sendHumanReply(conversationId: string, text: string, idempotencyKey: string): Promise<ActionResult> {
  const operator = await getAuthorizedOperator();
  if ("reason" in operator) return { ok: false, error: "Your session has ended. Sign in again." };
  try {
    const result = await new BarrelInternalApiClient(operator.accessToken).sendMessage(conversationId, text, idempotencyKey);
    return { ok: true, sentAt: result.sentAt };
  } catch (error) {
    if (error instanceof InternalApiError && error.status === 409) return { ok: false, error: "This conversation is no longer being handled by a person." };
    return { ok: false, error: "Message wasn't sent." };
  }
}

export async function finishHumanConversation(conversationId: string): Promise<ActionResult> {
  const operator = await getAuthorizedOperator();
  if ("reason" in operator) return { ok: false, error: "Your session has ended. Sign in again." };
  try {
    await new BarrelInternalApiClient(operator.accessToken).finishConversation(conversationId);
    return { ok: true };
  } catch {
    return { ok: false, error: "We couldn't finish this conversation." };
  }
}
