import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAuthorizedOperator, sendMessage, finishConversation } = vi.hoisted(() => ({ getAuthorizedOperator: vi.fn(), sendMessage: vi.fn(), finishConversation: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../../apps/ops/src/lib/require-operator", () => ({ getAuthorizedOperator }));
vi.mock("../../apps/ops/src/lib/api-client", () => ({
  BarrelInternalApiClient: class BarrelInternalApiClient { sendMessage = sendMessage; finishConversation = finishConversation; },
  InternalApiError: class InternalApiError extends Error { constructor(readonly status: number) { super(String(status)); } },
}));

import { InternalApiError } from "../../apps/ops/src/lib/api-client";
import { finishHumanConversation, sendHumanReply } from "../../apps/ops/src/app/inbox/[conversationId]/actions";

describe("Ops conversation actions", () => {
  beforeEach(() => {
    getAuthorizedOperator.mockReset(); sendMessage.mockReset(); finishConversation.mockReset();
    getAuthorizedOperator.mockResolvedValue({ operator: { operatorId: "op-1" }, accessToken: "access-token" });
  });

  it("forwards the exact reply and its stable idempotency key", async () => {
    sendMessage.mockResolvedValue({ status: "sent", idempotent: false, sentAt: "2026-08-16T16:10:00Z" });
    await expect(sendHumanReply("conversation-1", "Hi — I've got your request.", "stable-key")).resolves.toEqual({ ok: true, sentAt: "2026-08-16T16:10:00Z" });
    expect(sendMessage).toHaveBeenCalledWith("conversation-1", "Hi — I've got your request.", "stable-key");
  });

  it("returns safe retry copy when a send fails", async () => {
    sendMessage.mockRejectedValue(new InternalApiError(502));
    await expect(sendHumanReply("conversation-1", "Hi", "stable-key")).resolves.toEqual({ ok: false, error: "Message wasn't sent." });
  });

  it("calls the protected finish endpoint", async () => {
    finishConversation.mockResolvedValue({ status: "finished" });
    await expect(finishHumanConversation("conversation-1")).resolves.toEqual({ ok: true });
    expect(finishConversation).toHaveBeenCalledWith("conversation-1");
  });
});
