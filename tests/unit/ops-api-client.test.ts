import { describe, expect, it } from "vitest";
import { vi } from "vitest";

vi.mock("server-only", () => ({}));

import { BarrelInternalApiClient } from "../../apps/ops/src/lib/api-client";

describe("Ops internal API client", () => {
  it("uses a bearer token and exposes only the intended internal API surface", async () => {
    const fetchMock = async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://api.barrel.test/api/internal/me");
      expect(init?.headers).toMatchObject({ Authorization: "Bearer access-token" });
      return new Response(JSON.stringify({ operator: { operatorId: "op-1", authUserId: "auth-1", email: "operator@barrel.test", role: "OPERATOR" } }));
    };
    const original = process.env.BARREL_API_URL;
    process.env.BARREL_API_URL = "https://api.barrel.test";
    await expect(new BarrelInternalApiClient("access-token", fetchMock as typeof fetch).me()).resolves.toMatchObject({ operatorId: "op-1" });
    if (original === undefined) delete process.env.BARREL_API_URL; else process.env.BARREL_API_URL = original;
  });

  it("uses backend pagination rather than requesting an unlimited list", async () => {
    const fetchMock = async (input: RequestInfo | URL) => {
      expect(String(input)).toBe("https://api.barrel.test/api/internal/conversations?page=2&limit=25");
      return new Response(JSON.stringify({ conversations: [], page: { number: 2, limit: 25, total: 50, hasMore: false } }));
    };
    const original = process.env.BARREL_API_URL;
    process.env.BARREL_API_URL = "https://api.barrel.test";
    await expect(new BarrelInternalApiClient("access-token", fetchMock as typeof fetch).listConversations({ page: 2, limit: 25 })).resolves.toMatchObject({ page: { number: 2 } });
    if (original === undefined) delete process.env.BARREL_API_URL; else process.env.BARREL_API_URL = original;
  });
});
