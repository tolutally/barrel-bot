import { randomUUID } from "node:crypto";
import { PrismaClient, type PaymentPurpose } from "@prisma/client";
import { afterAll, describe, expect, it, vi } from "vitest";
import { AdminNotificationStatusService, AdminWhatsAppNotificationService, PrismaTradeHandoffService } from "@barrel/handoffs";
import { WhatsAppAdminReplyRelayService } from "@barrel/whatsapp";

const prisma = new PrismaClient();
const createdIntentIds: string[] = [];
const createdQuoteIds: string[] = [];
const createdConversationIds: string[] = [];
const createdChannelIds: string[] = [];

afterAll(async () => {
  if (createdIntentIds.length) {
    await prisma.whatsAppRelayMessage.deleteMany({ where: { tradeIntentId: { in: createdIntentIds } } });
    await prisma.adminNotification.deleteMany({ where: { tradeIntentId: { in: createdIntentIds } } });
  }
  for (const conversationId of createdConversationIds) {
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { latestQuoteId: null, latestTradeIntentId: null },
    }).catch(() => undefined);
  }
  if (createdConversationIds.length) await prisma.auditLog.deleteMany({ where: { entityType: "Conversation", entityId: { in: createdConversationIds } } });
  if (createdIntentIds.length) await prisma.tradeIntent.deleteMany({ where: { id: { in: createdIntentIds } } });
  if (createdQuoteIds.length) await prisma.quote.deleteMany({ where: { id: { in: createdQuoteIds } } });
  if (createdConversationIds.length) await prisma.conversation.deleteMany({ where: { id: { in: createdConversationIds } } });
  if (createdChannelIds.length) await prisma.customerChannel.deleteMany({ where: { id: { in: createdChannelIds } } });
  await prisma.$disconnect();
});

async function createFixture(input: {
  purpose?: PaymentPurpose | null;
  detail?: string | null;
  expiresAt?: Date;
}) {
  const suffix = randomUUID();
  const channel = await prisma.customerChannel.create({
    data: { channelType: "WHATSAPP", externalIdentifier: `handoff-${suffix}` },
  });
  createdChannelIds.push(channel.id);
  const conversation = await prisma.conversation.create({ data: { customerChannelId: channel.id } });
  createdConversationIds.push(conversation.id);
  const quote = await prisma.quote.create({
    data: {
      quoteReference: `HANDOFF-Q-${suffix}`,
      conversationId: conversation.id,
      provider: "JUICYWAY",
      providerQuoteId: `provider-${suffix}`,
      sourceCurrency: "NGN",
      targetCurrency: "CAD",
      sourceAmountMinor: 200_000_000n,
      targetAmountMinor: 190_476n,
      providerRate: "1030",
      customerRate: "1050",
      fixedSpreadSnapshot: "20",
      percentageSpreadSnapshot: "0",
      explicitFeeMinor: 0n,
      providerFeeEstimateMinor: 0n,
      payoutFeeEstimateMinor: 0n,
      expectedMarginMinor: 3_809_600n,
      providerExpiresAt: new Date(Date.now() - 60_000),
      customerQuoteExpiresAt: input.expiresAt ?? new Date(Date.now() + 900_000),
      status: "TRADE_INTENT_CREATED",
    },
  });
  createdQuoteIds.push(quote.id);
  const intent = await prisma.tradeIntent.create({
    data: {
      publicReference: `BRL-${suffix.replace(/-/g, "").slice(0, 8).toUpperCase()}`,
      tradeIntentReference: `BARREL-TI-${suffix}`,
      quoteId: quote.id,
      conversationId: conversation.id,
      sourceCurrency: "NGN",
      targetCurrency: "CAD",
      sourceAmountMinor: quote.sourceAmountMinor,
      indicativeTargetAmountMinor: quote.targetAmountMinor,
      originatingChannel: "WHATSAPP",
      status: "READY_FOR_HANDOFF",
      purposeOfPayment: input.purpose,
      purposeOfPaymentDetail: input.detail,
    },
  });
  createdIntentIds.push(intent.id);
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { latestQuoteId: quote.id, latestTradeIntentId: intent.id, state: "TRADE_REQUEST_READY" },
  });
  return { channel, conversation, quote, intent };
}

