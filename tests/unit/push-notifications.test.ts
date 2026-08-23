import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { prisma, webpush } = vi.hoisted(() => ({
  prisma: {
    operatorPushSubscription: {
      upsert: vi.fn(), deleteMany: vi.fn(), findMany: vi.fn(), update: vi.fn(), delete: vi.fn(),
    },
  },
  webpush: { setVapidDetails: vi.fn(), sendNotification: vi.fn() },
}));

vi.mock("server-only", () => ({}));
vi.mock("@barrel/db", () => ({ prisma }));
vi.mock("web-push", () => ({ default: webpush }));

import { notifyOperatorsOfInboundMessage, saveOperatorPushSubscription, sendOperatorTestNotification } from "../../apps/api/src/lib/push-notifications";

const originalEnvironment = { ...process.env };

describe("Ops push notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    prisma.operatorPushSubscription.update.mockResolvedValue(undefined);
    prisma.operatorPushSubscription.delete.mockResolvedValue(undefined);
    process.env.WEB_PUSH_VAPID_SUBJECT = "mailto:ops@barrel.test";
    process.env.WEB_PUSH_VAPID_PUBLIC_KEY = "public-key";
    process.env.WEB_PUSH_VAPID_PRIVATE_KEY = "private-key";
  });

  afterEach(() => {
    process.env = { ...originalEnvironment };
    vi.restoreAllMocks();
  });

  it("stores a device subscription against the authenticated operator", async () => {
    await saveOperatorPushSubscription("operator-1", { endpoint: "https://push.example/device", keys: { p256dh: "p256dh-value", auth: "auth-value" } });
    expect(prisma.operatorPushSubscription.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { endpoint: "https://push.example/device" },
      create: expect.objectContaining({ operatorId: "operator-1" }),
    }));
  });

  it("sends a private notification to active-operator devices and removes expired subscriptions", async () => {
    prisma.operatorPushSubscription.findMany.mockResolvedValue([
      { id: "active", endpoint: "https://push.example/active", p256dh: "key-1", auth: "auth-1" },
      { id: "expired", endpoint: "https://push.example/expired", p256dh: "key-2", auth: "auth-2" },
    ]);
    webpush.sendNotification
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce({ statusCode: 410 });

    await notifyOperatorsOfInboundMessage("conversation-internal-id");

    expect(prisma.operatorPushSubscription.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { operator: { status: "ACTIVE" } } }));
    expect(webpush.setVapidDetails).toHaveBeenCalledWith("mailto:ops@barrel.test", "public-key", "private-key");
    expect(webpush.sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: "https://push.example/active" }),
      expect.stringContaining('"body":"Open Barrel Ops to view and reply."'),
    );
    const payload = JSON.parse(webpush.sendNotification.mock.calls[0]![1] as string);
    expect(payload).toEqual(expect.objectContaining({ url: "/inbox/conversation-internal-id" }));
    expect(JSON.stringify(payload)).not.toMatch(/phone|whatsapp|\+1\d{3}/i);
    expect(prisma.operatorPushSubscription.delete).toHaveBeenCalledWith({ where: { id: "expired" } });
  });

  it("sends a test alert only to the authenticated operator's devices", async () => {
    prisma.operatorPushSubscription.findMany.mockResolvedValue([
      { id: "device", endpoint: "https://push.example/device", p256dh: "key", auth: "auth" },
    ]);
    webpush.sendNotification.mockResolvedValue(undefined);

    await expect(sendOperatorTestNotification("operator-1")).resolves.toBe(1);

    expect(prisma.operatorPushSubscription.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { operatorId: "operator-1", operator: { status: "ACTIVE" } },
    }));
    const payload = JSON.parse(webpush.sendNotification.mock.calls[0]![1] as string);
    expect(payload).toEqual(expect.objectContaining({ title: "Barrel alerts are working", url: "/inbox" }));
  });
});
