import "server-only";
import webpush from "web-push";
import { prisma } from "@barrel/db";

type PushSubscriptionInput = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

type PushConfig = { subject: string; publicKey: string; privateKey: string };

function config(): PushConfig | null {
  const subject = process.env.WEB_PUSH_VAPID_SUBJECT;
  const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
  return subject && publicKey && privateKey ? { subject, publicKey, privateKey } : null;
}

function configureWebPush(value: PushConfig): void {
  webpush.setVapidDetails(value.subject, value.publicKey, value.privateKey);
}

export function pushNotificationsConfigured(): boolean {
  return config() !== null;
}

export async function saveOperatorPushSubscription(operatorId: string, subscription: PushSubscriptionInput): Promise<void> {
  await prisma.operatorPushSubscription.upsert({
    where: { endpoint: subscription.endpoint },
    create: { operatorId, endpoint: subscription.endpoint, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
    update: { operatorId, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
  });
}

export async function removeOperatorPushSubscription(operatorId: string, endpoint: string): Promise<void> {
  await prisma.operatorPushSubscription.deleteMany({ where: { operatorId, endpoint } });
}

type PushPayload = { title: string; body: string; url: string; tag: string; timestamp: number };

async function deliverPushNotifications(
  where: { operatorId?: string; operator: { status: "ACTIVE" } },
  payload: PushPayload,
): Promise<number> {
  const pushConfig = config();
  if (!pushConfig) return 0;
  configureWebPush(pushConfig);
  const subscriptions = await prisma.operatorPushSubscription.findMany({
    where,
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  });
  let delivered = 0;
  await Promise.all(subscriptions.map(async (subscription) => {
    try {
      await webpush.sendNotification(
        { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
        JSON.stringify(payload),
      );
      delivered += 1;
      await prisma.operatorPushSubscription.update({ where: { id: subscription.id }, data: { lastUsedAt: new Date() } });
    } catch (error: unknown) {
      const statusCode = typeof error === "object" && error != null && "statusCode" in error
        ? (error as { statusCode?: number }).statusCode
        : undefined;
      if (statusCode === 404 || statusCode === 410) {
        await prisma.operatorPushSubscription.delete({ where: { id: subscription.id } }).catch(() => undefined);
      }
      console.error({ event: "ops_push_delivery_failed", statusCode: statusCode ?? "unknown" });
    }
  }));
  return delivered;
}

export function sendOperatorTestNotification(operatorId: string): Promise<number> {
  return deliverPushNotifications(
    { operatorId, operator: { status: "ACTIVE" } },
    {
      title: "Barrel alerts are working",
      body: "You’ll be notified here when a customer needs the team.",
      url: "/inbox",
      tag: `barrel-test-${operatorId}`,
      timestamp: Date.now(),
    },
  );
}

export async function notifyOperatorsOfInboundMessage(conversationId: string): Promise<void> {
  await deliverPushNotifications({ operator: { status: "ACTIVE" } }, {
    title: "New Barrel customer message",
    body: "Open Barrel Ops to view and reply.",
    url: `/inbox/${conversationId}`,
    tag: `barrel-inbound-${conversationId}`,
    timestamp: Date.now(),
  });
}
