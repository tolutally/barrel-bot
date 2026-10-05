import "server-only";
import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import { prisma } from "@barrel/db";
import type { WhatsAppClient } from "@barrel/whatsapp";
import { createSupabaseAdminClient } from "./supabase/admin";

export const CONVERSATION_MEDIA_BUCKET = "conversation-media";
export const MAX_CONVERSATION_MEDIA_BYTES = 5 * 1024 * 1024;
export const CONVERSATION_MEDIA_RETENTION_MS = 90 * 24 * 60 * 60 * 1_000;
const SIGNED_URL_TTL_SECONDS = 5 * 60;

type SupportedMime = "image/jpeg" | "image/png" | "image/webp" | "application/pdf";
export type ValidatedMedia = { bytes: Uint8Array; mimeType: SupportedMime; fileName: string; byteSize: number; sha256: string; kind: "IMAGE" | "DOCUMENT" };

export class ConversationMediaError extends Error {
  constructor(readonly code: "EMPTY" | "TOO_LARGE" | "UNSUPPORTED" | "MIME_MISMATCH" | "ENCRYPTED_PDF" | "STORAGE_FAILED") { super(code); }
}

function detectedMime(bytes: Uint8Array): SupportedMime | null {
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, i) => bytes[i] === value)) return "image/png";
  if (bytes.length >= 12 && Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "RIFF" && Buffer.from(bytes.subarray(8, 12)).toString("ascii") === "WEBP") return "image/webp";
  if (bytes.length >= 5 && Buffer.from(bytes.subarray(0, 5)).toString("ascii") === "%PDF-") return "application/pdf";
  return null;
}

function extension(mimeType: SupportedMime): string {
  return mimeType === "image/jpeg" ? "jpg" : mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "pdf";
}

function safeName(value: string | undefined, mimeType: SupportedMime): string {
  const fallback = `attachment.${extension(mimeType)}`;
  const cleaned = (value ?? fallback).normalize("NFKC").replace(/[\\/\0-\x1f\x7f]/g, "_").trim().slice(0, 140);
  return cleaned || fallback;
}

export function validateConversationMedia(input: { bytes: Uint8Array; claimedMimeType: string; fileName?: string }): ValidatedMedia {
  if (input.bytes.byteLength === 0) throw new ConversationMediaError("EMPTY");
  if (input.bytes.byteLength > MAX_CONVERSATION_MEDIA_BYTES) throw new ConversationMediaError("TOO_LARGE");
  const mimeType = detectedMime(input.bytes);
  if (!mimeType) throw new ConversationMediaError("UNSUPPORTED");
  if (input.claimedMimeType.toLowerCase().split(";")[0] !== mimeType) throw new ConversationMediaError("MIME_MISMATCH");
  if (mimeType === "application/pdf" && Buffer.from(input.bytes).includes(Buffer.from("/Encrypt"))) {
    throw new ConversationMediaError("ENCRYPTED_PDF");
  }
  return {
    bytes: input.bytes,
    mimeType,
    fileName: safeName(input.fileName, mimeType),
    byteSize: input.bytes.byteLength,
    sha256: createHash("sha256").update(input.bytes).digest("hex"),
    kind: mimeType === "application/pdf" ? "DOCUMENT" : "IMAGE",
  };
}

export async function normalizeOutboundMedia(media: ValidatedMedia): Promise<ValidatedMedia> {
  if (media.mimeType !== "image/webp") return media;
  const converted = new Uint8Array(await sharp(media.bytes).jpeg({ quality: 90 }).toBuffer());
  return validateConversationMedia({ bytes: converted, claimedMimeType: "image/jpeg", fileName: media.fileName.replace(/\.webp$/i, ".jpg") });
}

export class ConversationMediaStore {
  async upload(conversationId: string, media: ValidatedMedia): Promise<string> {
    const path = `${conversationId}/${randomUUID()}.${extension(media.mimeType)}`;
    const { error } = await createSupabaseAdminClient().storage.from(CONVERSATION_MEDIA_BUCKET).upload(path, media.bytes, {
      contentType: media.mimeType,
      upsert: false,
    });
    if (error) throw new ConversationMediaError("STORAGE_FAILED");
    return path;
  }

