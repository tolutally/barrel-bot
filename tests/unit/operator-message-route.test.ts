import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { requireOperator, send } = vi.hoisted(() => ({ requireOperator: vi.fn(), send: vi.fn() }));
vi.mock("../../apps/api/src/lib/operator-auth", () => ({
  requireOperator,
  OperatorAuthError: class OperatorAuthError extends Error { constructor(readonly status: 401 | 403, message: string) { super(message); } },
}));
vi.mock("../../apps/api/src/lib/operator-message-service", () => ({
  OperatorMessageError: class OperatorMessageError extends Error { constructor(readonly code: string, readonly status: number) { super(code); } },
}));
vi.mock("../../apps/api/src/lib/whatsapp-service", () => ({ createWhatsAppServices: () => ({ operatorMessages: { send } }) }));

import { POST } from "../../apps/api/src/app/api/internal/conversations/[conversationId]/messages/route";
import { OperatorAuthError } from "../../apps/api/src/lib/operator-auth";

describe("operator message route", () => {
  beforeEach(() => { requireOperator.mockReset(); send.mockReset(); });

  it.each([401, 403] as const)("returns %s before attempting a send", async (status) => {
    requireOperator.mockRejectedValue(new OperatorAuthError(status, "No access"));
    const response = await POST(new Request("http://localhost/api/internal/conversations/c1/messages", { method: "POST", headers: { "idempotency-key": "k", "content-type": "application/json" }, body: JSON.stringify({ text: "Hi" }) }), { params: Promise.resolve({ conversationId: "c1" }) });
    expect(response.status).toBe(status);
    expect(send).not.toHaveBeenCalled();
  });

  it("requires idempotency and returns a sanitized successful response", async () => {
    requireOperator.mockResolvedValue({ operatorId: "operator-1" });
    const invalid = await POST(new Request("http://localhost/api/internal/conversations/c1/messages", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "Hi" }) }), { params: Promise.resolve({ conversationId: "c1" }) });
    expect(invalid.status).toBe(400);
    send.mockResolvedValue({ sentAt: new Date("2026-08-16T10:00:00Z"), externalMessageId: "never-returned", idempotent: false });
    const response = await POST(new Request("http://localhost/api/internal/conversations/c1/messages", { method: "POST", headers: { "idempotency-key": "k", "content-type": "application/json" }, body: JSON.stringify({ text: "  Hi  " }) }), { params: Promise.resolve({ conversationId: "c1" }) });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ status: "sent", idempotent: false, sentAt: "2026-08-16T10:00:00.000Z" });
    expect(send).toHaveBeenCalledWith({ conversationId: "c1", operatorId: "operator-1", text: "Hi", idempotencyKey: "k" });
  });

  it("accepts one validated image with an optional caption", async () => {
    requireOperator.mockResolvedValue({ operatorId: "operator-1" });
    send.mockResolvedValue({ sentAt: new Date("2026-08-16T10:00:00Z"), externalMessageId: "wamid.image", idempotent: false });
    const form = new FormData();
    form.set("text", "Receipt");
    form.set("attachment", new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], "receipt.jpg", { type: "image/jpeg" }));
    const response = await POST(new Request("http://localhost/api/internal/conversations/c1/messages", { method: "POST", headers: { "idempotency-key": "media-k" }, body: form }), { params: Promise.resolve({ conversationId: "c1" }) });
    expect(response.status).toBe(201);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ conversationId: "c1", operatorId: "operator-1", text: "Receipt", idempotencyKey: "media-k", attachment: expect.objectContaining({ mimeType: "image/jpeg", fileName: "receipt.jpg" }) }));
  });
});
