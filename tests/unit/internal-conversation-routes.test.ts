import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireOperator, listInternalConversations, getInternalConversation } = vi.hoisted(() => ({
  requireOperator: vi.fn(), listInternalConversations: vi.fn(), getInternalConversation: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../../apps/api/src/lib/operator-auth", () => ({
  requireOperator,
  OperatorAuthError: class OperatorAuthError extends Error {
    constructor(readonly status: 401 | 403, message: string) { super(message); }
  },
}));
vi.mock("../../apps/api/src/lib/internal-conversations", () => ({ listInternalConversations, getInternalConversation }));

import { GET as listGet } from "../../apps/api/src/app/api/internal/conversations/route";
import { GET as detailGet } from "../../apps/api/src/app/api/internal/conversations/[conversationId]/route";
import { OperatorAuthError } from "../../apps/api/src/lib/operator-auth";

describe("internal conversation route authorization", () => {
  beforeEach(() => {
    requireOperator.mockReset(); listInternalConversations.mockReset(); getInternalConversation.mockReset();
  });

  it.each([401, 403] as const)("returns %s when authorization rejects the list request", async (status) => {
    requireOperator.mockRejectedValue(new OperatorAuthError(status, "Not allowed"));
    const response = await listGet(new Request("http://localhost/api/internal/conversations"));
    expect(response.status).toBe(status);
    expect(listInternalConversations).not.toHaveBeenCalled();
  });

  it("allows an active operator and protects the detail route too", async () => {
    requireOperator.mockResolvedValue({ operatorId: "op", role: "OPERATOR" });
    listInternalConversations.mockResolvedValue({ conversations: [], page: {} });
    getInternalConversation.mockResolvedValue(null);
    expect((await listGet(new Request("http://localhost/api/internal/conversations"))).status).toBe(200);
    expect((await detailGet(new Request("http://localhost/api/internal/conversations/c1"), { params: Promise.resolve({ conversationId: "c1" }) })).status).toBe(404);
    expect(getInternalConversation).toHaveBeenCalledWith("c1", expect.any(URLSearchParams));
  });
});
