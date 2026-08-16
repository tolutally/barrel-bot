INSERT INTO "CorridorConfig" (
  "id", "sourceCurrency", "targetCurrency", "provider", "enabled", "spreadMode",
  "fixedSpread", "percentageSpread", "minSourceAmountMinor", "maxSourceAmountMinor",
  "explicitSourceFeeMinor", "providerFeeEstimateMinor", "payoutFeeEstimateMinor",
  "quoteTtlSeconds", "targetPrecision", "customerDisclaimer", "createdAt", "updatedAt"
)
SELECT
  'corridor-' || lower(direction.source_currency) || '-' || lower(direction.target_currency),
  direction.source_currency, direction.target_currency, 'JUICYWAY', true, 'PERCENTAGE',
  0, 0.015, 10000, 10000000,
  0, 0, 0, 30, 2,
  'Indicative quote only. Final rate is confirmed before payment.',
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (VALUES ('USD', 'USDT'), ('USDT', 'USD')) AS direction(source_currency, target_currency)
ON CONFLICT ("sourceCurrency", "targetCurrency") DO UPDATE SET
  "enabled" = true,
  "provider" = EXCLUDED."provider",
  "targetPrecision" = EXCLUDED."targetPrecision",
  "updatedAt" = CURRENT_TIMESTAMP;
