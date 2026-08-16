import "server-only";
import { prisma } from "@barrel/db";
import { formatCurrencyMinor } from "@barrel/pricing";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 50;
const DEFAULT_MESSAGE_PAGE_SIZE = 50;

function pageSize(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, MAX_PAGE_SIZE) : fallback;
}

function pageNumber(value: string | null): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function preview(value: string | null): string | null {
  if (!value) return null;
  return value.length > 180 ? `${value.slice(0, 177)}…` : value;
}

function displayName(customer: {
  individualProfile: { firstName: string; lastName: string } | null;
  businessProfile: { legalName: string; tradingName: string | null } | null;
} | null): string | null {
  if (!customer) return null;
  if (customer.businessProfile) return customer.businessProfile.tradingName ?? customer.businessProfile.legalName;
  if (customer.individualProfile) return `${customer.individualProfile.firstName} ${customer.individualProfile.lastName}`;
  return null;
}

function activityAt(conversation: { lastInboundAt: Date | null; lastOperatorActivityAt: Date | null; updatedAt: Date }, latestAt: Date | null): Date {
  return [conversation.lastInboundAt, conversation.lastOperatorActivityAt, latestAt, conversation.updatedAt]
    .filter((value): value is Date => value != null)
    .reduce((latest, value) => value > latest ? value : latest, new Date(0));
}

function modeRank(mode: "BOT" | "HANDOFF_PENDING" | "HUMAN"): number {
  return mode === "HANDOFF_PENDING" ? 0 : mode === "HUMAN" ? 1 : 2;
}

function cursorFor(message: { createdAt: Date; id: string }): string {
  return Buffer.from(JSON.stringify({ createdAt: message.createdAt.toISOString(), id: message.id })).toString("base64url");
}

function parseCursor(value: string | null): { createdAt: Date; id: string } | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as { createdAt?: unknown; id?: unknown };
    const createdAt = typeof parsed.createdAt === "string" ? new Date(parsed.createdAt) : null;
    return createdAt && !Number.isNaN(createdAt.getTime()) && typeof parsed.id === "string" ? { createdAt, id: parsed.id } : null;
  } catch {
    return null;
  }
}

