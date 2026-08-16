-- Provider routing belongs to each directional corridor. The default safely
-- backfills the single existing NGN -> CAD development corridor.
ALTER TABLE "CorridorConfig"
ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'JUICYWAY';

ALTER TABLE "CorridorConfig"
ALTER COLUMN "provider" DROP DEFAULT;
