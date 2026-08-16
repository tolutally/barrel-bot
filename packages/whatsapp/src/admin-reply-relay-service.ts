import { Prisma, type PrismaClient, type WhatsAppRelayDirection } from "@prisma/client";
import { formatCurrencyMinor } from "@barrel/pricing";
import type { InboundWhatsAppMessage } from "./webhook";
import type { WhatsAppClient } from "./types";

const MAX_MESSAGE_LENGTH = 4_096;

function digits(value: string): string {
  return value.replace(/\D/g, "");
}

function identifierVariants(value: string): string[] {
  const trimmed = value.trim();
  const normalized = digits(value);
  return [...new Set([trimmed, normalized, normalized ? `+${normalized}` : ""].filter(Boolean))];
}

function safeRelayFailure(error: unknown): { code: string; message: string } {
  if (error && typeof error === "object") {
    const candidate = error as { safeCode?: unknown; safeMessage?: unknown };
    if (typeof candidate.safeCode === "string" && typeof candidate.safeMessage === "string") {
      return { code: candidate.safeCode.slice(0, 80), message: candidate.safeMessage.slice(0, 300) };
    }
  }
  return { code: "META_RELAY_SEND_ERROR", message: "Meta WhatsApp relay delivery failed" };
}

type AdminContext = {
  tradeIntentId: string;
  tradeIntentReference: string;
  customerWhatsAppId: string | null;
  adminNotificationId: string | null;
  configuredRecipient: string;
  handoffState: string;
  automationMode: string | null;
  sourceCurrency: string | null;
  targetCurrency: string | null;
  sourceAmountMinor: bigint | null;
  conversationId: string | null;
};

export type AdminReplyRelayResult =
  | { handled: false }
  | { handled: true; action: "ADMIN_HELP" | "ADMIN_RELAYED" | "ADMIN_ALREADY_ASSIGNED" | "CUSTOMER_QUEUED" | "CUSTOMER_RELAYED" | "CONVERSATION_FINISHED" };

