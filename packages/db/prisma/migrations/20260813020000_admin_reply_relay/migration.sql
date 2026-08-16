CREATE TYPE "WhatsAppRelayDirection" AS ENUM ('ADMIN_TO_CUSTOMER', 'CUSTOMER_TO_ADMIN');
CREATE TYPE "WhatsAppRelayStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED');

ALTER TABLE "TradeIntent"
  ADD COLUMN "assignedAdminRecipient" TEXT,
  ADD COLUMN "assignedAt" TIMESTAMP(3);

CREATE TABLE "WhatsAppRelayMessage" (
  "id" TEXT NOT NULL,
  "tradeIntentId" TEXT NOT NULL,
  "adminNotificationId" TEXT,
  "direction" "WhatsAppRelayDirection" NOT NULL,
  "status" "WhatsAppRelayStatus" NOT NULL DEFAULT 'PENDING',
  "sender" TEXT NOT NULL,
  "recipient" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "inboundExternalMessageId" TEXT NOT NULL,
  "inReplyToExternalMessageId" TEXT,
  "outboundExternalMessageId" TEXT,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "sentAt" TIMESTAMP(3),
  "safeFailureCode" TEXT,
  "safeFailureMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WhatsAppRelayMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WhatsAppRelayMessage_outboundExternalMessageId_key"
  ON "WhatsAppRelayMessage"("outboundExternalMessageId");
CREATE UNIQUE INDEX "WhatsAppRelayMessage_inboundExternalMessageId_direction_recipient_key"
  ON "WhatsAppRelayMessage"("inboundExternalMessageId", "direction", "recipient");
CREATE INDEX "WhatsAppRelayMessage_tradeIntentId_createdAt_idx"
  ON "WhatsAppRelayMessage"("tradeIntentId", "createdAt");
CREATE INDEX "WhatsAppRelayMessage_status_createdAt_idx"
  ON "WhatsAppRelayMessage"("status", "createdAt");
CREATE INDEX "WhatsAppRelayMessage_inReplyToExternalMessageId_idx"
  ON "WhatsAppRelayMessage"("inReplyToExternalMessageId");

ALTER TABLE "WhatsAppRelayMessage"
  ADD CONSTRAINT "WhatsAppRelayMessage_tradeIntentId_fkey"
  FOREIGN KEY ("tradeIntentId") REFERENCES "TradeIntent"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WhatsAppRelayMessage"
  ADD CONSTRAINT "WhatsAppRelayMessage_adminNotificationId_fkey"
  FOREIGN KEY ("adminNotificationId") REFERENCES "AdminNotification"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

REVOKE ALL PRIVILEGES ON TABLE "WhatsAppRelayMessage" FROM "anon", "authenticated";
ALTER TABLE "WhatsAppRelayMessage" ENABLE ROW LEVEL SECURITY;
