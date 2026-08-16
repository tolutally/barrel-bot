import "server-only";
import { prisma } from "@barrel/db";
import { PublicApiService } from "@barrel/public-api";
import { PrismaTradeIntentService } from "@barrel/trade-intents";
import { AdminWhatsAppNotificationService, parseAdminWhatsAppRecipients, PrismaTradeHandoffService } from "@barrel/handoffs";
import { MetaWhatsAppClient } from "@barrel/whatsapp";
import { createQuoteService } from "./quote-service";

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing required server environment: ${name}`);
  return value;
}

export function createPublicApiService(): PublicApiService {
  const client = new MetaWhatsAppClient({
    accessToken: requiredEnvironment("WHATSAPP_ACCESS_TOKEN"),
    phoneNumberId: requiredEnvironment("WHATSAPP_PHONE_NUMBER_ID"),
    graphApiVersion: requiredEnvironment("META_GRAPH_API_VERSION"),
  });
  const recipients = parseAdminWhatsAppRecipients(process.env.ADMIN_WHATSAPP_RECIPIENTS);
  return new PublicApiService(
    prisma,
    createQuoteService(),
    new PrismaTradeIntentService(prisma),
    new PrismaTradeHandoffService(prisma, recipients),
    new AdminWhatsAppNotificationService(prisma, client, {
      templateName: requiredEnvironment("ADMIN_TRADE_ALERT_TEMPLATE_NAME"),
      templateLanguage: process.env.ADMIN_TRADE_ALERT_TEMPLATE_LANGUAGE ?? "en_US",
      operationalTimeZone: process.env.ADMIN_OPERATION_TIME_ZONE ?? "America/Edmonton",
    }),
  );
}
