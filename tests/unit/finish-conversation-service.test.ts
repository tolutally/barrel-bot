import { describe, expect, it, vi } from "vitest";
import { PrismaTradeHandoffService } from "@barrel/handoffs";

describe("PrismaTradeHandoffService.finishConversation", () => {
  it("closes a HUMAN handoff exactly once, attributes the operator, and never sends a customer message", async () => {
    const state = { automationMode: "HUMAN" as "HUMAN" | "BOT" };
    const conversationUpdate = vi.fn(async ({ data }: { data: typeof state & { handoffClosedBy: string } }) => {
      state.automationMode = data.automationMode;
    });
    const handoffUpdate = vi.fn(async () => ({ count: 1 }));
    const auditCreate = vi.fn(async () => ({}));
    const tx = {
      conversation: { findUniqueOrThrow: vi.fn(async () => ({ id: "conversation-1", automationMode: state.automationMode })), update: conversationUpdate },
      tradeIntent: { updateMany: handoffUpdate },
      auditLog: { create: auditCreate },
    };
    const db = { $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<void>) => callback(tx)) };
    const service = new PrismaTradeHandoffService(db as never, [], () => new Date("2026-08-16T10:00:00Z"));

    await service.finishConversation({ conversationId: "conversation-1", operatorId: "operator-1" });
    await service.finishConversation({ conversationId: "conversation-1", operatorId: "operator-1" });

    expect(state.automationMode).toBe("BOT");
    expect(conversationUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ handoffClosedBy: "operator-1" }) }));
    expect(handoffUpdate).toHaveBeenCalledTimes(1);
    expect(auditCreate).toHaveBeenCalledTimes(2);
    expect((auditCreate.mock.calls as unknown as Array<[{ data: { action: string } }]>).map(([input]) => input.data.action))
      .toEqual(["HUMAN_HANDOFF_FINISHED", "AUTOMATION_RESUMED"]);
  });
});
