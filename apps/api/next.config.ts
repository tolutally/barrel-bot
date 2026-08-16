import type { NextConfig } from "next";
import { config as loadEnvironment } from "dotenv";
import { fileURLToPath } from "node:url";

// The API is run from this workspace in development while shared local
// credentials live at the monorepo root. Railway supplies its own variables.
loadEnvironment({ path: fileURLToPath(new URL("../../.env.local", import.meta.url)) });

const nextConfig: NextConfig = {
  poweredByHeader: false,
  transpilePackages: [
    "@barrel/db",
    "@barrel/domain",
    "@barrel/pricing",
    "@barrel/providers",
    "@barrel/quotes",
    "@barrel/shared",
    "@barrel/storage",
    "@barrel/trade-intents",
    "@barrel/handoffs",
    "@barrel/public-api",
  ],
};

export default nextConfig;
