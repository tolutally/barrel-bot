-- CreateEnum
CREATE TYPE "ConversationAttachmentStatus" AS ENUM ('READY', 'FAILED', 'EXPIRED');

-- CreateTable
CREATE TABLE "ConversationMessageAttachment" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "status" "ConversationAttachmentStatus" NOT NULL DEFAULT 'READY',
    "storageBucket" TEXT NOT NULL,
    "storagePath" TEXT,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER,
    "sha256" TEXT,
    "metaMediaId" TEXT,
    "failureCode" TEXT,
    "deleteAfter" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversationMessageAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConversationMessageAttachment_messageId_key" ON "ConversationMessageAttachment"("messageId");

-- CreateIndex
CREATE INDEX "ConversationMessageAttachment_status_deleteAfter_idx" ON "ConversationMessageAttachment"("status", "deleteAfter");

-- AddForeignKey
ALTER TABLE "ConversationMessageAttachment" ADD CONSTRAINT "ConversationMessageAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ConversationMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Permanent domain data remains server-only and is not exposed through PostgREST.
REVOKE ALL ON TABLE "ConversationMessageAttachment" FROM "anon", "authenticated";

-- Customer media is private and accessed only by the server with short-lived signed URLs.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'conversation-media',
  'conversation-media',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