  async signedUrl(path: string): Promise<string | null> {
    const { data, error } = await createSupabaseAdminClient().storage.from(CONVERSATION_MEDIA_BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
    return error ? null : data.signedUrl;
  }

  async remove(paths: string[]): Promise<void> {
    if (!paths.length) return;
    const { error } = await createSupabaseAdminClient().storage.from(CONVERSATION_MEDIA_BUCKET).remove(paths);
    if (error) throw new ConversationMediaError("STORAGE_FAILED");
  }
}

export class InboundConversationMediaService {
  constructor(private readonly whatsApp: WhatsAppClient, private readonly storage = new ConversationMediaStore(), private readonly now = () => new Date()) {}

  async ingest(input: { from: string; messageId: string; mediaId: string; mimeType?: string; fileName?: string; caption?: string; replyToExternalMessageId?: string }): Promise<string> {
    const at = this.now();
    const channel = await prisma.customerChannel.upsert({
      where: { channelType_externalIdentifier: { channelType: "WHATSAPP", externalIdentifier: input.from } },
      update: {}, create: { channelType: "WHATSAPP", externalIdentifier: input.from },
    });
    const conversation = await prisma.conversation.upsert({ where: { customerChannelId: channel.id }, update: {}, create: { customerChannelId: channel.id, lastInboundAt: at } });
    try {
      const downloaded = await this.whatsApp.downloadMedia(input.mediaId);
      const media = validateConversationMedia({ bytes: downloaded.bytes, claimedMimeType: downloaded.mimeType || input.mimeType || "", fileName: input.fileName });
      const storagePath = await this.storage.upload(conversation.id, media);
      await prisma.$transaction([
        prisma.conversationMessage.create({ data: {
          conversationId: conversation.id, direction: "INBOUND", senderType: "CUSTOMER", contentType: media.kind,
          textBody: input.caption, externalMessageId: input.messageId, replyToExternalMessageId: input.replyToExternalMessageId,
          attachment: { create: { status: "READY", storageBucket: CONVERSATION_MEDIA_BUCKET, storagePath, originalName: media.fileName, mimeType: media.mimeType, byteSize: media.byteSize, sha256: media.sha256, metaMediaId: input.mediaId, deleteAfter: new Date(at.getTime() + CONVERSATION_MEDIA_RETENTION_MS) } },
        } }),
        prisma.conversation.update({ where: { id: conversation.id }, data: { lastInboundAt: at } }),
      ]);
    } catch (error) {
      const code = error instanceof ConversationMediaError ? error.code : "MEDIA_DOWNLOAD_FAILED";
      await prisma.$transaction([
        prisma.conversationMessage.create({ data: {
          conversationId: conversation.id, direction: "INBOUND", senderType: "CUSTOMER",
          contentType: input.mimeType === "application/pdf" ? "DOCUMENT" : "IMAGE", textBody: input.caption,
          externalMessageId: input.messageId, replyToExternalMessageId: input.replyToExternalMessageId,
          attachment: { create: { status: "FAILED", storageBucket: CONVERSATION_MEDIA_BUCKET, originalName: safeName(input.fileName, input.mimeType === "application/pdf" ? "application/pdf" : "image/jpeg"), mimeType: input.mimeType ?? "application/octet-stream", metaMediaId: input.mediaId, failureCode: code, deleteAfter: new Date(at.getTime() + CONVERSATION_MEDIA_RETENTION_MS) } },
        } }),
        prisma.conversation.update({ where: { id: conversation.id }, data: { lastInboundAt: at } }),
      ]);
    }
    return conversation.id;
  }
}

export async function cleanupExpiredConversationMedia(now = new Date(), storage = new ConversationMediaStore()): Promise<number> {
  const expired = await prisma.conversationMessageAttachment.findMany({ where: { status: "READY", deleteAfter: { lte: now } }, select: { id: true, storagePath: true } });
  const paths = expired.flatMap((item) => item.storagePath ? [item.storagePath] : []);
  await storage.remove(paths);
  if (!expired.length) return 0;
  const result = await prisma.conversationMessageAttachment.updateMany({ where: { id: { in: expired.map((item) => item.id) } }, data: { status: "EXPIRED", deletedAt: now, storagePath: null } });
  return result.count;
}
