UPDATE "CorridorConfig"
SET "spreadMode" = 'PERCENTAGE',
    "fixedSpread" = 0,
    "percentageSpread" = 0.015,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "provider" = 'JUICYWAY'
  AND "enabled" = true
  AND ("sourceCurrency", "targetCurrency") IN (
    ('NGN', 'CAD'), ('NGN', 'USD'), ('NGN', 'USDT'),
    ('CAD', 'NGN'), ('CAD', 'USD'), ('CAD', 'USDT'),
    ('USD', 'NGN'), ('USD', 'CAD'),
    ('USDT', 'NGN'), ('USDT', 'CAD')
  );
