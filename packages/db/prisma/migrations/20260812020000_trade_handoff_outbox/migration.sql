CREATE TYPE "TradeHandoffState" AS ENUM (
  'NOT_REQUESTED',
  'ALERT_PENDING',
  'ALERT_SENT',
  'HANDED_OFF',
  'FAILED',
  'CLOSED'
);

CREATE TYPE "ConversationAutomationMode" AS ENUM ('BOT', 'HANDOFF_PENDING', 'HUMAN');
CREATE TYPE "AdminNotificationType" AS ENUM ('NEW_TRADE_REQUEST');
CREATE TYPE "AdminNotificationChannel" AS ENUM ('WHATSAPP');
CREATE TYPE "AdminNotificationStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED');

ALTER TABLE "Conversation"
  ADD COLUMN "automationMode" "ConversationAutomationMode" NOT NULL DEFAULT 'BOT';

ALTER TABLE "TradeIntent"
  ADD COLUMN "handoffState" "TradeHandoffState" NOT NULL DEFAULT 'NOT_REQUESTED',
  ADD COLUMN "handoffRequestedAt" TIMESTAMP(3),
  ADD COLUMN "alertSentAt" TIMESTAMP(3),
  ADD COLUMN "handedOffAt" TIMESTAMP(3);

CREATE TABLE "AdminNotification" (
  "id" TEXT NOT NULL,
  "tradeIntentId" TEXT NOT NULL,
  "notificationType" "AdminNotificationType" NOT NULL,
  "channel" "AdminNotificationChannel" NOT NULL,
  "recipient" TEXT NOT NULL,
  "status" "AdminNotificationStatus" NOT NULL DEFAULT 'PENDING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "externalMessageId" TEXT,
  "lastAttemptAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "safeFailureCode" TEXT,
  "safeFailureMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AdminNotification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdminNotification_tradeIntentId_recipient_notificationType_key"
  ON "AdminNotification"("tradeIntentId", "recipient", "notificationType");
CREATE INDEX "AdminNotification_status_createdAt_idx"
  ON "AdminNotification"("status", "createdAt");
CREATE INDEX "AdminNotification_tradeIntentId_idx"
  ON "AdminNotification"("tradeIntentId");

ALTER TABLE "AdminNotification"
  ADD CONSTRAINT "AdminNotification_tradeIntentId_fkey"
  FOREIGN KEY ("tradeIntentId") REFERENCES "TradeIntent"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

REVOKE ALL PRIVILEGES ON TABLE "AdminNotification" FROM "anon", "authenticated";
ALTER TABLE "AdminNotification" ENABLE ROW LEVEL SECURITY;
