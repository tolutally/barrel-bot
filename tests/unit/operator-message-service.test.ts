import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { OperatorMessageError, OperatorMessageService } from "../../apps/api/src/lib/operator-message-service";

function harness(mode: "HUMAN" | "HANDOFF_PENDING" | "BOT" = "HUMAN") {
  const conversationFindUnique = vi.fn().mockResolvedValue({ id: "conversation-1", automationMode: mode, customerChannel: { externalIdentifier: "15551234567" } });
  const messageCreate = vi.fn().mockResolvedValue({ id: "message-1", externalMessageId: null, sentAt: null, failedAt: null });
  const messageFindUnique = vi.fn();
  const messageUpdate = vi.fn().mockResolvedValue({});
  const auditCreate = vi.fn().mockResolvedValue({});
  const conversationUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
  const transactionConversationFindUnique = vi.fn().mockResolvedValue({ automationMode: "HUMAN" });
  const tradeIntentUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
  const transaction = vi.fn(async (operation: unknown) => typeof operation === "function"
    ? operation({
      conversation: { updateMany: conversationUpdateMany, findUnique: transactionConversationFindUnique },
      tradeIntent: { updateMany: tradeIntentUpdateMany },
      auditLog: { create: auditCreate },
    })
    : []);
  const sendText = vi.fn().mockResolvedValue({ messageId: "wamid.operator.1" });
  const db = {
    conversation: { findUnique: conversationFindUnique },
    conversationMessage: { create: messageCreate, findUnique: messageFindUnique, update: messageUpdate },
    auditLog: { create: auditCreate },
    $transaction: transaction,
  };
  const service = new OperatorMessageService(db as never, { sendText, sendInteractive: vi.fn(), sendList: vi.fn() }, () => new Date("2026-08-16T10:00:00Z"));
  return { service, sendText, conversationFindUnique, conversationUpdateMany, tradeIntentUpdateMany, messageCreate, messageFindUnique, messageUpdate, auditCreate, transaction };
}

const request = { conversationId: "conversation-1", operatorId: "operator-1", text: "Hi — I've got your request.", idempotencyKey: "reply-001" };

describe("OperatorMessageService", () => {
  it("sends the exact operator body via the configured WhatsApp client and persists OPERATOR attribution", async () => {
    const h = harness();
    await expect(h.service.send(request)).resolves.toEqual({ externalMessageId: "wamid.operator.1", sentAt: new Date("2026-08-16T10:00:00Z"), idempotent: false });
    expect(h.sendText).toHaveBeenCalledWith("15551234567", "Hi — I've got your request.");
    expect(h.messageCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      direction: "OUTBOUND", senderType: "OPERATOR", operatorId: "operator-1", textBody: request.text, idempotencyKey: "reply-001",
    }) }));
    expect(h.messageUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ externalMessageId: "wamid.operator.1", sentAt: new Date("2026-08-16T10:00:00Z") }) }));
    expect(h.auditCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "OPERATOR_MESSAGE_SENT", actorId: "operator-1", entityId: "conversation-1" }) }));
    expect(JSON.stringify(h.auditCreate.mock.calls)).not.toContain(request.text);
  });

  it("rejects BOT conversations without sending or changing mode", async () => {
    const h = harness("BOT");
    await expect(h.service.send(request)).rejects.toMatchObject({ code: "CONVERSATION_NOT_IN_HUMAN_MODE", status: 409 } satisfies Partial<OperatorMessageError>);
    expect(h.sendText).not.toHaveBeenCalled();
    expect(h.messageCreate).not.toHaveBeenCalled();
  });

  it("atomically claims a pending handoff when an operator sends the first reply", async () => {
    const h = harness("HANDOFF_PENDING");
    await expect(h.service.send(request)).resolves.toMatchObject({ externalMessageId: "wamid.operator.1" });
    expect(h.conversationUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "conversation-1", automationMode: "HANDOFF_PENDING" },
      data: expect.objectContaining({ automationMode: "HUMAN" }),
    }));
    expect(h.tradeIntentUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { conversationId: "conversation-1", handoffState: { in: ["ALERT_PENDING", "FAILED"] } },
      data: expect.objectContaining({ handoffState: "HANDED_OFF", assignedAdminRecipient: "operator:operator-1" }),
    }));
    expect(h.sendText).toHaveBeenCalledWith("15551234567", request.text);
  });

  it("returns the stored send for a duplicate idempotency key without another Meta send", async () => {
    const h = harness();
    h.messageCreate.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "test" }));
    h.messageFindUnique.mockResolvedValue({ externalMessageId: "wamid.existing", sentAt: new Date("2026-08-16T09:00:00Z"), failedAt: null });
    await expect(h.service.send(request)).resolves.toEqual({ externalMessageId: "wamid.existing", sentAt: new Date("2026-08-16T09:00:00Z"), idempotent: true });
    expect(h.sendText).not.toHaveBeenCalled();
  });

  it("persists a safe failed state when Meta rejects the send", async () => {
    const h = harness();
    h.sendText.mockRejectedValue({ safeCode: "META_HTTP_500", safeMessage: "Meta WhatsApp delivery failed with HTTP 500" });
    await expect(h.service.send(request)).rejects.toMatchObject({ code: "MESSAGE_SEND_FAILED", status: 502 } satisfies Partial<OperatorMessageError>);
    expect(h.messageUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      failedAt: new Date("2026-08-16T10:00:00Z"), failureCode: "META_HTTP_500",
    }) }));
    expect(h.auditCreate).not.toHaveBeenCalled();
  });
});
