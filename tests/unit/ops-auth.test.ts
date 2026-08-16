import { beforeEach, describe, expect, it, vi } from "vitest";

const { getClaims, getSession, me } = vi.hoisted(() => ({ getClaims: vi.fn(), getSession: vi.fn(), me: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../../apps/ops/src/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({ auth: { getClaims, getSession } })),
}));
vi.mock("../../apps/ops/src/lib/api-client", () => ({
  BarrelInternalApiClient: class BarrelInternalApiClient { async me() { return me(); } },
  InternalApiError: class InternalApiError extends Error { constructor(readonly status: number) { super(String(status)); } },
}));

import { InternalApiError } from "../../apps/ops/src/lib/api-client";
import { getAuthorizedOperator } from "../../apps/ops/src/lib/require-operator";

describe("Ops route protection", () => {
  beforeEach(() => {
    getClaims.mockReset(); getSession.mockReset(); me.mockReset();
    getClaims.mockResolvedValue({ data: { claims: { sub: "auth-user" } }, error: null });
    getSession.mockResolvedValue({ data: { session: { access_token: "verified-token" } } });
  });

  it("redirect path can identify unauthenticated visitors", async () => {
    getClaims.mockResolvedValue({ data: { claims: {} }, error: null });
    await expect(getAuthorizedOperator()).resolves.toEqual({ reason: "UNAUTHENTICATED" });
  });

  it("denies a signed-in user when Barrel API reports no active operator", async () => {
    me.mockRejectedValue(new InternalApiError(403));
    await expect(getAuthorizedOperator()).resolves.toEqual({ reason: "NOT_AUTHORIZED" });
  });

  it("allows an ACTIVE Operator after API verification", async () => {
    me.mockResolvedValue({ operatorId: "operator-1", authUserId: "auth-user", email: "operator@barrel.test", role: "OPERATOR" });
    await expect(getAuthorizedOperator()).resolves.toEqual({ operator: { operatorId: "operator-1", authUserId: "auth-user", email: "operator@barrel.test", role: "OPERATOR" }, accessToken: "verified-token" });
  });
});
