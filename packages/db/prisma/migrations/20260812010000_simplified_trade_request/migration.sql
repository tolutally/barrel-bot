ALTER TYPE "ConversationState" ADD VALUE 'AWAITING_PAYMENT_PURPOSE';
ALTER TYPE "ConversationState" ADD VALUE 'AWAITING_PAYMENT_PURPOSE_DETAIL';
ALTER TYPE "ConversationState" ADD VALUE 'TRADE_REQUEST_READY';

ALTER TYPE "TradeIntentStatus" ADD VALUE 'PAYMENT_PURPOSE_REQUIRED';
ALTER TYPE "TradeIntentStatus" ADD VALUE 'READY_FOR_HANDOFF';

CREATE TYPE "PaymentPurpose" AS ENUM (
  'SUPPLIER_VENDOR',
  'GOODS_INVENTORY',
  'SERVICES_CONTRACTOR',
  'INVESTMENT',
  'PERSONAL_TRANSFER',
  'OTHER'
);

DROP INDEX "Quote_status_expiresAt_idx";

ALTER TABLE "Quote" RENAME COLUMN "expiresAt" TO "providerExpiresAt";
ALTER TABLE "Quote" ADD COLUMN "customerQuoteExpiresAt" TIMESTAMP(3);

UPDATE "Quote"
SET "customerQuoteExpiresAt" = "createdAt" + INTERVAL '15 minutes';

ALTER TABLE "Quote" ALTER COLUMN "customerQuoteExpiresAt" SET NOT NULL;

ALTER TABLE "TradeIntent"
  ADD COLUMN "purposeOfPayment" "PaymentPurpose",
  ADD COLUMN "purposeOfPaymentDetail" TEXT;

CREATE INDEX "Quote_status_customerQuoteExpiresAt_idx"
  ON "Quote"("status", "customerQuoteExpiresAt");
