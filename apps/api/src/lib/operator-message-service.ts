import "server-only";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { WhatsAppClient } from "@barrel/whatsapp";
import { CONVERSATION_MEDIA_BUCKET, CONVERSATION_MEDIA_RETENTION_MS, ConversationMediaStore, normalizeOutboundMedia, validateConversationMedia } from "./conversation-media";

export class OperatorMessageError extends Error {
  constructor(readonly code: "CONVERSATION_NOT_FOUND" | "CONVERSATION_NOT_IN_HUMAN_MODE" | "IDEMPOTENCY_CONFLICT" | "MESSAGE_SEND_FAILED", readonly status: 404 | 409 | 502) {
    super(code);
  }
}

type OperatorMessageResult = { sentAt: Date; externalMessageId: string; idempotent: boolean };

export class OperatorMessageService {
  constructor(
    private readonly db: PrismaClient,
    private readonly whatsApp: WhatsAppClient,
    private readonly now: () => Date = () => new Date(),
    private readonly mediaStore = new ConversationMediaStore(),
  ) {}

  async send(input: { conversationId: string; operatorId: string; text?: string; idempotencyKey: string; attachment?: { bytes: Uint8Array; mimeType: string; fileName: string } }): Promise<OperatorMessageResult> {
    const conversation = await this.db.conversation.findUnique({
      where: { id: input.conversationId },
      select: { id: true, automationMode: true, customerChannel: { select: { externalIdentifier: true } } },
    });
    if (!conversation) throw new OperatorMessageError("CONVERSATION_NOT_FOUND", 404);
    if (conversation.automationMode === "BOT") throw new OperatorMessageError("CONVERSATION_NOT_IN_HUMAN_MODE", 409);
    if (!conversation.customerChannel?.externalIdentifier) throw new OperatorMessageError("MESSAGE_SEND_FAILED", 502);

    const existing = await this.db.conversationMessage.findUnique({
      where: { conversationId_idempotencyKey: { conversationId: conversation.id, idempotencyKey: input.idempotencyKey } },
      select: { externalMessageId: true, sentAt: true },
    });
    if (existing?.externalMessageId && existing.sentAt) return { externalMessageId: existing.externalMessageId, sentAt: existing.sentAt, idempotent: true };

    const media = input.attachment ? await normalizeOutboundMedia(validateConversationMedia({
      bytes: input.attachment.bytes,
      claimedMimeType: input.attachment.mimeType,
      fileName: input.attachment.fileName,
    })) : null;
    if (conversation.automationMode === "HANDOFF_PENDING") {
      await this.claimPendingHandoff(conversation.id, input.operatorId);
    }
    const storagePath = media ? await this.mediaStore.upload(conversation.id, media) : null;
    let message: { id: string; externalMessageId: string | null; sentAt: Date | null; failedAt: Date | null };
    try {
      message = await this.db.conversationMessage.create({
        data: {
          conversationId: conversation.id,
          direction: "OUTBOUND",
          senderType: "OPERATOR",
          channel: "WHATSAPP",
          contentType: media?.kind ?? "TEXT",
          textBody: input.text || null,
          operatorId: input.operatorId,
          idempotencyKey: input.idempotencyKey,
          ...(media && storagePath ? { attachment: { create: {
            status: "READY", storageBucket: CONVERSATION_MEDIA_BUCKET, storagePath,
            originalName: media.fileName, mimeType: media.mimeType, byteSize: media.byteSize, sha256: media.sha256,
            deleteAfter: new Date(this.now().getTime() + CONVERSATION_MEDIA_RETENTION_MS),
          } } } : {}),
        },
        select: { id: true, externalMessageId: true, sentAt: true, failedAt: true },
      });
    } catch (error) {
      if (storagePath) await this.mediaStore.remove([storagePath]).catch(() => undefined);
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
      const existing = await this.db.conversationMessage.findUnique({
        where: { conversationId_idempotencyKey: { conversationId: conversation.id, idempotencyKey: input.idempotencyKey } },
        select: { externalMessageId: true, sentAt: true, failedAt: true },
      });
      if (existing?.externalMessageId && existing.sentAt) {
        return { externalMessageId: existing.externalMessageId, sentAt: existing.sentAt, idempotent: true };
      }
      throw new OperatorMessageError("IDEMPOTENCY_CONFLICT", 409);
    }

    let sent: { messageId: string };
    try {
      if (media) {
        const uploaded = await this.whatsApp.uploadMedia({ bytes: media.bytes, mimeType: media.mimeType, fileName: media.fileName });
        sent = media.kind === "IMAGE"
          ? await this.whatsApp.sendImage(conversation.customerChannel.externalIdentifier, uploaded.mediaId, input.text)
          : await this.whatsApp.sendDocument(conversation.customerChannel.externalIdentifier, uploaded.mediaId, media.fileName, input.text);
        await this.db.conversationMessageAttachment.update({ where: { messageId: message.id }, data: { metaMediaId: uploaded.mediaId } });
      } else {
        sent = await this.whatsApp.sendText(conversation.customerChannel.externalIdentifier, input.text!);
      }
    } catch (error) {
      const failure = safeFailure(error);
      await this.db.conversationMessage.update({
        where: { id: message.id },
        data: { failedAt: this.now(), failureCode: failure.code, failureMessage: failure.message },
      });
      throw new OperatorMessageError("MESSAGE_SEND_FAILED", 502);
    }
    const sentAt = this.now();
    await this.db.$transaction([
      this.db.conversationMessage.update({
        where: { id: message.id },
        data: { externalMessageId: sent.messageId, sentAt, failedAt: null, failureCode: null, failureMessage: null },
      }),
      this.db.auditLog.create({
        data: {
          actorType: "STAFF",
          actorId: input.operatorId,
          action: "OPERATOR_MESSAGE_SENT",
          entityType: "Conversation",
          entityId: conversation.id,
          source: "CUSTOM_ADMIN",
        },
      }),
    ]);
    return { externalMessageId: sent.messageId, sentAt, idempotent: false };
  }

