import { Prisma, type PrismaClient } from "@prisma/client";
import type { ConversationMessageInput, ConversationRepository, ConversationSession, OutboundMessageStatus } from "./types";
import type { WebhookEventRepository } from "./webhook";

function toSession(value: {
  id: string;
  state: string;
  automationMode: string;
  selectedSourceCurrency: string | null;
  selectedTargetCurrency: string | null;
  latestQuoteId: string | null;
  latestTradeIntentId: string | null;
  lastInboundAt: Date | null;
  handoffStartedAt: Date | null;
  lastOperatorActivityAt: Date | null;
}): ConversationSession {
  return value as ConversationSession;
}

export class PrismaConversationRepository implements ConversationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getOrCreate(externalIdentifier: string, at: Date): Promise<ConversationSession> {
    const channel = await this.prisma.customerChannel.upsert({
      where: { channelType_externalIdentifier: { channelType: "WHATSAPP", externalIdentifier } },
      update: {},
      create: { channelType: "WHATSAPP", externalIdentifier },
    });
    const conversation = await this.prisma.conversation.upsert({
      where: { customerChannelId: channel.id },
      update: {},
      create: { customerChannelId: channel.id, lastInboundAt: at },
    });
    return toSession(conversation);
  }

  async listEnabledDirections() {
    return this.prisma.corridorConfig.findMany({
      where: { enabled: true },
      orderBy: [{ sourceCurrency: "asc" }, { targetCurrency: "asc" }],
      select: {
        sourceCurrency: true,
        targetCurrency: true,
        minSourceAmountMinor: true,
        maxSourceAmountMinor: true,
      },
    });
  }

  async setJourney(
    id: string,
    input: { state: ConversationSession["state"]; sourceCurrency?: string | null; targetCurrency?: string | null },
  ): Promise<void> {
    await this.prisma.conversation.update({
      where: { id },
      data: {
        state: input.state,
        selectedSourceCurrency: input.sourceCurrency,
        selectedTargetCurrency: input.targetCurrency,
      },
    });
  }

  async presentQuote(id: string, quoteId: string): Promise<void> {
    await this.prisma.conversation.update({ where: { id }, data: { state: "QUOTE_PRESENTED", latestQuoteId: quoteId } });
  }

  async markOptedOut(id: string, at: Date): Promise<void> {
    await this.prisma.conversation.update({ where: { id }, data: { state: "OPTED_OUT", optedOutAt: at } });
  }

  async recordInbound(id: string, at: Date): Promise<void> {
    await this.prisma.conversation.update({ where: { id }, data: { lastInboundAt: at } });
  }

  async recordMessage(input: ConversationMessageInput): Promise<boolean> {
    try {
      await this.prisma.conversationMessage.create({
        data: { ...input, metadata: input.metadata as Prisma.InputJsonValue | undefined },
      });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return false;
      throw error;
    }
  }

  async recordOutboundStatus(input: OutboundMessageStatus): Promise<boolean> {
    const data = input.status === "sent"
      ? { sentAt: input.occurredAt }
      : input.status === "delivered"
        ? { deliveredAt: input.occurredAt }
        : input.status === "read"
          ? { readAt: input.occurredAt }
          : {
              failedAt: input.occurredAt,
              failureCode: input.failureCode,
              failureMessage: input.failureMessage,
            };
    const result = await this.prisma.conversationMessage.updateMany({
      where: { externalMessageId: input.messageId, direction: "OUTBOUND" },
      data,
    });
    return result.count > 0;
  }

  async closeStaleHandoff(id: string, at: Date, idleTimeoutMs: number): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const conversation = await tx.conversation.findUniqueOrThrow({ where: { id } });
      if (conversation.automationMode !== "HUMAN") return false;
      const lastActivity = [conversation.lastInboundAt, conversation.lastOperatorActivityAt, conversation.handoffStartedAt]
        .filter((value): value is Date => value != null)
        .reduce((latest, value) => value > latest ? value : latest, new Date(0));
      if (at.getTime() - lastActivity.getTime() <= idleTimeoutMs) return false;
      await tx.conversation.update({ where: { id }, data: { automationMode: "BOT", state: "IDLE", handoffClosedAt: at, handoffClosedBy: "STALE_TIMEOUT" } });
      await tx.tradeIntent.updateMany({ where: { conversationId: id, handoffState: "HANDED_OFF" }, data: { handoffState: "CLOSED", handoffClosedAt: at, handoffClosedBy: "STALE_TIMEOUT" } });
      await tx.auditLog.create({ data: { actorType: "SYSTEM", action: "HUMAN_HANDOFF_STALE_CLOSED", entityType: "Conversation", entityId: id, source: "SYSTEM" } });
      return true;
    });
  }
}

export class PrismaWebhookEventRepository implements WebhookEventRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async reserve(input: {
    provider: "META_WHATSAPP";
    externalId: string;
    eventType: string;
    payloadHash: string;
  }): Promise<boolean> {
    try {
      await this.prisma.webhookEvent.create({ data: input });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return false;
      throw error;
    }
  }

  async markProcessed(provider: "META_WHATSAPP", externalId: string, at: Date): Promise<void> {
    await this.prisma.webhookEvent.update({
      where: { provider_externalId: { provider, externalId } },
      data: { processedAt: at },
    });
  }
}
