import type { NextConfig } from "next";

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
