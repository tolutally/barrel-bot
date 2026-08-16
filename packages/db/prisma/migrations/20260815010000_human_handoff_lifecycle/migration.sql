ALTER TABLE "Conversation"
  ADD COLUMN "handoffRequestedAt" TIMESTAMP(3),
  ADD COLUMN "handoffStartedAt" TIMESTAMP(3),
  ADD COLUMN "handoffClosedAt" TIMESTAMP(3),
  ADD COLUMN "handoffClosedBy" TEXT,
  ADD COLUMN "lastOperatorActivityAt" TIMESTAMP(3);

ALTER TABLE "TradeIntent"
  ALTER COLUMN "quoteId" DROP NOT NULL,
  ALTER COLUMN "sourceCurrency" DROP NOT NULL,
  ALTER COLUMN "targetCurrency" DROP NOT NULL,
  ALTER COLUMN "sourceAmountMinor" DROP NOT NULL,
  ALTER COLUMN "indicativeTargetAmountMinor" DROP NOT NULL,
  ADD COLUMN "handoffClosedAt" TIMESTAMP(3),
  ADD COLUMN "handoffClosedBy" TEXT;
