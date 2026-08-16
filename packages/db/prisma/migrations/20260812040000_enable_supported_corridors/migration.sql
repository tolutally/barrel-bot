UPDATE "CorridorConfig"
SET "enabled" = true,
    "spreadMode" = 'PERCENTAGE',
    "fixedSpread" = 0,
    "percentageSpread" = 0.012,
    "minSourceAmountMinor" = 10000000,
    "maxSourceAmountMinor" = 1000000000,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "sourceCurrency" = 'NGN' AND "targetCurrency" = 'CAD';

INSERT INTO "CorridorConfig" (
  "id", "sourceCurrency", "targetCurrency", "provider", "enabled", "spreadMode",
  "fixedSpread", "percentageSpread", "minSourceAmountMinor", "maxSourceAmountMinor",
  "explicitSourceFeeMinor", "providerFeeEstimateMinor", "payoutFeeEstimateMinor",
  "quoteTtlSeconds", "targetPrecision", "customerDisclaimer", "createdAt", "updatedAt"
)
SELECT
  'corridor-' || lower(direction.source_currency) || '-' || lower(direction.target_currency),
  direction.source_currency, direction.target_currency, 'JUICYWAY', true, 'PERCENTAGE',
  0, 0.012,
  CASE WHEN direction.source_currency = 'NGN' THEN 10000000 ELSE 10000 END,
  CASE WHEN direction.source_currency = 'NGN' THEN 1000000000 ELSE 10000000 END,
  0, 0, 0, 30, 2,
  'Indicative quote only. Final rate is confirmed before payment.',
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (VALUES
  ('NGN', 'USD'), ('NGN', 'USDT'),
  ('CAD', 'NGN'), ('CAD', 'USD'), ('CAD', 'USDT'),
  ('USD', 'NGN'), ('USD', 'CAD'),
  ('USDT', 'NGN'), ('USDT', 'CAD')
) AS direction(source_currency, target_currency)
ON CONFLICT ("sourceCurrency", "targetCurrency") DO UPDATE SET
  "enabled" = EXCLUDED."enabled",
  "spreadMode" = EXCLUDED."spreadMode",
  "fixedSpread" = EXCLUDED."fixedSpread",
  "percentageSpread" = EXCLUDED."percentageSpread",
  "minSourceAmountMinor" = EXCLUDED."minSourceAmountMinor",
  "maxSourceAmountMinor" = EXCLUDED."maxSourceAmountMinor",
  "updatedAt" = CURRENT_TIMESTAMP;