export async function listInternalConversations(params: URLSearchParams) {
  const limit = pageSize(params.get("limit"), DEFAULT_PAGE_SIZE);
  const page = pageNumber(params.get("page"));
  const conversations = await prisma.conversation.findMany({
    include: {
      customerChannel: {
        select: {
          externalIdentifier: true,
          customer: { select: {
            individualProfile: { select: { firstName: true, lastName: true } },
            businessProfile: { select: { legalName: true, tradingName: true } },
          } },
        },
      },
      messages: { select: { textBody: true, createdAt: true, senderType: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1 },
      tradeIntents: {
        select: { publicReference: true, sourceCurrency: true, targetCurrency: true, handoffRequestedAt: true },
        orderBy: [{ handoffRequestedAt: "desc" }, { createdAt: "desc" }],
        take: 1,
      },
    },
  });
  const ordered = conversations.sort((a, b) => {
    const rank = modeRank(a.automationMode) - modeRank(b.automationMode);
    if (rank) return rank;
    const aActivity = activityAt(a, a.messages[0]?.createdAt ?? null).getTime();
    const bActivity = activityAt(b, b.messages[0]?.createdAt ?? null).getTime();
    return bActivity - aActivity || b.id.localeCompare(a.id);
  });
  const start = (page - 1) * limit;
  const items = ordered.slice(start, start + limit).map((conversation) => {
    const message = conversation.messages[0] ?? null;
    const intent = conversation.tradeIntents[0] ?? null;
    return {
      conversationId: conversation.id,
      customer: {
        whatsappNumber: conversation.customerChannel?.externalIdentifier ?? null,
        displayName: displayName(conversation.customerChannel?.customer ?? null),
      },
      automationMode: conversation.automationMode,
      latestMessagePreview: preview(message?.textBody ?? null),
      latestMessageAt: message?.createdAt.toISOString() ?? null,
      latestMessageSenderType: message?.senderType ?? null,
      publicReference: intent?.publicReference ?? null,
      sourceCurrency: intent?.sourceCurrency ?? null,
      targetCurrency: intent?.targetCurrency ?? null,
      handoffRequestedAt: intent?.handoffRequestedAt?.toISOString() ?? null,
    };
  });
  return { conversations: items, page: { number: page, limit, total: ordered.length, hasMore: start + items.length < ordered.length } };
}

export async function getInternalConversation(conversationId: string, params: URLSearchParams) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      customerChannel: { select: { externalIdentifier: true, customer: { select: {
        individualProfile: { select: { firstName: true, lastName: true } },
        businessProfile: { select: { legalName: true, tradingName: true } },
      } } } },
      latestQuote: {
        select: {
          sourceCurrency: true, targetCurrency: true, sourceAmountMinor: true, targetAmountMinor: true,
          customerRate: true, createdAt: true, customerQuoteExpiresAt: true,
        },
      },
      tradeIntents: {
        select: { publicReference: true, handoffState: true, handoffRequestedAt: true, handedOffAt: true, handoffClosedAt: true, status: true },
        orderBy: [{ handoffRequestedAt: "desc" }, { createdAt: "desc" }], take: 1,
      },
    },
  });
  if (!conversation) return null;

  const limit = pageSize(params.get("messageLimit"), DEFAULT_MESSAGE_PAGE_SIZE);
  const cursor = parseCursor(params.get("before"));
  const messages = await prisma.conversationMessage.findMany({
    where: {
      conversationId,
      ...(cursor ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] } : {}),
    },
    select: {
      id: true, senderType: true, contentType: true, textBody: true, createdAt: true,
      sentAt: true, deliveredAt: true, readAt: true, failedAt: true,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  });
  const hasMore = messages.length > limit;
  const segment = (hasMore ? messages.slice(0, limit) : messages).reverse();
  const intent = conversation.tradeIntents[0] ?? null;
  const quote = conversation.latestQuote;
  return {
    conversation: {
      conversationId: conversation.id,
      automationMode: conversation.automationMode,
      customer: {
        whatsappNumber: conversation.customerChannel?.externalIdentifier ?? null,
        displayName: displayName(conversation.customerChannel?.customer ?? null),
      },
      handoff: intent ? {
        publicReference: intent.publicReference,
        state: intent.handoffState,
        tradeRequestStatus: intent.status,
        requestedAt: intent.handoffRequestedAt?.toISOString() ?? null,
        handedOffAt: intent.handedOffAt?.toISOString() ?? null,
        closedAt: intent.handoffClosedAt?.toISOString() ?? null,
      } : null,
      quote: quote ? {
        publicReference: intent?.publicReference ?? null,
        sourceCurrency: quote.sourceCurrency,
        targetCurrency: quote.targetCurrency,
        sourceAmount: formatCurrencyMinor(quote.sourceAmountMinor, quote.sourceCurrency),
        indicativeTargetAmount: formatCurrencyMinor(quote.targetAmountMinor, quote.targetCurrency),
        indicativeCustomerRate: quote.customerRate.toString(),
        quoteCreatedAt: quote.createdAt.toISOString(),
        customerRequestExpiresAt: quote.customerQuoteExpiresAt.toISOString(),
        indicative: true,
      } : null,
    },
    messages: segment.map((message) => ({
      senderType: message.senderType,
      contentType: message.contentType,
      textBody: message.textBody,
      createdAt: message.createdAt.toISOString(),
      sentAt: message.sentAt?.toISOString() ?? null,
      deliveredAt: message.deliveredAt?.toISOString() ?? null,
      readAt: message.readAt?.toISOString() ?? null,
      failedAt: message.failedAt?.toISOString() ?? null,
    })),
    messagePage: { limit, hasMore, nextBefore: hasMore ? cursorFor(segment[0]!) : null },
  };
}
