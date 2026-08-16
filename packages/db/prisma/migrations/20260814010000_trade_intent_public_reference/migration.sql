ALTER TABLE "TradeIntent" ADD COLUMN "publicReference" TEXT;

UPDATE "TradeIntent"
SET "publicReference" = 'BRL-' || upper(substr(md5("id" || clock_timestamp()::text || random()::text), 1, 10))
WHERE "publicReference" IS NULL;

ALTER TABLE "TradeIntent" ALTER COLUMN "publicReference" SET NOT NULL;
CREATE UNIQUE INDEX "TradeIntent_publicReference_key" ON "TradeIntent"("publicReference");
