-- Internal operators are provisioned from Supabase Auth user UUIDs.
CREATE TYPE "OperatorRole" AS ENUM ('ADMIN', 'OPERATOR');
CREATE TYPE "OperatorStatus" AS ENUM ('ACTIVE', 'DISABLED');
CREATE TYPE "ConversationMessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');
CREATE TYPE "ConversationMessageSenderType" AS ENUM ('CUSTOMER', 'BOT', 'OPERATOR', 'SYSTEM');
CREATE TYPE "ConversationMessageChannel" AS ENUM ('WHATSAPP');
CREATE TYPE "ConversationMessageContentType" AS ENUM ('TEXT', 'INTERACTIVE', 'IMAGE', 'DOCUMENT', 'OTHER');

CREATE TABLE "Operator" (
  "id" TEXT NOT NULL,
  "authUserId" UUID NOT NULL,
  "email" TEXT NOT NULL,
  "displayName" TEXT,
  "role" "OperatorRole" NOT NULL DEFAULT 'OPERATOR',
  "status" "OperatorStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Operator_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConversationMessage" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "direction" "ConversationMessageDirection" NOT NULL,
  "senderType" "ConversationMessageSenderType" NOT NULL,
  "channel" "ConversationMessageChannel" NOT NULL DEFAULT 'WHATSAPP',
  "contentType" "ConversationMessageContentType" NOT NULL,
  "textBody" TEXT,
  "externalMessageId" TEXT,
  "replyToExternalMessageId" TEXT,
  "operatorId" TEXT,
  "sentAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "readAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "failureCode" TEXT,
  "failureMessage" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConversationMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Operator_authUserId_key" ON "Operator"("authUserId");
CREATE UNIQUE INDEX "Operator_email_key" ON "Operator"("email");
CREATE INDEX "Operator_status_idx" ON "Operator"("status");
CREATE UNIQUE INDEX "ConversationMessage_externalMessageId_key" ON "ConversationMessage"("externalMessageId");
CREATE INDEX "ConversationMessage_conversationId_createdAt_idx" ON "ConversationMessage"("conversationId", "createdAt");
CREATE INDEX "ConversationMessage_operatorId_idx" ON "ConversationMessage"("operatorId");

ALTER TABLE "ConversationMessage" ADD CONSTRAINT "ConversationMessage_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConversationMessage" ADD CONSTRAINT "ConversationMessage_operatorId_fkey"
  FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE SET NULL ON UPDATE CASCADE;
