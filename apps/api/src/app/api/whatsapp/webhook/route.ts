import { after } from "next/server";
import { createHash } from "node:crypto";
import {
  extractInboundMessages,
  extractInboundStatuses,
  reserveInboundMessages,
  verifyMetaSignature,
  verifyWebhookChallenge,
  webhookPayloadHash,
} from "@barrel/whatsapp";
import { createWhatsAppServices } from "../../../../lib/whatsapp-service";
import { notifyOperatorsOfInboundMessage } from "../../../../lib/push-notifications";
import { prisma } from "@barrel/db";

export const runtime = "nodejs";

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing required server environment: ${name}`);
  return value;
}

function safeMessageMetadata(messageId: string, operation: string) {
  return { messageId, operation, correlationId: createHash("sha256").update(messageId).digest("hex").slice(0, 12) };
}

export function GET(request: Request): Response {
  const challenge = verifyWebhookChallenge(new URL(request.url).searchParams, requiredEnvironment("WHATSAPP_VERIFY_TOKEN"));
  return challenge ? new Response(challenge, { status: 200 }) : new Response("Forbidden", { status: 403 });
}

export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text();
  if (!verifyMetaSignature(rawBody, request.headers.get("x-hub-signature-256"), requiredEnvironment("META_APP_SECRET"))) {
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Bad Request", { status: 400 });
  }
  const messages = extractInboundMessages(payload);
  const statuses = extractInboundStatuses(payload);
  if (messages.length === 0 && statuses.length === 0) return new Response("OK", { status: 200 });

  const services = createWhatsAppServices();
  const hash = webhookPayloadHash(rawBody);
  const accepted = await reserveInboundMessages(services.webhookEvents, messages, hash);

  after(async () => {
    for (const status of statuses) {
      try {
        const [alertMatched, transcriptMatched] = await Promise.all([
          services.notificationStatuses.record(status),
          services.transcriptStatuses.recordOutboundStatus(status),
        ]);
        console.info(safeMessageMetadata(status.messageId, alertMatched || transcriptMatched ? `whatsapp_status_${status.status}` : "whatsapp_status_unmatched"));
      } catch {
        console.error(safeMessageMetadata(status.messageId, "whatsapp_status_failed"));
      }
    }
    for (const message of accepted) {
      try {
        if ((message.type === "image" || message.type === "document") && message.media) {
          const conversationId = await services.inboundMedia.ingest({
            from: message.from,
            messageId: message.id,
            mediaId: message.media.id,
            mimeType: message.media.mimeType,
            fileName: message.media.fileName,
            caption: message.media.caption,
            replyToExternalMessageId: message.contextMessageId,
          });
          await notifyOperatorsOfInboundMessage(conversationId);
          await services.webhookEvents.markProcessed("META_WHATSAPP", message.id, new Date());
          console.info(safeMessageMetadata(message.id, "whatsapp_media_processed"));
          continue;
        }
        const relay = await services.relay.handleInboundMessage(message);
        if (!relay.handled) {
          await services.conversation.handleInboundMessage({
            from: message.from,
            messageId: message.id,
            text: message.commandText ?? message.text,
            transcriptText: message.text,
            contentType: message.type === "interactive" ? "INTERACTIVE" : "TEXT",
            replyToExternalMessageId: message.contextMessageId,
            metadata: message.metadata,
          });
          const conversation = await prisma.conversation.findFirst({
            where: { customerChannel: { channelType: "WHATSAPP", externalIdentifier: message.from } },
            select: { id: true },
          });
          if (conversation) await notifyOperatorsOfInboundMessage(conversation.id);
        }
        await services.webhookEvents.markProcessed("META_WHATSAPP", message.id, new Date());
        console.info(safeMessageMetadata(message.id, "whatsapp_message_processed"));
      } catch {
        console.error(safeMessageMetadata(message.id, "whatsapp_message_failed"));
      }
    }
  });

  return new Response("OK", { status: 200 });
}
