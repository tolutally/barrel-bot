import { describe, expect, it, vi } from "vitest";
import {
  ConversationService,
  parseCustomerAmountMinor,
  type ConversationRepository,
  type ConversationSession,
  type TradeIntentApplicationService,
  type WhatsAppClient,
} from "@barrel/whatsapp";

function buildHarness(directions = [{ sourceCurrency: "NGN", targetCurrency: "CAD", minSourceAmountMinor: 100_000n, maxSourceAmountMinor: 1_000_000_000n }]) {
  const session: ConversationSession = {
    id: "conversation-1",
    state: "IDLE",
    automationMode: "BOT",
    selectedSourceCurrency: null,
    selectedTargetCurrency: null,
    latestQuoteId: null,
    latestTradeIntentId: null,
  };
  const repository: ConversationRepository = {
    getOrCreate: vi.fn(async () => ({ ...session })),
    listEnabledDirections: vi.fn(async () => directions),
    setJourney: vi.fn(async (_id, input) => {
      session.state = input.state;
      if (input.sourceCurrency !== undefined) session.selectedSourceCurrency = input.sourceCurrency;
      if (input.targetCurrency !== undefined) session.selectedTargetCurrency = input.targetCurrency;
    }),
    presentQuote: vi.fn(async (_id, quoteId) => { session.state = "QUOTE_PRESENTED"; session.latestQuoteId = quoteId; }),
    markOptedOut: vi.fn(async () => { session.state = "OPTED_OUT"; }),
    recordInbound: vi.fn(async () => undefined),
    recordMessage: vi.fn(async () => true),
    recordOutboundStatus: vi.fn(async () => false),
    closeStaleHandoff: vi.fn(async () => false),
  };
  const quoteService = {
    createIndicativeQuote: vi.fn(async () => ({
      id: "quote-1",
      quoteReference: "BARREL-Q-1",
      sourceCurrency: "NGN",
      targetCurrency: "CAD",
      sourceAmount: "₦2,000,000.00",
      targetAmount: "C$1,904.76",
      customerRate: "1050",
      customerQuoteExpiresAt: "2026-08-10T08:15:00.000Z",
      disclaimer: "Final rate is confirmed before trade submission.",
    })),
  };
  const baseIntent = {
    id: "intent-1",
    publicReference: "BRL-7K9M2Q4X",
    tradeIntentReference: "BARREL-TI-1",
    quoteId: "quote-1",
    customerId: null,
    customerType: null,
    sourceCurrency: "NGN",
    targetCurrency: "CAD",
    sourceAmountMinor: 200_000_000n,
    indicativeTargetAmountMinor: 190_476n,
    purposeOfPayment: null,
    purposeOfPaymentDetail: null,
    contactWhatsAppNumber: null,
    contactName: null,
    status: "PAYMENT_PURPOSE_REQUIRED",
    originatingChannel: "WHATSAPP" as const,
  };
  const tradeIntents: TradeIntentApplicationService = {
    createFromQuote: vi.fn(async () => {
      session.state = "AWAITING_PAYMENT_PURPOSE";
      session.latestTradeIntentId = baseIntent.id;
      return baseIntent;
    }),
    setPaymentPurpose: vi.fn(async (_conversationId, _intentId, purpose, detail) => {
      if (purpose === "OTHER" && !detail) {
        session.state = "AWAITING_PAYMENT_PURPOSE_DETAIL";
        return { ...baseIntent, purposeOfPayment: purpose };
      }
      session.state = "TRADE_REQUEST_READY";
      return { ...baseIntent, purposeOfPayment: purpose, purposeOfPaymentDetail: detail ?? null, status: "READY_FOR_HANDOFF" };
    }),
    createWebsiteRequest: vi.fn(async () => baseIntent),
  };
  const sent: Array<{ kind: string; body: string; options?: unknown }> = [];
  const whatsApp: WhatsAppClient = {
    downloadMedia: vi.fn(async () => ({ bytes: new Uint8Array(), mimeType: "image/jpeg" })),
    uploadMedia: vi.fn(async () => ({ mediaId: "media-1" })),
    sendImage: vi.fn(async () => ({ messageId: "image-1" })),
    sendDocument: vi.fn(async () => ({ messageId: "document-1" })),
    sendText: vi.fn(async (_to, body) => { sent.push({ kind: "text", body }); return { messageId: "out-1" }; }),
    sendInteractive: vi.fn(async (_to, body, options) => { sent.push({ kind: "interactive", body, options }); return { messageId: "out-2" }; }),
    sendList: vi.fn(async (_to, body, _button, _section, options) => { sent.push({ kind: "list", body, options }); return { messageId: "out-3" }; }),
  };
  const handoffs = {
    requestHumanHandoff: vi.fn(async () => {
      session.automationMode = "HANDOFF_PENDING";
      return {
        handoffId: "intent-1",
        publicReference: "BRL-7K9M2Q4X",
        tradeRequestReference: "BARREL-TI-1",
        requestedAt: "2026-08-12T00:00:00.000Z",
        notificationCount: 2,
        alert: {
          kind: "RATE_CONTINUATION" as const,
          tradeRequestReference: "BARREL-TI-1",
          sourceCurrency: "NGN",
          targetCurrency: "CAD",
          sourceAmount: "₦2,000,000.00",
          indicativeTargetAmount: "C$1,904.76",
          indicativeCustomerRate: "1050 NGN per CAD",
          purposeLabel: "Supplier / vendor payment",
          purposeDetail: null,
          customerWhatsAppId: "15551234567",
          requestedAt: "2026-08-12T00:00:00.000Z",
        },
      };
    }),
    requestGeneralHumanHandoff: vi.fn(async () => ({
      handoffId: "intent-general-1", publicReference: "BRL-GENERAL", tradeRequestReference: "BARREL-TI-GENERAL",
      requestedAt: "2026-08-12T00:00:00.000Z", notificationCount: 1,
      alert: { kind: "GENERAL_ASSISTANCE" as const, tradeRequestReference: "BRL-GENERAL", sourceCurrency: "", targetCurrency: "", sourceAmount: "", indicativeTargetAmount: "", indicativeCustomerRate: "", purposeLabel: "Customer asked to speak with the Barrel team", purposeDetail: null, customerWhatsAppId: "15551234567", requestedAt: "2026-08-12T00:00:00.000Z" },
    })),
    finishConversation: vi.fn(async () => undefined),
  };
  const adminNotifications = {
    dispatchTradeIntentNotifications: vi.fn(async () => ({
      tradeIntentId: "intent-1",
      sentCount: 1,
      failedCount: 0,
      skippedCount: 0,
    })),
  };
  const service = new ConversationService(repository, quoteService, tradeIntents, handoffs, adminNotifications, whatsApp);
  const inbound = (text: string) => service.handleInboundMessage({ from: "15551234567", messageId: `in-${text}`, text });
  return { session, repository, quoteService, tradeIntents, handoffs, adminNotifications, sent, inbound };
}

