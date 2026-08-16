import type { RateProvider } from "./rate-provider";

export class ProviderNotRegisteredError extends Error {
  readonly code = "PROVIDER_NOT_REGISTERED";

  constructor(provider: string) {
    super(`rate provider is not registered: ${provider}`);
    this.name = "ProviderNotRegisteredError";
  }
}

export class ProviderRegistry {
  private readonly providers: ReadonlyMap<string, RateProvider>;

  constructor(providers: Readonly<Record<string, RateProvider>>) {
    this.providers = new Map(
      Object.entries(providers).map(([key, provider]) => [key.toUpperCase(), provider]),
    );
  }

  resolve(provider: string): RateProvider {
    const resolved = this.providers.get(provider.toUpperCase());
    if (!resolved) throw new ProviderNotRegisteredError(provider);
    return resolved;
  }
}
