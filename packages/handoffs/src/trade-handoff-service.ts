import type { ChannelType, PaymentPurpose, PrismaClient } from "@prisma/client";
import { assertCustomerRequestWindowOpen } from "@barrel/domain";
import { randomUUID } from "node:crypto";
import { formatCurrencyMinor, formatCustomerRate } from "@barrel/pricing";

const PURPOSE_LABELS: Record<PaymentPurpose, string> = {
  SUPPLIER_VENDOR: "Supplier / vendor payment",
  GOODS_INVENTORY: "Goods / inventory",
  SERVICES_CONTRACTOR: "Services / contractor",
  INVESTMENT: "Investment",
  PERSONAL_TRANSFER: "Personal transfer",
  OTHER: "Other",
};

export type TradeRequestAlert = {
  kind: "RATE_CONTINUATION" | "GENERAL_ASSISTANCE";
  tradeRequestReference: string;
  sourceCurrency: string;
  targetCurrency: string;
  sourceAmount: string;
  indicativeTargetAmount: string;
  indicativeCustomerRate: string;
  purposeLabel: string;
  purposeDetail: string | null;
  customerWhatsAppId: string | null;
  requestedAt: string;
  quoteCreatedAt?: string;
  customerQuoteExpiresAt?: string;
};

export type CustomerSafeHandoffResult = {
  handoffId: string;
  publicReference: string;
  tradeRequestReference: string;
  requestedAt: string;
  notificationCount: number;
  alert: TradeRequestAlert;
};

export function buildTradeRequestAlert(input: {
  publicReference: string;
  tradeIntentReference: string;
  sourceCurrency: string;
  targetCurrency: string;
  sourceAmountMinor: bigint;
  indicativeTargetAmountMinor: bigint;
  customerRate: { toString(): string };
  purposeOfPayment?: PaymentPurpose | null;
  purposeOfPaymentDetail: string | null;
  customerWhatsAppId: string | null;
  requestedAt: Date;
  quoteCreatedAt?: Date;
  customerQuoteExpiresAt?: Date;
}): TradeRequestAlert {
  return {
    kind: "RATE_CONTINUATION",
    tradeRequestReference: input.publicReference,
    sourceCurrency: input.sourceCurrency,
    targetCurrency: input.targetCurrency,
    sourceAmount: formatCurrencyMinor(input.sourceAmountMinor, input.sourceCurrency),
    indicativeTargetAmount: formatCurrencyMinor(input.indicativeTargetAmountMinor, input.targetCurrency),
    indicativeCustomerRate: formatCustomerRate(input.sourceCurrency, input.targetCurrency, input.customerRate.toString()),
    purposeLabel: input.purposeOfPayment ? PURPOSE_LABELS[input.purposeOfPayment] : "Customer wants to continue with this rate",
    purposeDetail: input.purposeOfPaymentDetail,
    customerWhatsAppId: input.customerWhatsAppId,
    requestedAt: input.requestedAt.toISOString(),
    ...(input.quoteCreatedAt ? { quoteCreatedAt: input.quoteCreatedAt.toISOString() } : {}),
    ...(input.customerQuoteExpiresAt ? { customerQuoteExpiresAt: input.customerQuoteExpiresAt.toISOString() } : {}),
  };
}

export interface TradeHandoffApplicationService {
  requestHumanHandoff(input: {
    tradeIntentId: string;
    originatingChannel: ChannelType;
  }): Promise<CustomerSafeHandoffResult>;
  requestGeneralHumanHandoff(input: { conversationId: string; originatingChannel: ChannelType }): Promise<CustomerSafeHandoffResult>;
  finishConversation(input: { conversationId: string; operatorId: string }): Promise<void>;
}

export class TradeHandoffError extends Error {
  constructor(
    public readonly code:
      | "ORIGINATING_CHANNEL_MISMATCH"
      | "NO_ADMIN_RECIPIENTS"
      | "ALREADY_HANDED_OFF",
    message: string,
  ) {
    super(message);
    this.name = "TradeHandoffError";
  }
}

