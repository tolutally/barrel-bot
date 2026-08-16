import { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { JuicywayProvider, ProviderRegistry } from "@barrel/providers";
import { PrismaCorridorConfigRepository, PrismaQuoteSnapshotRepository, QuoteService } from "@barrel/quotes";
import {
  ConversationService,
  MetaWhatsAppClient,
  PrismaConversationRepository,
} from "@barrel/whatsapp";
import { PrismaTradeIntentService } from "@barrel/trade-intents";
import {
  AdminWhatsAppNotificationService,
  parseAdminWhatsAppRecipients,
  PrismaTradeHandoffService,
} from "@barrel/handoffs";

const required = [
  "WHATSAPP_E2E_TO",
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  "META_GRAPH_API_VERSION",
  "JUICYWAY_BASE_URL",
  "JUICYWAY_API_KEY",
  "ADMIN_WHATSAPP_RECIPIENTS",
  "ADMIN_TRADE_ALERT_TEMPLATE_NAME",
] as const;
const configured = required.every((name) => Boolean(process.env[name]));

describe.skipIf(!configured)("WhatsApp production-channel acceptance", () => {
  it("sends real Meta messages around a real Juicyway Quote and persisted TradeIntent without creating a Trade", async () => {
    const prisma = new PrismaClient();
    try {
      const quoteService = new QuoteService(
        new PrismaCorridorConfigRepository(prisma),
        new ProviderRegistry({
          JUICYWAY: new JuicywayProvider({
            baseUrl: process.env.JUICYWAY_BASE_URL!,
            apiKey: process.env.JUICYWAY_API_KEY!,
            quotePath: process.env.JUICYWAY_QUOTE_PATH ?? "/exchange/quote",
          }),
        }),
        new PrismaQuoteSnapshotRepository(prisma),
      );
      const metaClient = new MetaWhatsAppClient({
        accessToken: process.env.WHATSAPP_ACCESS_TOKEN!,
        phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID!,
        graphApiVersion: process.env.META_GRAPH_API_VERSION!,
      });
      const recipients = parseAdminWhatsAppRecipients(process.env.ADMIN_WHATSAPP_RECIPIENTS);
      const service = new ConversationService(
        new PrismaConversationRepository(prisma),
        quoteService,
        new PrismaTradeIntentService(prisma),
        new PrismaTradeHandoffService(prisma, recipients),
        new AdminWhatsAppNotificationService(prisma, metaClient, {
          templateName: process.env.ADMIN_TRADE_ALERT_TEMPLATE_NAME!,
          templateLanguage: process.env.ADMIN_TRADE_ALERT_TEMPLATE_LANGUAGE ?? "en_US",
        }),
        metaClient,
      );
      const from = process.env.WHATSAPP_E2E_TO!;
      const step = (text: string) => service.handleInboundMessage({ from, messageId: `manual-${Date.now()}-${text}`, text });
      await step("Hello");
      await step("NGN");
      await step("CAD");
      await step(process.env.WHATSAPP_E2E_AMOUNT ?? "2000000");
      await step("CONTINUE_WITH_RATE");

      const channel = await prisma.customerChannel.findUniqueOrThrow({
        where: { channelType_externalIdentifier: { channelType: "WHATSAPP", externalIdentifier: from } },
      });
      const conversation = await prisma.conversation.findUniqueOrThrow({ where: { customerChannelId: channel.id } });
      const intent = await prisma.tradeIntent.findUniqueOrThrow({ where: { id: conversation.latestTradeIntentId! } });
      expect(intent.customerId).toBeNull();
      expect(intent.customerType).toBeNull();
      expect(intent.purposeOfPayment).toBeNull();
      expect(conversation.automationMode).toBe("HUMAN");
      expect(await prisma.trade.count({ where: { tradeIntentId: intent.id } })).toBe(0);
      console.info("WHATSAPP_PRODUCTION_ACCEPTANCE", {
        publicReference: intent.publicReference,
        automationMode: conversation.automationMode,
        note: "Inbound steps were invoked by the opt-in harness; verify real Meta webhook delivery separately.",
      });
    } finally {
      await prisma.$disconnect();
    }
  }, 30_000);
});