  private async claimPendingHandoff(conversationId: string, operatorId: string): Promise<void> {
    const at = this.now();
    await this.db.$transaction(async (tx) => {
      const claimed = await tx.conversation.updateMany({
        where: { id: conversationId, automationMode: "HANDOFF_PENDING" },
        data: { automationMode: "HUMAN", handoffStartedAt: at, lastOperatorActivityAt: at },
      });
      if (claimed.count === 0) {
        const current = await tx.conversation.findUnique({ where: { id: conversationId }, select: { automationMode: true } });
        if (current?.automationMode !== "HUMAN") {
          throw new OperatorMessageError("CONVERSATION_NOT_IN_HUMAN_MODE", 409);
        }
        return;
      }
      await tx.tradeIntent.updateMany({
        where: { conversationId, handoffState: { in: ["ALERT_PENDING", "FAILED"] } },
        data: { handoffState: "HANDED_OFF", handedOffAt: at, assignedAdminRecipient: `operator:${operatorId}`, assignedAt: at },
      });
      await tx.auditLog.create({
        data: {
          actorType: "STAFF",
          actorId: operatorId,
          action: "HUMAN_HANDOFF_CLAIMED",
          entityType: "Conversation",
          entityId: conversationId,
          source: "CUSTOM_ADMIN",
        },
      });
    });
  }
}

function safeFailure(error: unknown): { code: string; message: string } {
  if (error && typeof error === "object") {
    const candidate = error as { safeCode?: unknown; safeMessage?: unknown };
    if (typeof candidate.safeCode === "string" && typeof candidate.safeMessage === "string") {
      return { code: candidate.safeCode.slice(0, 80), message: candidate.safeMessage.slice(0, 300) };
    }
  }
  return { code: "META_SEND_FAILED", message: "Meta WhatsApp delivery failed" };
}
