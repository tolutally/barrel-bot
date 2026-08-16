ALTER TABLE "TradeIntent"
  ADD COLUMN "contactWhatsAppNumber" TEXT,
  ADD COLUMN "contactName" TEXT,
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "idempotencyRequestHash" TEXT;

CREATE UNIQUE INDEX "TradeIntent_idempotencyKey_key" ON "TradeIntent"("idempotencyKey");
CREATE INDEX "TradeIntent_originatingChannel_createdAt_idx" ON "TradeIntent"("originatingChannel", "createdAt");
