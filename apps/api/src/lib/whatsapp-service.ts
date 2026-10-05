import "server-only";
import { prisma } from "@barrel/db";
import {
  ConversationService,
  MetaWhatsAppClient,
  PrismaConversationRepository,
  PrismaWebhookEventRepository,
  TranscriptWhatsAppClient,
  WhatsAppAdminReplyRelayService,
} from "@barrel/whatsapp";
import { PrismaTradeIntentService } from "@barrel/trade-intents";
import {
  AdminWhatsAppNotificationService,
  AdminNotificationStatusService,
  parseAdminWhatsAppRecipients,
  PrismaTradeHandoffService,
} from "@barrel/handoffs";
import { createQuoteService } from "./quote-service";
import { OperatorMessageService } from "./operator-message-service";
import { InboundConversationMediaService } from "./conversation-media";

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing required server environment: ${name}`);
  return value;
}

export function createWhatsAppServices() {
  const client = new MetaWhatsAppClient({
    accessToken: requiredEnvironment("WHATSAPP_ACCESS_TOKEN"),
    phoneNumberId: requiredEnvironment("WHATSAPP_PHONE_NUMBER_ID"),
    graphApiVersion: requiredEnvironment("META_GRAPH_API_VERSION"),
  });
  const recipients = parseAdminWhatsAppRecipients(process.env.ADMIN_WHATSAPP_RECIPIENTS);
  const conversations = new PrismaConversationRepository(prisma);
  const transcriptClient = new TranscriptWhatsAppClient(client, conversations);
  const handoffs = new PrismaTradeHandoffService(prisma, recipients);
  const adminNotifications = new AdminWhatsAppNotificationService(prisma, client, {
    templateName: requiredEnvironment("ADMIN_TRADE_ALERT_TEMPLATE_NAME"),
    templateLanguage: process.env.ADMIN_TRADE_ALERT_TEMPLATE_LANGUAGE ?? "en_US",
    operationalTimeZone: process.env.ADMIN_OPERATION_TIME_ZONE ?? "America/Edmonton",
  });
  return {
    notificationStatuses: new AdminNotificationStatusService(prisma),
    transcriptStatuses: conversations,
    operatorMessages: new OperatorMessageService(prisma, client),
    inboundMedia: new InboundConversationMediaService(client),
    relay: new WhatsAppAdminReplyRelayService(prisma, client, recipients),
    handoffs,
    conversation: new ConversationService(
      conversations,
      createQuoteService(),
      new PrismaTradeIntentService(prisma),
      handoffs,
      adminNotifications,
      transcriptClient,
      () => new Date(),
      Number(process.env.HUMAN_HANDOFF_IDLE_TIMEOUT_HOURS ?? "24") * 60 * 60 * 1_000,
    ),
    webhookEvents: new PrismaWebhookEventRepository(prisma),
  };
}