export class PrismaTradeHandoffService implements TradeHandoffApplicationService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly recipients: readonly string[],
    private readonly now: () => Date = () => new Date(),
  ) {}

  async requestGeneralHumanHandoff(input: { conversationId: string; originatingChannel: ChannelType }): Promise<CustomerSafeHandoffResult> {
    if (this.recipients.length === 0) throw new TradeHandoffError("NO_ADMIN_RECIPIENTS", "no admin notification recipients are configured");
    const existing = await this.prisma.tradeIntent.findFirst({
      where: { conversationId: input.conversationId, quoteId: null, handoffState: { in: ["ALERT_PENDING", "HANDED_OFF", "FAILED"] } },
      orderBy: { createdAt: "desc" },
    });
    const intent = existing ?? await this.prisma.tradeIntent.create({
      data: {
        publicReference: `BRL-${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`,
        tradeIntentReference: `BARREL-TI-${randomUUID()}`,
        conversationId: input.conversationId,
        originatingChannel: input.originatingChannel,
        status: "READY_FOR_HANDOFF",
      },
    });
    return this.prepareHandoff(intent.id, input.originatingChannel);
  }

  async finishConversation(input: { conversationId: string; operatorId: string }): Promise<void> {
    const at = this.now();
    await this.prisma.$transaction(async (tx) => {
      const conversation = await tx.conversation.findUniqueOrThrow({ where: { id: input.conversationId } });
      if (conversation.automationMode === "BOT") return;
      await tx.conversation.update({ where: { id: conversation.id }, data: {
        automationMode: "BOT", state: "IDLE", handoffClosedAt: at, handoffClosedBy: input.operatorId,
      } });
      await tx.tradeIntent.updateMany({ where: { conversationId: conversation.id, handoffState: { in: ["ALERT_PENDING", "HANDED_OFF", "FAILED"] } }, data: {
        handoffState: "CLOSED", handoffClosedAt: at, handoffClosedBy: input.operatorId,
      } });
      await tx.auditLog.create({ data: { actorType: "STAFF", actorId: input.operatorId, action: "HUMAN_HANDOFF_FINISHED", entityType: "Conversation", entityId: conversation.id, source: "CUSTOM_ADMIN" } });
      await tx.auditLog.create({ data: { actorType: "SYSTEM", action: "AUTOMATION_RESUMED", entityType: "Conversation", entityId: conversation.id, source: "SYSTEM" } });
    });
  }

  async requestHumanHandoff(input: {
    tradeIntentId: string;
    originatingChannel: ChannelType;
  }): Promise<CustomerSafeHandoffResult> {
    return this.prepareHandoff(input.tradeIntentId, input.originatingChannel);
  }

  private async prepareHandoff(tradeIntentId: string, originatingChannel: ChannelType): Promise<CustomerSafeHandoffResult> {
    if (this.recipients.length === 0) {
      throw new TradeHandoffError("NO_ADMIN_RECIPIENTS", "no admin notification recipients are configured");
    }
    return this.prisma.$transaction(async (tx) => {
      const intent = await tx.tradeIntent.findUniqueOrThrow({
        where: { id: tradeIntentId },
        include: {
          quote: true,
          conversation: { include: { customerChannel: true } },
        },
      });
      if (intent.originatingChannel !== originatingChannel) {
        throw new TradeHandoffError("ORIGINATING_CHANNEL_MISMATCH", "originating channel does not match");
      }
      if (intent.handoffState === "HANDED_OFF" || intent.handoffState === "CLOSED") {
        throw new TradeHandoffError("ALREADY_HANDED_OFF", "trade request has already been handed off");
      }
      if (intent.quote) assertCustomerRequestWindowOpen({ status: intent.quote.status, customerQuoteExpiresAt: intent.quote.customerQuoteExpiresAt, now: this.now() });

      const requestedAt = intent.handoffRequestedAt ?? this.now();
      if (intent.handoffState === "NOT_REQUESTED" || intent.handoffState === "FAILED") {
        await tx.tradeIntent.update({
          where: { id: intent.id },
          data: { handoffState: "ALERT_PENDING", handoffRequestedAt: requestedAt },
        });
        if (intent.conversationId) await tx.auditLog.create({ data: { actorType: "CUSTOMER", action: "HUMAN_HANDOFF_REQUESTED", entityType: "Conversation", entityId: intent.conversationId, source: "WHATSAPP" } });
      }
      if (intent.conversationId) {
        await tx.conversation.update({
          where: { id: intent.conversationId },
          data: { state: "TRADE_REQUEST_READY", automationMode: "HANDOFF_PENDING", handoffRequestedAt: requestedAt, handoffClosedAt: null, handoffClosedBy: null },
        });
      }
      for (const recipient of this.recipients) {
        await tx.adminNotification.upsert({
          where: {
            tradeIntentId_recipient_notificationType: {
              tradeIntentId: intent.id,
              recipient,
              notificationType: "NEW_TRADE_REQUEST",
            },
          },
          update: {},
          create: {
            tradeIntentId: intent.id,
            recipient,
            notificationType: "NEW_TRADE_REQUEST",
            channel: "WHATSAPP",
          },
        });
      }

      const customerWhatsAppId =
        intent.contactWhatsAppNumber ?? (intent.conversation?.customerChannel?.channelType === "WHATSAPP"
          ? intent.conversation.customerChannel.externalIdentifier
          : null);
      const alert = intent.quote ? buildTradeRequestAlert({
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
        requestedAt,
        quoteCreatedAt: intent.quote.createdAt,
        customerQuoteExpiresAt: intent.quote.customerQuoteExpiresAt,
      }) : {
        kind: "GENERAL_ASSISTANCE" as const,
        tradeRequestReference: intent.publicReference,
        sourceCurrency: "",
        targetCurrency: "",
        sourceAmount: "",
        indicativeTargetAmount: "",
        indicativeCustomerRate: "",
        purposeLabel: "Customer asked to speak with the Barrel team",
        purposeDetail: null,
        customerWhatsAppId,
        requestedAt: requestedAt.toISOString(),
      };
      return {
        handoffId: intent.id,
        publicReference: intent.publicReference,
        tradeRequestReference: intent.tradeIntentReference,
        requestedAt: requestedAt.toISOString(),
        notificationCount: this.recipients.length,
        alert,
      };
    });
  }
}
