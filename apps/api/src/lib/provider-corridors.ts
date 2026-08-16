import "server-only";
import type { ProviderCorridor, RateProvider } from "@barrel/providers";
import { createJuicywayProvider } from "./quote-service";

type ProviderSource = { id: string; name: string; client: RateProvider };
type ProviderState = { id: string; name: string; status: "AVAILABLE" | "UNAVAILABLE" };

function configuredProviders(): ProviderSource[] {
  // Add a new provider here. The comparison response unions its real corridors
  // into the existing directional rows automatically.
  return [{ id: "JUICYWAY", name: "Juicyway", client: createJuicywayProvider() }];
}

export type InternalProviderCorridorResponse = {
  asOf: string;
  providers: ProviderState[];
  corridors: Array<{
    sourceCurrency: string;
    targetCurrency: string;
    providers: Record<string, { available: boolean }>;
  }>;
};

export async function listProviderCorridors(): Promise<InternalProviderCorridorResponse> {
  const sources = configuredProviders();
  const results = await Promise.all(sources.map(async (source) => {
    try {
      return { source, corridors: await source.client.listSupportedCorridors(), available: true as const };
    } catch {
      // Do not disclose provider transport/authentication detail to the browser.
      return { source, corridors: [] as ProviderCorridor[], available: false as const };
    }
  }));

  const providers = results.map(({ source, available }): ProviderState => ({
    id: source.id,
    name: source.name,
    status: available ? "AVAILABLE" : "UNAVAILABLE",
  }));
  const byDirection = new Map<string, InternalProviderCorridorResponse["corridors"][number]>();

  for (const { source, corridors } of results) {
    for (const corridor of corridors) {
      const key = `${corridor.sourceCurrency}-${corridor.targetCurrency}`;
      const row = byDirection.get(key) ?? {
        sourceCurrency: corridor.sourceCurrency,
        targetCurrency: corridor.targetCurrency,
        providers: {},
      };
      row.providers[source.id] = { available: true };
      byDirection.set(key, row);
    }
  }

  return {
    asOf: new Date().toISOString(),
    providers,
    corridors: [...byDirection.values()].sort((a, b) =>
      a.sourceCurrency.localeCompare(b.sourceCurrency) || a.targetCurrency.localeCompare(b.targetCurrency),
    ),
  };
}
