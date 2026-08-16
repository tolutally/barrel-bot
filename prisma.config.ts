import { config } from "dotenv";
import { defineConfig } from "prisma/config";

config();
config({ path: ".env.local", override: false });

const migrationDatabaseUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

export default defineConfig({
  schema: "packages/db/prisma/schema.prisma",
  migrations: {
    seed: "tsx packages/db/prisma/seed.ts",
  },
  ...(migrationDatabaseUrl
    ? {
        // `engine: "classic"` is required for the `datasource` override to take effect.
        engine: "classic" as const,
        datasource: {
          // Prefer Supabase's direct/session connection for migrations.
          url: migrationDatabaseUrl,
        },
      }
    : {}),
});
