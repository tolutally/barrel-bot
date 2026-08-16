import { beforeEach, describe, expect, it, vi } from "vitest";

const { findUnique, getClaims, getUser } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  getClaims: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@barrel/db", () => ({ prisma: { operator: { findUnique } } }));
vi.mock("../../apps/api/src/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({ auth: { getClaims, getUser } })),
}));

import { OperatorAuthError, requireOperator } from "../../apps/api/src/lib/operator-auth";

describe("requireOperator", () => {
  beforeEach(() => {
    findUnique.mockReset();
    getClaims.mockReset();
    getUser.mockReset();
    getClaims.mockResolvedValue({ data: { claims: { sub: "eb76a809-6b82-420c-a957-8413712d6d4c" } }, error: null });
    getUser.mockResolvedValue({ data: { user: { email: "operator@barrel.test" } }, error: null });
  });

  it("rejects a request without a valid session", async () => {
    getClaims.mockResolvedValue({ data: { claims: {} }, error: null });
    await expect(requireOperator()).rejects.toMatchObject({ status: 401 } satisfies Partial<OperatorAuthError>);
  });

  it("rejects signed-in users without an active operator record", async () => {
    findUnique.mockResolvedValue({ id: "op-1", status: "DISABLED" });
    await expect(requireOperator()).rejects.toMatchObject({ status: 403 } satisfies Partial<OperatorAuthError>);
  });

  it("returns the operator identity for an active mapped user", async () => {
    findUnique.mockResolvedValue({
      id: "op-1",
      authUserId: "eb76a809-6b82-420c-a957-8413712d6d4c",
      email: "operator@barrel.test",
      displayName: "Operations",
      role: "ADMIN",
      status: "ACTIVE",
    });
    await expect(requireOperator()).resolves.toEqual({
      operatorId: "op-1",
      authUserId: "eb76a809-6b82-420c-a957-8413712d6d4c",
      email: "operator@barrel.test",
      displayName: "Operations",
      role: "ADMIN",
    });
  });
});
