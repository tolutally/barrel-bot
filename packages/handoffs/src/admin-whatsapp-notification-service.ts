import type { AdminNotification, PrismaClient } from "@prisma/client";
import { buildTradeRequestAlert, type TradeRequestAlert } from "./trade-handoff-service";

export interface AdminTemplateMessageSender {
  sendTemplate(input: {
    to: string;
    templateName: string;
    language: string;
    bodyParameters: string[];
  }): Promise<{ messageId: string }>;
}

export type AdminNotificationDispatchResult = {
  tradeIntentId: string;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
};

export type AdminWhatsAppNotificationConfig = {
  templateName: string;
  templateLanguage: string;
  maxAttempts?: number;
  operationalTimeZone?: string;
};

export interface AdminNotificationDispatcher {
  dispatchTradeIntentNotifications(tradeIntentId: string): Promise<AdminNotificationDispatchResult>;
}

export type SafeNotificationFailure = {
  code: string;
  message: string;
  retryable: boolean;
};

export function adminTradeAlertTemplateParameters(alert: TradeRequestAlert, operationalTimeZone = "America/Edmonton"): string[] {
  if (alert.kind === "GENERAL_ASSISTANCE") return [
    alert.tradeRequestReference,
    "Customer needs assistance",
    "No active rate",
    "No active rate",
    "No active rate",
    alert.purposeLabel,
    formatAdminContact(alert.customerWhatsAppId),
    formatAdminTime(alert.requestedAt, operationalTimeZone),
  ];
  return [
    alert.tradeRequestReference,
    `${alert.sourceCurrency} → ${alert.targetCurrency}`,
    alert.sourceAmount,
    alert.indicativeTargetAmount,
    alert.indicativeCustomerRate,
    [
      alert.purposeDetail ? `${alert.purposeLabel}: ${alert.purposeDetail}` : alert.purposeLabel,
      alert.quoteCreatedAt ? `Quote shown ${formatAdminTime(alert.quoteCreatedAt, operationalTimeZone)}` : null,
      alert.customerQuoteExpiresAt ? `Continue by ${formatAdminTime(alert.customerQuoteExpiresAt, operationalTimeZone)}` : null,
      "Indicative only — confirm the live rate before proceeding.",
    ].filter(Boolean).join("\n"),
    formatAdminContact(alert.customerWhatsAppId),
    formatAdminTime(alert.requestedAt, operationalTimeZone),
  ];
}

function formatAdminContact(value: string | null): string {
  if (!value) return "Contact unavailable";
  const digits = value.replace(/\D/g, "");
  if (!digits) return value;
  if (digits.length === 11 && digits.startsWith("1")) return `+1 ${digits.slice(1, 4)} *** ${digits.slice(-4)}`;
  if (digits.length >= 7) return `+${digits.slice(0, Math.min(3, digits.length - 4))} *** ${digits.slice(-4)}`;
  return "Contact masked";
}

function formatAdminTime(value: string, timeZone = "America/Edmonton"): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
}

function safeFailure(error: unknown): SafeNotificationFailure {
  if (error && typeof error === "object") {
    const candidate = error as { safeCode?: unknown; safeMessage?: unknown; retryable?: unknown };
    if (typeof candidate.safeCode === "string" && typeof candidate.safeMessage === "string") {
      return {
        code: candidate.safeCode.slice(0, 80),
        message: candidate.safeMessage.slice(0, 300),
        retryable: candidate.retryable === true,
      };
    }
  }
  return { code: "META_SEND_ERROR", message: "Meta WhatsApp template delivery failed", retryable: false };
}

