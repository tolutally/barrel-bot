import { beforeEach, describe, expect, it, vi } from "vitest";

const { findMany, findUnique, messageFindMany } = vi.hoisted(() => ({
  findMany: vi.fn(), findUnique: vi.fn(), messageFindMany: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@barrel/db", () => ({ prisma: { conversation: { findMany, findUnique }, conversationMessage: { findMany: messageFindMany } } }));

import { getInternalConversation, listInternalConversations } from "../../apps/api/src/lib/internal-conversations";

const at = (value: string) => new Date(value);
function conversation(id: string, mode: "BOT" | "HANDOFF_PENDING" | "HUMAN", messageAt: string, senderType = "BOT") {
  return {
    id, automationMode: mode, lastInboundAt: at(messageAt), lastOperatorActivityAt: null, updatedAt: at(messageAt),
    customerChannel: { externalIdentifier: "15551234567", customer: { individualProfile: { firstName: "Ada", lastName: "Okafor" }, businessProfile: null } },
    messages: [{ textBody: `message-${id}`, createdAt: at(messageAt), senderType }],
    tradeIntents: [{ publicReference: `BRL-${id}`, sourceCurrency: "NGN", targetCurrency: "USD", handoffRequestedAt: mode === "BOT" ? null : at(messageAt) }],
  };
}

describe("internal conversation read models", () => {
  beforeEach(() => { findMany.mockReset(); findUnique.mockReset(); messageFindMany.mockReset(); });

  it("prioritizes handoff conversations, then human, and paginates sanitized list entries", async () => {
    findMany.mockResolvedValue([
      conversation("bot-new", "BOT", "2026-08-16T12:00:00Z"),
      conversation("human", "HUMAN", "2026-08-16T10:00:00Z", "CUSTOMER"),
      conversation("handoff", "HANDOFF_PENDING", "2026-08-16T09:00:00Z", "CUSTOMER"),
      conversation("bot-old", "BOT", "2026-08-16T08:00:00Z"),
    ]);
    const result = await listInternalConversations(new URLSearchParams("limit=2&page=1"));
    expect(result.conversations.map((item) => item.conversationId)).toEqual(["handoff", "human"]);
    expect(result.page).toEqual({ number: 1, limit: 2, total: 4, hasMore: true });
    expect(result.conversations[0]).toEqual(expect.objectContaining({
      customer: { whatsappNumber: "15551234567", displayName: "Ada Okafor" },
      publicReference: "BRL-handoff", sourceCurrency: "NGN", targetCurrency: "USD",
    }));
    expect(JSON.stringify(result)).not.toContain("providerQuoteId");
    expect(JSON.stringify(result)).not.toContain("expectedMarginMinor");
  });

  it("returns a chronological, customer-safe transcript and immutable quote snapshot", async () => {
    findUnique.mockResolvedValue({
      id: "conversation-1", automationMode: "HUMAN",
      customerChannel: { externalIdentifier: "15551234567", customer: { individualProfile: null, businessProfile: { legalName: "Acme Imports", tradingName: "Acme" } } },
      latestQuote: {
        sourceCurrency: "NGN", targetCurrency: "USD", sourceAmountMinor: 200_000_00n, targetAmountMinor: 120_00n,
        customerRate: "1666.67", createdAt: at("2026-08-16T08:00:00Z"), customerQuoteExpiresAt: at("2026-08-16T08:15:00Z"),
        providerQuoteId: "must-not-leak", expectedMarginMinor: 10n,
      },
      tradeIntents: [{ publicReference: "BRL-ABC123", handoffState: "HANDED_OFF", status: "READY_FOR_HANDOFF", handoffRequestedAt: at("2026-08-16T08:01:00Z"), handedOffAt: at("2026-08-16T08:02:00Z"), handoffClosedAt: null }],
    });
    messageFindMany.mockResolvedValue([
      { id: "m3", senderType: "OPERATOR", contentType: "TEXT", textBody: "We are checking.", createdAt: at("2026-08-16T08:03:00Z"), sentAt: at("2026-08-16T08:03:00Z"), deliveredAt: null, readAt: null, failedAt: null, metadata: { raw: "not-returned" } },
      { id: "m2", senderType: "BOT", contentType: "INTERACTIVE", textBody: "Choose a currency", createdAt: at("2026-08-16T08:02:00Z"), sentAt: at("2026-08-16T08:02:00Z"), deliveredAt: at("2026-08-16T08:02:10Z"), readAt: null, failedAt: null },
      { id: "m1", senderType: "CUSTOMER", contentType: "TEXT", textBody: "RATE", createdAt: at("2026-08-16T08:01:00Z"), sentAt: null, deliveredAt: null, readAt: null, failedAt: null },
    ]);
    const result = await getInternalConversation("conversation-1", new URLSearchParams("messageLimit=2"));
    expect(result?.messages.map((message) => message.senderType)).toEqual(["BOT", "OPERATOR"]);
    expect(result?.messagePage.hasMore).toBe(true);
    expect(result?.conversation.quote).toEqual({
      publicReference: "BRL-ABC123", sourceCurrency: "NGN", targetCurrency: "USD", sourceAmount: "₦200,000.00",
      indicativeTargetAmount: "$120.00", indicativeCustomerRate: "1666.67", quoteCreatedAt: "2026-08-16T08:00:00.000Z",
      customerRequestExpiresAt: "2026-08-16T08:15:00.000Z", indicative: true,
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("must-not-leak");
    expect(serialized).not.toContain("expectedMarginMinor");
    expect(serialized).not.toContain("metadata");
    expect(serialized).not.toContain('"id":"m');
  });
});