describe("WhatsApp simplified trade-request flow", () => {
  const allDirections = ["NGN", "CAD", "USD", "USDT"].flatMap((sourceCurrency) =>
    ["NGN", "CAD", "USD", "USDT"].filter((targetCurrency) => targetCurrency !== sourceCurrency).map((targetCurrency) => ({
      sourceCurrency, targetCurrency, minSourceAmountMinor: sourceCurrency === "NGN" ? 10_000_000n : 10_000n,
      maxSourceAmountMinor: sourceCurrency === "NGN" ? 1_000_000_000n : 2_500_000n,
    })),
  );

  it.each(["2000000", "2,000,000", "₦2,000,000"])("parses %s without floating point", (input) => {
    expect(parseCustomerAmountMinor(input)).toBe(200_000_000n);
  });

  it("accepts an amount with its currency code", () => {
    expect(parseCustomerAmountMinor("2000000 NGN")).toBe(200_000_000n);
  });

  it.each(["QUOTE", "TRADE", "EXCHANGE", "I want to trade", "send money"])("recognizes %s as a rate intent", async (phrase) => {
    const h = buildHarness();
    await h.inbound(phrase);
    expect(h.session.state).toBe("AWAITING_AMOUNT");
    expect(h.sent.at(-1)?.body).toContain("Current range:");
  });

  it("uses a list for four source currencies and accepts a typed currency name", async () => {
    const h = buildHarness([
      { sourceCurrency: "NGN", targetCurrency: "CAD", minSourceAmountMinor: 10_000_000n, maxSourceAmountMinor: 1_000_000_000n },
      { sourceCurrency: "CAD", targetCurrency: "USD", minSourceAmountMinor: 10_000n, maxSourceAmountMinor: 1_000_000n },
      { sourceCurrency: "USD", targetCurrency: "CAD", minSourceAmountMinor: 10_000n, maxSourceAmountMinor: 1_000_000n },
      { sourceCurrency: "USDT", targetCurrency: "CAD", minSourceAmountMinor: 10_000n, maxSourceAmountMinor: 1_000_000n },
    ]);
    await h.inbound("RATE");
    expect(h.sent.at(-1)).toMatchObject({ kind: "list" });
    expect(JSON.stringify(h.sent.at(-1)?.options)).toContain("NGN — Nigerian Naira");
    await h.inbound("Nigerian Naira");
    expect(h.session.state).toBe("AWAITING_AMOUNT");
    expect(h.sent.at(-1)?.body).toContain("Current range: ₦100,000");
  });

  it.each([
    ["NGN", ["CAD", "USD", "USDT"]], ["CAD", ["NGN", "USD", "USDT"]],
    ["USD", ["CAD", "NGN", "USDT"]], ["USDT", ["CAD", "NGN", "USD"]],
  ] as const)("derives %s targets from all enabled directional corridors", async (source, targets) => {
    const h = buildHarness(allDirections);
    await h.inbound("RATE");
    await h.inbound(source);
    expect(h.sent.at(-1)).toMatchObject({ kind: "interactive" });
    expect((h.sent.at(-1)?.options as Array<{ id: string }>).map((option) => option.id)).toEqual([...targets].sort());
  });

  it("removes only the disabled direction without inferring its reverse", async () => {
    const enabled = allDirections.filter(({ sourceCurrency, targetCurrency }) => !(sourceCurrency === "CAD" && targetCurrency === "USDT"));
    const cad = buildHarness(enabled);
    await cad.inbound("RATE"); await cad.inbound("CAD");
    expect((cad.sent.at(-1)?.options as Array<{ id: string }>).map(({ id }) => id)).toEqual(["NGN", "USD"]);
    const usdt = buildHarness(enabled);
    await usdt.inbound("RATE"); await usdt.inbound("USDT");
    expect((usdt.sent.at(-1)?.options as Array<{ id: string }>).map(({ id }) => id)).toContain("CAD");
  });

  it("runs RATE → quote → continue → desk handoff without asking purpose", async () => {
    const h = buildHarness();
    await h.inbound("RATE");
    await h.inbound("2,000,000");
    const quoteMessage = h.sent.at(-1)?.body ?? "";
    expect(quoteMessage).toContain("You send\n₦2,000,000.00 NGN");
    expect(quoteMessage).toContain("You receive approx.\nC$1,904.76 CAD");
    expect(quoteMessage).toContain("Indicative rate\nC$1 = ₦1,050");
    expect(quoteMessage).toContain("Valid for 15 minutes");
    expect(quoteMessage).not.toMatch(/Juicyway|providerRate|providerQuoteId|spread|margin|2026-/i);
    expect(quoteMessage).toContain("Final rate is confirmed before your transaction is accepted.");
    expect(JSON.stringify(h.sent.at(-1)?.options)).toContain("Continue with this rate");
    await h.inbound("CONTINUE_WITH_RATE");
    expect(h.tradeIntents.createFromQuote).toHaveBeenCalledWith("conversation-1", "quote-1");
    expect(h.tradeIntents.setPaymentPurpose).not.toHaveBeenCalled();
    expect(h.sent.at(-1)?.body).toContain("We've shared this rate with the Barrel team");
    expect(h.adminNotifications.dispatchTradeIntentNotifications).toHaveBeenCalledWith("intent-1");
    expect(h.session.automationMode).toBe("HANDOFF_PENDING");
    const count = h.sent.length;
    await h.inbound("Thanks");
    await h.inbound("SUPPLIER_VENDOR");
    expect(h.sent).toHaveLength(count);
    expect(h.handoffs.requestHumanHandoff).toHaveBeenCalledTimes(1);
  });

  it("restarts cleanly with New rate", async () => {
    const h = buildHarness();
    await h.inbound("RATE");
    await h.inbound("2000000");
    await h.inbound("NEW_RATE");
    expect(h.session.state).toBe("AWAITING_AMOUNT");
    expect(h.sent.at(-1)?.body).toContain("How much NGN");
  });

  it("restarts the quote journey when the customer quote window expired", async () => {
    const h = buildHarness();
    await h.inbound("RATE");
    await h.inbound("2000000");
    h.tradeIntents.createFromQuote = vi.fn(async () => { throw new Error("QUOTE_EXPIRED"); });
    await h.inbound("CONTINUE_WITH_RATE");
    expect(h.sent.some((message) => message.body.includes("fresh one"))).toBe(true);
    expect(JSON.stringify(h.sent.at(-1)?.options)).toContain("Get a new rate");
  });

  it("rejects malformed and out-of-range amounts before QuoteService", async () => {
    const h = buildHarness();
    await h.inbound("RATE");
    await h.inbound("not money");
    await h.inbound("10");
    await h.inbound("10..2");
    await h.inbound("--");
    await h.inbound("100000000");
    expect(h.quoteService.createIndicativeQuote).not.toHaveBeenCalled();
    expect(h.sent.at(-1)?.body).toContain("Maximum:");
  });

  it("returns a provider-safe outage message", async () => {
    const h = buildHarness();
    h.quoteService.createIndicativeQuote.mockRejectedValueOnce(new Error("Juicyway HTTP 500"));
    await h.inbound("RATE");
    await h.inbound("2000000");
    expect(h.sent.at(-1)?.body).toBe("We can't get a rate for this route right now.\n\nPlease try again shortly.");
    await h.inbound("TRY_AGAIN");
    expect(h.sent.at(-1)?.body).toContain("How much NGN");
  });

  it("supports quote-screen and idle human requests", async () => {
    const quote = buildHarness();
    await quote.inbound("RATE");
    await quote.inbound("2000000");
    await quote.inbound("SPEAK_WITH_TEAM");
    expect(quote.handoffs.requestHumanHandoff).toHaveBeenCalledTimes(1);
    expect(quote.sent.at(-1)?.body).toContain("someone from Barrel");

    const idle = buildHarness();
    await idle.inbound("human");
    expect(idle.sent.at(-1)?.body).toContain("someone from Barrel");
  });

  it("suppresses every ordinary bot response while the conversation is HUMAN", async () => {
    const h = buildHarness();
    h.session.automationMode = "HUMAN";
    for (const message of ["Thanks", "Okay", "RATE", "Hello", "Can I get another rate?"]) await h.inbound(message);
    expect(h.sent).toHaveLength(0);
    expect(h.quoteService.createIndicativeQuote).not.toHaveBeenCalled();
  });

  it("starts the normal rate journey when a customer sends RATE after automation is resumed", async () => {
    const h = buildHarness();
    h.session.automationMode = "HUMAN";
    h.session.automationMode = "BOT"; // Applied by the internal finish action; it does not send a message itself.
    await h.inbound("RATE");
    expect(h.sent.at(-1)?.body).toContain("How much NGN");
  });

  it("resumes the bot for the current inbound when a HUMAN handoff is stale", async () => {
    const h = buildHarness();
    h.session.automationMode = "HUMAN";
    vi.mocked(h.repository.closeStaleHandoff).mockResolvedValueOnce(true);
    await h.inbound("RATE");
    expect(h.sent.at(-1)?.body).toContain("How much NGN");
  });

  it("suppresses bot replies while notification delivery is pending", async () => {
    const h = buildHarness();
    h.session.automationMode = "HANDOFF_PENDING";
    await h.inbound("RATE");
    expect(h.sent).toHaveLength(0);
  });
});