export class AdminWhatsAppNotificationService implements AdminNotificationDispatcher {
  private readonly maxAttempts: number;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly sender: AdminTemplateMessageSender,
    private readonly config: AdminWhatsAppNotificationConfig,
    private readonly now: () => Date = () => new Date(),
  ) {
    if (!config.templateName.trim()) throw new Error("admin trade alert template name is required");
    if (!config.templateLanguage.trim()) throw new Error("admin trade alert template language is required");
    this.maxAttempts = config.maxAttempts ?? 3;
    if (!Number.isInteger(this.maxAttempts) || this.maxAttempts < 1 || this.maxAttempts > 5) {
      throw new Error("maxAttempts must be an integer between 1 and 5");
    }
  }

  async dispatchTradeIntentNotifications(tradeIntentId: string): Promise<AdminNotificationDispatchResult> {
    const notifications = await this.prisma.adminNotification.findMany({
      where: { tradeIntentId, notificationType: "NEW_TRADE_REQUEST" },
      orderBy: { createdAt: "asc" },
    });
    let sentCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    for (const notification of notifications) {
      if (["SENT", "DELIVERED", "READ"].includes(notification.status)) {
        skippedCount += 1;
        continue;
      }
      const sent = await this.dispatchOne(notification);
      if (sent) sentCount += 1;
      else failedCount += 1;
    }
    await this.finalizeHandoff(tradeIntentId);
    return { tradeIntentId, sentCount, failedCount, skippedCount };
  }

  private async dispatchOne(notification: AdminNotification): Promise<boolean> {
    let currentAttemptCount = notification.attemptCount;
    while (currentAttemptCount < this.maxAttempts) {
      const attemptAt = this.now();
      const claimed = await this.prisma.adminNotification.updateMany({
        where: {
          id: notification.id,
          status: { in: ["PENDING", "FAILED"] },
          attemptCount: currentAttemptCount,
        },
        data: { status: "SENDING", attemptCount: { increment: 1 }, lastAttemptAt: attemptAt },
      });
      if (claimed.count === 0) {
        const latest = await this.prisma.adminNotification.findUniqueOrThrow({ where: { id: notification.id } });
        return latest.status === "SENT";
      }
      currentAttemptCount += 1;
      try {
        const alert = await this.loadAlert(notification.tradeIntentId);
        const response = await this.sender.sendTemplate({
          to: notification.recipient,
          templateName: this.config.templateName,
          language: this.config.templateLanguage,
          bodyParameters: adminTradeAlertTemplateParameters(
            alert,
            this.config.operationalTimeZone ?? "America/Edmonton",
          ),
        });
        await this.prisma.adminNotification.update({
          where: { id: notification.id },
          data: {
            status: "SENT",
            externalMessageId: response.messageId,
            sentAt: this.now(),
            safeFailureCode: null,
            safeFailureMessage: null,
          },
        });
        return true;
      } catch (error) {
        const failure = safeFailure(error);
        await this.prisma.adminNotification.update({
          where: { id: notification.id },
          data: {
            status: "FAILED",
            safeFailureCode: failure.code,
            safeFailureMessage: failure.message,
          },
        });
        if (!failure.retryable) return false;
      }
    }
    return false;
  }

  private async loadAlert(tradeIntentId: string): Promise<TradeRequestAlert> {
    const intent = await this.prisma.tradeIntent.findUniqueOrThrow({
      where: { id: tradeIntentId },
      include: { quote: true, conversation: { include: { customerChannel: true } } },
    });
    if (!intent.handoffRequestedAt) {
      throw new Error("trade request is not ready for admin delivery");
    }
    const customerWhatsAppId =
      intent.contactWhatsAppNumber ?? (intent.conversation?.customerChannel?.channelType === "WHATSAPP"
        ? intent.conversation.customerChannel.externalIdentifier
        : null);
    if (!intent.quote) return {
      kind: "GENERAL_ASSISTANCE",
      tradeRequestReference: intent.publicReference,
      sourceCurrency: "", targetCurrency: "", sourceAmount: "", indicativeTargetAmount: "", indicativeCustomerRate: "",
      purposeLabel: "Customer asked to speak with the Barrel team", purposeDetail: null,
      customerWhatsAppId, requestedAt: intent.handoffRequestedAt.toISOString(),
    };
    return buildTradeRequestAlert({
      publicReference: intent.publicReference,
      tradeIntentReference: intent.tradeIntentReference,
      sourceCurrency: intent.sourceCurrency!,
      targetCurrency: intent.targetCurrency!,
      sourceAmountMinor: intent.sourceAmountMinor!,
      indicativeTargetAmountMinor: intent.indicativeTargetAmountMinor!,
      customerRate: intent.quote.customerRate,
      purposeOfPayment: intent.purposeOfPayment,
      purposeOfPaymentDetail: intent.purposeOfPaymentDetail,
      customerWhatsAppId,
      requestedAt: intent.handoffRequestedAt,
      quoteCreatedAt: intent.quote.createdAt,
      customerQuoteExpiresAt: intent.quote.customerQuoteExpiresAt,
    });
  }

  private async finalizeHandoff(tradeIntentId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const intent = await tx.tradeIntent.findUniqueOrThrow({ where: { id: tradeIntentId } });
      const sentCount = await tx.adminNotification.count({ where: { tradeIntentId, status: "SENT" } });
      if (sentCount > 0) {
        if (intent.handoffState === "HANDED_OFF") return;
        const at = this.now();
        await tx.tradeIntent.update({
          where: { id: tradeIntentId },
          data: {
            handoffState: "HANDED_OFF",
            alertSentAt: intent.alertSentAt ?? at,
            handedOffAt: intent.handedOffAt ?? at,
          },
        });
        if (intent.conversationId) {
          await tx.conversation.update({ where: { id: intent.conversationId }, data: { automationMode: "HUMAN", handoffStartedAt: at } });
          await tx.auditLog.create({ data: { actorType: "SYSTEM", action: "HUMAN_HANDOFF_STARTED", entityType: "Conversation", entityId: intent.conversationId, source: "SYSTEM" } });
        }
        return;
      }
      const remaining = await tx.adminNotification.count({
        where: { tradeIntentId, status: { in: ["PENDING", "SENDING"] } },
      });
      if (remaining === 0) {
        await tx.tradeIntent.update({ where: { id: tradeIntentId }, data: { handoffState: "FAILED" } });
        if (intent.conversationId) await tx.auditLog.create({ data: { actorType: "SYSTEM", action: "HUMAN_HANDOFF_FAILED", entityType: "Conversation", entityId: intent.conversationId, source: "SYSTEM" } });
      }
    });
  }
}
