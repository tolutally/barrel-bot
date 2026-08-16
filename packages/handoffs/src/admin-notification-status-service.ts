import type { PrismaClient } from "@prisma/client";

export type MetaMessageDeliveryStatus = {
  messageId: string;
  status: "sent" | "delivered" | "read" | "failed";
  occurredAt: Date;
  failureCode?: string;
  failureMessage?: string;
};

export class AdminNotificationStatusService {
  constructor(private readonly prisma: PrismaClient) {}

  async record(status: MetaMessageDeliveryStatus): Promise<boolean> {
    const notification = await this.prisma.adminNotification.findFirst({
      where: { externalMessageId: status.messageId },
      select: { id: true, status: true },
    });
    if (!notification) return false;

    if (status.status === "failed") {
      await this.prisma.adminNotification.update({
        where: { id: notification.id },
        data: {
          status: "FAILED",
          safeFailureCode: (status.failureCode ?? "META_DELIVERY_FAILED").slice(0, 80),
          safeFailureMessage: (status.failureMessage ?? "Meta WhatsApp delivery failed").slice(0, 300),
        },
      });
      return true;
    }
    if (status.status === "read") {
      await this.prisma.adminNotification.update({
        where: { id: notification.id },
        data: { status: "READ", deliveredAt: status.occurredAt, readAt: status.occurredAt },
      });
      return true;
    }
    if (status.status === "delivered" && notification.status !== "READ") {
      await this.prisma.adminNotification.update({
        where: { id: notification.id },
        data: { status: "DELIVERED", deliveredAt: status.occurredAt },
      });
      return true;
    }
    return true;
  }
}