describe("TradeHandoffService Supabase persistence", () => {
  it("atomically prepares one pending notification per admin and remains idempotent", async () => {
    const fixture = await createFixture({ purpose: "SUPPLIER_VENDOR" });
    const service = new PrismaTradeHandoffService(prisma, ["+14035550101", "+15875550102"]);

    const first = await service.requestHumanHandoff({
      tradeIntentId: fixture.intent.id,
      originatingChannel: "WHATSAPP",
    });
    const second = await service.requestHumanHandoff({
      tradeIntentId: fixture.intent.id,
      originatingChannel: "WHATSAPP",
    });

    expect(second.requestedAt).toBe(first.requestedAt);
    expect(first.notificationCount).toBe(2);
    expect(first.alert).toMatchObject({
      tradeRequestReference: fixture.intent.publicReference,
      sourceCurrency: "NGN",
      targetCurrency: "CAD",
      indicativeCustomerRate: "C$1 = ₦1,050",
      purposeLabel: "Supplier / vendor payment",
      customerWhatsAppId: fixture.channel.externalIdentifier,
    });
    const notifications = await prisma.adminNotification.findMany({
      where: { tradeIntentId: fixture.intent.id },
      orderBy: { recipient: "asc" },
    });
    expect(notifications.map(({ recipient, status }) => ({ recipient, status }))).toEqual([
      { recipient: "+14035550101", status: "PENDING" },
      { recipient: "+15875550102", status: "PENDING" },
    ]);
    const storedIntent = await prisma.tradeIntent.findUniqueOrThrow({ where: { id: fixture.intent.id } });
    expect(storedIntent.handoffState).toBe("ALERT_PENDING");
    expect(storedIntent.handoffRequestedAt).not.toBeNull();
    const storedConversation = await prisma.conversation.findUniqueOrThrow({ where: { id: fixture.conversation.id } });
    expect(storedConversation.automationMode).toBe("HANDOFF_PENDING");
    expect(await prisma.trade.count({ where: { tradeIntentId: fixture.intent.id } })).toBe(0);
    const tableSecurity = await prisma.$queryRaw<Array<{ relrowsecurity: boolean; anon_access: boolean }>>`
      SELECT c.relrowsecurity,
             has_table_privilege('anon', 'public."AdminNotification"', 'SELECT') AS anon_access
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'AdminNotification'
    `;
    expect(tableSecurity).toEqual([{ relrowsecurity: true, anon_access: false }]);
  });

  it("allows handoff without fabricating a payment purpose", async () => {
    const fixture = await createFixture({ purpose: null });
    const service = new PrismaTradeHandoffService(prisma, ["+14035550101"]);
    await service.requestHumanHandoff({
      tradeIntentId: fixture.intent.id,
      originatingChannel: "WHATSAPP",
    });
    expect(await prisma.adminNotification.count({ where: { tradeIntentId: fixture.intent.id } })).toBe(1);
    expect((await prisma.tradeIntent.findUniqueOrThrow({ where: { id: fixture.intent.id } })).purposeOfPayment).toBeNull();
  });

  it("does not revalidate legacy optional purpose during handoff", async () => {
    const fixture = await createFixture({ purpose: "OTHER", detail: null });
    const service = new PrismaTradeHandoffService(prisma, ["+14035550101"]);
    await service.requestHumanHandoff({
      tradeIntentId: fixture.intent.id,
      originatingChannel: "WHATSAPP",
    });
    expect(await prisma.adminNotification.count({ where: { tradeIntentId: fixture.intent.id } })).toBe(1);
  });

  it("rejects an expired customer request window even when provider expiry is separate", async () => {
    const fixture = await createFixture({ purpose: "INVESTMENT", expiresAt: new Date(Date.now() - 1_000) });
    const service = new PrismaTradeHandoffService(prisma, ["+14035550101"]);
    await expect(service.requestHumanHandoff({
      tradeIntentId: fixture.intent.id,
      originatingChannel: "WHATSAPP",
    })).rejects.toMatchObject({ code: "QUOTE_EXPIRED" });
    expect(await prisma.adminNotification.count({ where: { tradeIntentId: fixture.intent.id } })).toBe(0);
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id: fixture.conversation.id } })).automationMode).toBe("BOT");
  });

  it("delivers a pending admin template once and transitions the conversation to HUMAN", async () => {
    const fixture = await createFixture({ purpose: "SERVICES_CONTRACTOR" });
    await new PrismaTradeHandoffService(prisma, ["+14035550101"]).requestHumanHandoff({
      tradeIntentId: fixture.intent.id,
      originatingChannel: "WHATSAPP",
    });
    const sender = {
      sendTemplate: vi.fn(async () => ({ messageId: "wamid.synthetic.success" })),
    };
    const dispatcher = new AdminWhatsAppNotificationService(prisma, sender, {
      templateName: "barrel_new_trade_request",
      templateLanguage: "en",
    });
    const first = await dispatcher.dispatchTradeIntentNotifications(fixture.intent.id);
    const second = await dispatcher.dispatchTradeIntentNotifications(fixture.intent.id);

    expect(first).toMatchObject({ sentCount: 1, failedCount: 0, skippedCount: 0 });
    expect(second).toMatchObject({ sentCount: 0, failedCount: 0, skippedCount: 1 });
    expect(sender.sendTemplate).toHaveBeenCalledTimes(1);
    expect(sender.sendTemplate).toHaveBeenCalledWith(expect.objectContaining({
      templateName: "barrel_new_trade_request",
      language: "en",
      bodyParameters: expect.arrayContaining([
        fixture.intent.publicReference,
        "NGN → CAD",
        "C$1 = ₦1,050",
      ]),
    }));
    const notification = await prisma.adminNotification.findFirstOrThrow({
      where: { tradeIntentId: fixture.intent.id },
    });
    expect(notification).toMatchObject({
      status: "SENT",
      attemptCount: 1,
      externalMessageId: "wamid.synthetic.success",
    });
    expect(notification.sentAt).not.toBeNull();
    const deliveryStatuses = new AdminNotificationStatusService(prisma);
    await deliveryStatuses.record({
      messageId: "wamid.synthetic.success",
      status: "delivered",
      occurredAt: new Date("2026-08-13T20:00:00.000Z"),
    });
    await deliveryStatuses.record({
      messageId: "wamid.synthetic.success",
      status: "read",
      occurredAt: new Date("2026-08-13T20:01:00.000Z"),
    });
    expect(await prisma.adminNotification.findUniqueOrThrow({ where: { id: notification.id } })).toMatchObject({
      status: "READ",
      deliveredAt: new Date("2026-08-13T20:01:00.000Z"),
      readAt: new Date("2026-08-13T20:01:00.000Z"),
    });
    expect((await prisma.tradeIntent.findUniqueOrThrow({ where: { id: fixture.intent.id } })).handoffState).toBe("HANDED_OFF");
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id: fixture.conversation.id } })).automationMode).toBe("HUMAN");
  });

  it("moves to HUMAN when one admin succeeds while preserving another failure", async () => {
    const fixture = await createFixture({ purpose: "GOODS_INVENTORY" });
    await new PrismaTradeHandoffService(prisma, ["+14035550101", "+15875550102"]).requestHumanHandoff({
      tradeIntentId: fixture.intent.id,
      originatingChannel: "WHATSAPP",
    });
    const sender = {
      sendTemplate: vi.fn(async (input: { to: string }) => {
        if (input.to === "+15875550102") {
          throw { safeCode: "META_HTTP_401", safeMessage: "Meta WhatsApp delivery failed with HTTP 401", retryable: false };
        }
        return { messageId: "wamid.synthetic.partial" };
      }),
    };
    const result = await new AdminWhatsAppNotificationService(prisma, sender, {
      templateName: "barrel_new_trade_request",
      templateLanguage: "en",
    }).dispatchTradeIntentNotifications(fixture.intent.id);
    expect(result).toMatchObject({ sentCount: 1, failedCount: 1 });
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id: fixture.conversation.id } })).automationMode).toBe("HUMAN");
    expect(await prisma.adminNotification.groupBy({
      by: ["status"],
      where: { tradeIntentId: fixture.intent.id },
      _count: { _all: true },
      orderBy: { status: "asc" },
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: "FAILED", _count: { _all: 1 } }),
      expect.objectContaining({ status: "SENT", _count: { _all: 1 } }),
    ]));
  });

  it("keeps HANDOFF_PENDING when all admins fail and bounds retryable attempts", async () => {
    const fixture = await createFixture({ purpose: "PERSONAL_TRANSFER" });
    await new PrismaTradeHandoffService(prisma, ["+14035550101"]).requestHumanHandoff({
      tradeIntentId: fixture.intent.id,
      originatingChannel: "WHATSAPP",
    });
    const sender = {
      sendTemplate: vi.fn(async () => {
        throw { safeCode: "META_HTTP_503", safeMessage: "Meta WhatsApp delivery failed with HTTP 503", retryable: true };
      }),
    };
    const result = await new AdminWhatsAppNotificationService(prisma, sender, {
      templateName: "barrel_new_trade_request",
      templateLanguage: "en",
      maxAttempts: 2,
    }).dispatchTradeIntentNotifications(fixture.intent.id);
    expect(result).toMatchObject({ sentCount: 0, failedCount: 1 });
    expect(sender.sendTemplate).toHaveBeenCalledTimes(2);
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id: fixture.conversation.id } })).automationMode).toBe("HANDOFF_PENDING");
    expect((await prisma.tradeIntent.findUniqueOrThrow({ where: { id: fixture.intent.id } })).handoffState).toBe("FAILED");
    expect(await prisma.trade.count({ where: { tradeIntentId: fixture.intent.id } })).toBe(0);
    const notification = await prisma.adminNotification.findFirstOrThrow({ where: { tradeIntentId: fixture.intent.id } });
    expect(notification).toMatchObject({
      status: "FAILED",
      attemptCount: 2,
      safeFailureCode: "META_HTTP_503",
    });
    expect(notification.safeFailureMessage).not.toContain("Authorization");
  });

  it("hands off general assistance without a quote or purpose and finishes idempotently", async () => {
    const suffix = randomUUID();
    const channel = await prisma.customerChannel.create({ data: { channelType: "WHATSAPP", externalIdentifier: `help-${suffix}` } });
    createdChannelIds.push(channel.id);
    const conversation = await prisma.conversation.create({ data: { customerChannelId: channel.id } });
    createdConversationIds.push(conversation.id);
    const service = new PrismaTradeHandoffService(prisma, ["+14035550101"]);
    const first = await service.requestGeneralHumanHandoff({ conversationId: conversation.id, originatingChannel: "WHATSAPP" });
    const second = await service.requestGeneralHumanHandoff({ conversationId: conversation.id, originatingChannel: "WHATSAPP" });
    createdIntentIds.push(first.handoffId);
    expect(second.handoffId).toBe(first.handoffId);
    expect(first.alert.kind).toBe("GENERAL_ASSISTANCE");
    const stored = await prisma.tradeIntent.findUniqueOrThrow({ where: { id: first.handoffId } });
    expect(stored).toMatchObject({ quoteId: null, purposeOfPayment: null, handoffState: "ALERT_PENDING" });

    await new AdminWhatsAppNotificationService(prisma, { sendTemplate: vi.fn(async () => ({ messageId: `wamid.help.${suffix}` })) }, {
      templateName: "barrel_new_trade_request", templateLanguage: "en",
    }).dispatchTradeIntentNotifications(first.handoffId);
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id: conversation.id } })).automationMode).toBe("HUMAN");

    await service.finishConversation({ conversationId: conversation.id, operatorId: "+14035550101" });
    await service.finishConversation({ conversationId: conversation.id, operatorId: "+14035550101" });
    expect(await prisma.conversation.findUniqueOrThrow({ where: { id: conversation.id } })).toMatchObject({ automationMode: "BOT", handoffClosedBy: "+14035550101" });
    expect((await prisma.tradeIntent.findUniqueOrThrow({ where: { id: first.handoffId } })).handoffState).toBe("CLOSED");
    expect(await prisma.auditLog.count({ where: { entityId: conversation.id, action: "HUMAN_HANDOFF_FINISHED" } })).toBe(1);
  });

  it("lets the first admin claim a trade by replying to the alert and relays both directions exactly once", async () => {
    const fixture = await createFixture({ purpose: "SUPPLIER_VENDOR" });
    const admins = ["+14035550101", "+15875550102"];
    await new PrismaTradeHandoffService(prisma, admins).requestHumanHandoff({
      tradeIntentId: fixture.intent.id,
      originatingChannel: "WHATSAPP",
    });
    const alertSender = {
      sendTemplate: vi.fn(async (input: { to: string }) => ({
        messageId: input.to === admins[0] ? "wamid.alert.admin-one" : "wamid.alert.admin-two",
      })),
    };
    await new AdminWhatsAppNotificationService(prisma, alertSender, {
      templateName: "barrel_new_trade_request",
      templateLanguage: "en",
    }).dispatchTradeIntentNotifications(fixture.intent.id);
    await prisma.adminNotification.updateMany({
      where: { tradeIntentId: fixture.intent.id },
      data: { status: "READ", deliveredAt: new Date(), readAt: new Date() },
    });

    let outboundSequence = 0;
    const client = {
      sendText: vi.fn(async (to: string, body: string) => {
        void to;
        void body;
        return { messageId: `wamid.relay.${++outboundSequence}` };
      }),
      sendInteractive: vi.fn(async () => ({ messageId: "unused" })),
      sendList: vi.fn(async () => ({ messageId: "unused" })),
    };
    const relay = new WhatsAppAdminReplyRelayService(prisma, client, admins);
    const adminReply = {
      id: "wamid.inbound.admin-one",
      from: "14035550101",
      text: "Hello, I’m confirming the live rate now.",
      type: "text" as const,
      contextMessageId: "wamid.alert.admin-one",
    };

    expect(await relay.handleInboundMessage(adminReply)).toMatchObject({ action: "ADMIN_RELAYED" });
    expect(await relay.handleInboundMessage(adminReply)).toMatchObject({ action: "ADMIN_RELAYED" });
    expect(client.sendText).toHaveBeenCalledWith(
      fixture.channel.externalIdentifier,
      "Hello, I’m confirming the live rate now.",
    );
    expect(client.sendText.mock.calls.filter(([to]) => to === fixture.channel.externalIdentifier)).toHaveLength(1);

    expect(await relay.handleInboundMessage({
      id: "wamid.inbound.admin-two",
      from: "15875550102",
      text: "I will take this.",
      type: "text",
      contextMessageId: "wamid.alert.admin-two",
    })).toMatchObject({ action: "ADMIN_ALREADY_ASSIGNED" });

    expect(await relay.handleInboundMessage({
      id: "wamid.inbound.customer-one",
      from: fixture.channel.externalIdentifier,
      text: "Thank you, I’m ready.",
      type: "text",
      contextMessageId: "wamid.relay.1",
    })).toMatchObject({ action: "CUSTOMER_RELAYED" });
    expect(client.sendText).toHaveBeenCalledWith(
      admins[0],
      expect.stringMatching(/TRADE [A-F0-9]{8}[\s\S]*Customer •••[A-Za-z0-9]{4} \| NGN → CAD[\s\S]*Sending ₦2,000,000.00[\s\S]*Thank you, I’m ready\./),
    );

    const storedIntent = await prisma.tradeIntent.findUniqueOrThrow({ where: { id: fixture.intent.id } });
    expect(storedIntent.assignedAdminRecipient).toBe(admins[0]);
    expect(storedIntent.assignedAt).not.toBeNull();
    const relays = await prisma.whatsAppRelayMessage.findMany({
      where: { tradeIntentId: fixture.intent.id },
      orderBy: { createdAt: "asc" },
    });
    expect(relays).toHaveLength(2);
    expect(relays.map(({ direction, status, attemptCount }) => ({ direction, status, attemptCount }))).toEqual([
      { direction: "ADMIN_TO_CUSTOMER", status: "SENT", attemptCount: 1 },
      { direction: "CUSTOMER_TO_ADMIN", status: "SENT", attemptCount: 1 },
    ]);
    expect(await prisma.trade.count({ where: { tradeIntentId: fixture.intent.id } })).toBe(0);
  }, 20_000);

  it("queues customer replies until an admin claims the trade, then flushes them", async () => {
    const fixture = await createFixture({ purpose: "SERVICES_CONTRACTOR" });
    const admin = "+14035550101";
    await new PrismaTradeHandoffService(prisma, [admin]).requestHumanHandoff({
      tradeIntentId: fixture.intent.id,
      originatingChannel: "WHATSAPP",
    });
    await new AdminWhatsAppNotificationService(prisma, {
      sendTemplate: vi.fn(async () => ({ messageId: "wamid.alert.queue" })),
    }, {
      templateName: "barrel_new_trade_request",
      templateLanguage: "en",
    }).dispatchTradeIntentNotifications(fixture.intent.id);
    let sequence = 0;
    const client = {
      sendText: vi.fn(async (to: string, body: string) => {
        void to;
        void body;
        return { messageId: `wamid.queue.${++sequence}` };
      }),
      sendInteractive: vi.fn(async () => ({ messageId: "unused" })),
      sendList: vi.fn(async () => ({ messageId: "unused" })),
    };
    const relay = new WhatsAppAdminReplyRelayService(prisma, client, [admin]);

    expect(await relay.handleInboundMessage({
      id: "wamid.customer.before-claim",
      from: fixture.channel.externalIdentifier,
      text: "Is anyone there?",
      type: "text",
    })).toMatchObject({ action: "CUSTOMER_QUEUED" });
    expect(client.sendText).not.toHaveBeenCalled();

    await relay.handleInboundMessage({
      id: "wamid.admin.claim-queue",
      from: "14035550101",
      text: "Yes, I’m here to help.",
      type: "text",
      contextMessageId: "wamid.alert.queue",
    });
    expect(client.sendText).toHaveBeenNthCalledWith(
      1,
      fixture.channel.externalIdentifier,
      "Yes, I’m here to help.",
    );
    expect(client.sendText).toHaveBeenNthCalledWith(
      2,
      admin,
      expect.stringMatching(/TRADE [A-F0-9]{8}[\s\S]*NGN → CAD[\s\S]*Is anyone there\?/),
    );
    expect(await prisma.whatsAppRelayMessage.count({
      where: { tradeIntentId: fixture.intent.id, status: "PENDING" },
    })).toBe(0);
  }, 20_000);
});
