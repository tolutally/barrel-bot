import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireOperator, finishConversation } = vi.hoisted(() => ({ requireOperator: vi.fn(), finishConversation: vi.fn() }));
vi.mock("../../apps/api/src/lib/operator-auth", () => ({
  requireOperator,
  OperatorAuthError: class OperatorAuthError extends Error { constructor(readonly status: 401 | 403, message: string) { super(message); } },
}));
vi.mock("../../apps/api/src/lib/whatsapp-service", () => ({
  createWhatsAppServices: () => ({ handoffs: { finishConversation } }),
}));

import { POST } from "../../apps/api/src/app/api/internal/conversations/[conversationId]/finish/route";
import { OperatorAuthError } from "../../apps/api/src/lib/operator-auth";

describe("finish conversation route", () => {
  beforeEach(() => { requireOperator.mockReset(); finishConversation.mockReset(); });

  it.each([401, 403] as const)("blocks unauthorized operators with %s", async (status) => {
    requireOperator.mockRejectedValue(new OperatorAuthError(status, "Not allowed"));
    const response = await POST(new Request("http://localhost/api/internal/conversations/c1/finish", { method: "POST" }), { params: Promise.resolve({ conversationId: "c1" }) });
    expect(response.status).toBe(status);
    expect(finishConversation).not.toHaveBeenCalled();
  });

  it("uses the authenticated operator identity and sends no WhatsApp message", async () => {
    requireOperator.mockResolvedValue({ operatorId: "operator-1" });
    finishConversation.mockResolvedValue(undefined);
    const response = await POST(new Request("http://localhost/api/internal/conversations/c1/finish", { method: "POST" }), { params: Promise.resolve({ conversationId: "c1" }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "finished" });
    expect(finishConversation).toHaveBeenCalledWith({ conversationId: "c1", operatorId: "operator-1" });
  });
});