export class WhatsAppAdminReplyRelayService {
  private readonly adminIds: Set<string>;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly whatsApp: WhatsAppClient,
    adminRecipients: readonly string[],
    private readonly now: () => Date = () => new Date(),
    private readonly humanIdleTimeoutMs = Number(process.env.HUMAN_HANDOFF_IDLE_TIMEOUT_HOURS ?? "24") * 60 * 60 * 1_000,
  ) {
    this.adminIds = new Set(adminRecipients.map(digits));
  }

  async handleInboundMessage(message: InboundWhatsAppMessage): Promise<AdminReplyRelayResult> {
    if (this.adminIds.has(digits(message.from))) return this.handleAdminReply(message);
    if (message.text.trim().toUpperCase() === "STOP") return { handled: false };
    return this.handleCustomerReply(message);
  }

  private async handleAdminReply(message: InboundWhatsAppMessage): Promise<AdminReplyRelayResult> {
    if (!message.contextMessageId) {
      await this.whatsApp.sendText(message.from, "Reply directly to a Barrel trade alert or forwarded customer message to take over that trade.");
      return { handled: true, action: "ADMIN_HELP" };
    }
    const context = await this.findAdminContext(message.from, message.contextMessageId);
    if (!context?.customerWhatsAppId || context.handoffState !== "HANDED_OFF" || context.automationMode !== "HUMAN") {
      await this.whatsApp.sendText(message.from, "That trade alert is unavailable or is no longer open for human replies.");
      return { handled: true, action: "ADMIN_HELP" };
    }
    const body = message.text.trim();
    if (!body || body.length > MAX_MESSAGE_LENGTH) {
      await this.whatsApp.sendText(message.from, "Please reply with a text message between 1 and 4,096 characters.");
      return { handled: true, action: "ADMIN_HELP" };
    }
    if (body.toUpperCase() === "FINISH CONVERSATION") {
      await this.finishConversation(context.tradeIntentId, message.from);
      return { handled: true, action: "CONVERSATION_FINISHED" };
    }

    const adminVariants = identifierVariants(context.configuredRecipient);
    const claimed = await this.prisma.tradeIntent.updateMany({
      where: { id: context.tradeIntentId, assignedAdminRecipient: null },
      data: { assignedAdminRecipient: context.configuredRecipient, assignedAt: this.now() },
    });
    if (claimed.count === 0) {
      const assignment = await this.prisma.tradeIntent.findUniqueOrThrow({
        where: { id: context.tradeIntentId },
        select: { assignedAdminRecipient: true },
      });
      if (!assignment.assignedAdminRecipient || !adminVariants.includes(assignment.assignedAdminRecipient)) {
        await this.whatsApp.sendText(message.from, `Trade ${context.tradeIntentReference} has already been claimed by another Barrel specialist.`);
        return { handled: true, action: "ADMIN_ALREADY_ASSIGNED" };
      }
    }

    const relay = await this.upsertRelay({
      tradeIntentId: context.tradeIntentId,
      adminNotificationId: context.adminNotificationId,
      direction: "ADMIN_TO_CUSTOMER",
      sender: digits(message.from),
      recipient: digits(context.customerWhatsAppId),
      body,
      inboundExternalMessageId: message.id,
      inReplyToExternalMessageId: message.contextMessageId,
    });
    await this.deliver(relay.id, context.customerWhatsAppId, body);
    if (context.conversationId) await this.prisma.conversation.update({ where: { id: context.conversationId }, data: { lastOperatorActivityAt: this.now() } });
    await this.flushPendingCustomerMessages(context.tradeIntentId, context.configuredRecipient, {
      tradeIntentReference: context.tradeIntentReference,
      customerWhatsAppId: context.customerWhatsAppId,
      sourceCurrency: context.sourceCurrency,
      targetCurrency: context.targetCurrency,
      sourceAmountMinor: context.sourceAmountMinor,
    });
    return { handled: true, action: "ADMIN_RELAYED" };
  }

  private async handleCustomerReply(message: InboundWhatsAppMessage): Promise<AdminReplyRelayResult> {
    const variants = identifierVariants(message.from);
    const intent = await this.prisma.tradeIntent.findFirst({
      where: {
        handoffState: { in: ["ALERT_PENDING", "HANDED_OFF", "FAILED"] },
        OR: [
          { contactWhatsAppNumber: { in: variants } },
          {
            conversation: {
              is: { customerChannel: { is: { channelType: "WHATSAPP", externalIdentifier: { in: variants } } } },
            },
          },
        ],
      },
      orderBy: { handedOffAt: "desc" },
      select: {
        id: true,
        tradeIntentReference: true,
        assignedAdminRecipient: true,
        sourceCurrency: true,
        targetCurrency: true,
        sourceAmountMinor: true,
        conversationId: true,
        conversation: { select: { automationMode: true, lastInboundAt: true, lastOperatorActivityAt: true, handoffStartedAt: true } },
      },
    });
    if (!intent) return { handled: false };
    if (intent.conversation?.automationMode === "HUMAN") {
      const activity = [intent.conversation.lastInboundAt, intent.conversation.lastOperatorActivityAt, intent.conversation.handoffStartedAt]
        .filter((value): value is Date => value != null).reduce((latest, value) => value > latest ? value : latest, new Date(0));
      if (this.now().getTime() - activity.getTime() > this.humanIdleTimeoutMs) {
        await this.finishConversation(intent.id, "STALE_TIMEOUT", "HUMAN_HANDOFF_STALE_CLOSED");
        return { handled: false };
      }
    }
    if (intent.conversationId) {
      const at = this.now();
      await this.prisma.$transaction([
        this.prisma.conversation.update({ where: { id: intent.conversationId }, data: { lastInboundAt: at } }),
        this.prisma.conversationMessage.create({
          data: {
            conversationId: intent.conversationId,
            direction: "INBOUND",
            senderType: "CUSTOMER",
            channel: "WHATSAPP",
            contentType: message.type === "interactive" ? "INTERACTIVE" : "TEXT",
            textBody: message.text,
            externalMessageId: message.id,
            replyToExternalMessageId: message.contextMessageId,
            metadata: message.metadata as Prisma.InputJsonValue | undefined,
          },
        }),
      ]);
    }

    const assignedRecipient = intent.assignedAdminRecipient;
    const notification = assignedRecipient
      ? await this.prisma.adminNotification.findFirst({
          where: {
            tradeIntentId: intent.id,
            status: "SENT",
            recipient: { in: identifierVariants(assignedRecipient) },
          },
          select: { id: true },
        })
      : null;
    const relay = await this.upsertRelay({
      tradeIntentId: intent.id,
      adminNotificationId: notification?.id ?? null,
      direction: "CUSTOMER_TO_ADMIN",
      sender: digits(message.from),
      recipient: assignedRecipient ?? "",
      body: message.text.trim().slice(0, MAX_MESSAGE_LENGTH),
      inboundExternalMessageId: message.id,
      inReplyToExternalMessageId: message.contextMessageId ?? null,
    });
    if (!assignedRecipient) return { handled: true, action: "CUSTOMER_QUEUED" };

    await this.deliver(
      relay.id,
      assignedRecipient,
      this.customerForwardBody({
        tradeIntentReference: intent.tradeIntentReference,
        customerWhatsAppId: message.from,
        sourceCurrency: intent.sourceCurrency,
        targetCurrency: intent.targetCurrency,
        sourceAmountMinor: intent.sourceAmountMinor,
      }, relay.body),
    );
    return { handled: true, action: "CUSTOMER_RELAYED" };
  }

  private async finishConversation(tradeIntentId: string, closedBy: string, action = "HUMAN_HANDOFF_FINISHED"): Promise<void> {
    const at = this.now();
    await this.prisma.$transaction(async (tx) => {
      const intent = await tx.tradeIntent.findUniqueOrThrow({ where: { id: tradeIntentId } });
      if (!intent.conversationId || intent.handoffState === "CLOSED") return;
      await tx.tradeIntent.update({ where: { id: intent.id }, data: { handoffState: "CLOSED", handoffClosedAt: at, handoffClosedBy: closedBy } });
      await tx.conversation.update({ where: { id: intent.conversationId }, data: { automationMode: "BOT", state: "IDLE", handoffClosedAt: at, handoffClosedBy: closedBy } });
      await tx.auditLog.create({ data: { actorType: closedBy === "STALE_TIMEOUT" ? "SYSTEM" : "STAFF", actorId: closedBy === "STALE_TIMEOUT" ? null : closedBy, action, entityType: "Conversation", entityId: intent.conversationId, source: closedBy === "STALE_TIMEOUT" ? "SYSTEM" : "WHATSAPP" } });
      await tx.auditLog.create({ data: { actorType: "SYSTEM", action: "AUTOMATION_RESUMED", entityType: "Conversation", entityId: intent.conversationId, source: "SYSTEM" } });
    });
  }

  private async findAdminContext(from: string, contextMessageId: string): Promise<AdminContext | null> {
    const variants = identifierVariants(from);
    const notification = await this.prisma.adminNotification.findFirst({
      where: {
        recipient: { in: variants },
        externalMessageId: contextMessageId,
        status: { in: ["SENT", "DELIVERED", "READ"] },
      },
      include: {
        tradeIntent: { include: { conversation: { include: { customerChannel: true } } } },
      },
    });
    if (notification) {
      const intent = notification.tradeIntent;
      return {
        tradeIntentId: intent.id,
        tradeIntentReference: intent.tradeIntentReference,
        customerWhatsAppId: intent.contactWhatsAppNumber ?? intent.conversation?.customerChannel?.externalIdentifier ?? null,
        adminNotificationId: notification.id,
        configuredRecipient: notification.recipient,
        handoffState: intent.handoffState,
        automationMode: intent.conversation?.automationMode ?? null,
        sourceCurrency: intent.sourceCurrency,
        targetCurrency: intent.targetCurrency,
        sourceAmountMinor: intent.sourceAmountMinor,
        conversationId: intent.conversationId,
      };
    }
    const relay = await this.prisma.whatsAppRelayMessage.findFirst({
      where: {
        recipient: { in: variants },
        outboundExternalMessageId: contextMessageId,
        direction: "CUSTOMER_TO_ADMIN",
        status: "SENT",
      },
      include: {
        tradeIntent: { include: { conversation: { include: { customerChannel: true } } } },
        adminNotification: true,
      },
    });
    if (!relay) return null;
    const intent = relay.tradeIntent;
    return {
      tradeIntentId: intent.id,
      tradeIntentReference: intent.tradeIntentReference,
      customerWhatsAppId: intent.contactWhatsAppNumber ?? intent.conversation?.customerChannel?.externalIdentifier ?? null,
      adminNotificationId: relay.adminNotificationId,
      configuredRecipient: relay.adminNotification?.recipient ?? `+${digits(from)}`,
      handoffState: intent.handoffState,
      automationMode: intent.conversation?.automationMode ?? null,
      sourceCurrency: intent.sourceCurrency,
      targetCurrency: intent.targetCurrency,
      sourceAmountMinor: intent.sourceAmountMinor,
      conversationId: intent.conversationId,
    };
  }

  private async flushPendingCustomerMessages(
    tradeIntentId: string,
    adminRecipient: string,
    context: {
      tradeIntentReference: string;
      customerWhatsAppId: string;
      sourceCurrency: string | null;
      targetCurrency: string | null;
      sourceAmountMinor: bigint | null;
    },
  ): Promise<void> {
    const pending = await this.prisma.whatsAppRelayMessage.findMany({
      where: { tradeIntentId, direction: "CUSTOMER_TO_ADMIN", status: "PENDING", recipient: "" },
      orderBy: { createdAt: "asc" },
    });
    for (const relay of pending) {
      await this.prisma.whatsAppRelayMessage.update({ where: { id: relay.id }, data: { recipient: adminRecipient } });
      await this.deliver(relay.id, adminRecipient, this.customerForwardBody(context, relay.body));
    }
  }

  private customerForwardBody(context: {
    tradeIntentReference: string;
    customerWhatsAppId: string;
    sourceCurrency: string | null;
    targetCurrency: string | null;
    sourceAmountMinor: bigint | null;
  }, body: string): string {
    const tradeCode = context.tradeIntentReference.replace(/^BARREL-TI-/i, "").split("-")[0]!.toUpperCase();
    const customerDigits = digits(context.customerWhatsAppId);
    const maskedCustomer = customerDigits ? `•••${customerDigits.slice(-4)}` : "unknown";
    const hasQuote = context.sourceCurrency && context.targetCurrency && context.sourceAmountMinor != null;
    const quoteContext = hasQuote
      ? ` | ${context.sourceCurrency} → ${context.targetCurrency}\nSending ${formatCurrencyMinor(context.sourceAmountMinor!, context.sourceCurrency!)}`
      : "";
    return `🔵 ${hasQuote ? "TRADE" : "ENQUIRY"} ${tradeCode}\nCustomer ${maskedCustomer}${quoteContext}\n\nCustomer:\n${body}\n\nReply directly to this message only.`;
  }

  private async upsertRelay(input: {
    tradeIntentId: string;
    adminNotificationId: string | null;
    direction: WhatsAppRelayDirection;
    sender: string;
    recipient: string;
    body: string;
    inboundExternalMessageId: string;
    inReplyToExternalMessageId: string | null;
  }) {
    return this.prisma.whatsAppRelayMessage.upsert({
      where: {
        inboundExternalMessageId_direction_recipient: {
          inboundExternalMessageId: input.inboundExternalMessageId,
          direction: input.direction,
          recipient: input.recipient,
        },
      },
      update: {},
      create: input,
    });
  }

  private async deliver(relayId: string, to: string, body: string): Promise<void> {
    const claimed = await this.prisma.whatsAppRelayMessage.updateMany({
      where: { id: relayId, status: { in: ["PENDING", "FAILED"] } },
      data: { status: "SENDING", attemptCount: { increment: 1 }, safeFailureCode: null, safeFailureMessage: null },
    });
    if (claimed.count === 0) return;
    try {
      const result = await this.whatsApp.sendText(to, body);
      await this.prisma.whatsAppRelayMessage.update({
        where: { id: relayId },
        data: { status: "SENT", outboundExternalMessageId: result.messageId, sentAt: this.now() },
      });
    } catch (error) {
      const failure = safeRelayFailure(error);
      await this.prisma.whatsAppRelayMessage.update({
        where: { id: relayId },
        data: { status: "FAILED", safeFailureCode: failure.code, safeFailureMessage: failure.message },
      });
      throw error;
    }
  }
}
