import { z } from "zod";
import Decimal from "decimal.js";
import { normalizeToSourcePerTarget } from "./rate-normalization";
import type { ProviderQuote, RateProvider, RateRequest } from "./rate-provider";

const juicywayQuoteSchema = z.object({
  data: z.object({
    id: z.string().min(1).nullable().optional(),
    locked: z.boolean(),
    rate: z.union([z.string(), z.number()]).transform(String),
    symbol: z.string().regex(/^[A-Za-z0-9]+-[A-Za-z0-9]+$/),
    time_to_convert: z.number().int().positive().nullable().optional(),
    time_to_lock: z.number().int().positive().nullable().optional(),
    ttl: z.number().int().positive().nullable().optional(),
    type: z.enum(["buy", "sell"]).nullable().optional(),
  }),
});

export type JuicywayProviderConfig = {
  baseUrl: string;
  apiKey: string;
  quotePath?: string;
  pairsPath?: string;
  timeoutMs?: number;
  maxRetries?: number;
};

export class JuicywayProviderError extends Error {
  constructor(
    public readonly code:
      | "CONFIGURATION_ERROR"
      | "AUTHENTICATION_ERROR"
      | "REQUEST_TIMEOUT"
      | "HTTP_ERROR"
      | "INVALID_RESPONSE",
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "JuicywayProviderError";
  }
}

type JuicywayDependencies = {
  fetch?: typeof fetch;
  now?: () => Date;
  sleep?: (milliseconds: number) => Promise<void>;
};

// Juicyway documents exchange-rate prices in the pair's quote-currency minor
// units. Keep this provider encoding out of Barrel's generic rate model.
const JUICYWAY_RATE_MINOR_UNIT_PRECISION: Readonly<Record<string, number>> = {
  CAD: 2,
  NGN: 2,
  USD: 2,
  USDT: 2,
};

function decodeJuicywayRate(rawRate: string, rawQuoteCurrency: string): string {
  const precision = JUICYWAY_RATE_MINOR_UNIT_PRECISION[rawQuoteCurrency.toUpperCase()];
  if (precision === undefined) {
    throw new JuicywayProviderError(
      "INVALID_RESPONSE",
      `Juicyway rate precision is not configured for ${rawQuoteCurrency.toUpperCase()}`,
    );
  }
  return new Decimal(rawRate).div(new Decimal(10).pow(precision)).toString();
}

function normalizeBaseUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:") {
    throw new JuicywayProviderError("CONFIGURATION_ERROR", "Juicyway base URL must use HTTPS");
  }
  return url.toString().replace(/\/$/, "");
}

export class JuicywayProvider implements RateProvider {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly quotePath: string;
  private readonly pairsPath: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;
  private readonly sleep: (milliseconds: number) => Promise<void>;

  constructor(config: JuicywayProviderConfig, dependencies: JuicywayDependencies = {}) {
    const apiKey = config.apiKey.trim();
    if (!apiKey) {
      throw new JuicywayProviderError("CONFIGURATION_ERROR", "Juicyway API key is required");
    }
    if (/^Bearer\s/i.test(apiKey)) {
      throw new JuicywayProviderError(
        "CONFIGURATION_ERROR",
        "Juicyway API key must be provided without a Bearer prefix",
      );
    }
    this.baseUrl = normalizeBaseUrl(config.baseUrl);
    this.apiKey = apiKey;
    this.quotePath = config.quotePath ?? "/exchange/quote";
    this.pairsPath = config.pairsPath ?? "/exchange/pairs";
    this.timeoutMs = config.timeoutMs ?? 8_000;
    this.maxRetries = config.maxRetries ?? 1;
    this.fetchImpl = dependencies.fetch ?? fetch;
    this.now = dependencies.now ?? (() => new Date());
    this.sleep = dependencies.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  }

  async getIndicativeQuote(request: RateRequest): Promise<ProviderQuote> {
    const sourceCurrency = request.sourceCurrency.toUpperCase();
    const targetCurrency = request.targetCurrency.toUpperCase();
    const url = new URL(this.quotePath, `${this.baseUrl}/`);
    url.searchParams.set("source_currency", sourceCurrency);
    url.searchParams.set("target_currency", targetCurrency);
    url.searchParams.set("lock", "false");

    const rawResponse = await this.requestJson(url);
    const parsed = juicywayQuoteSchema.safeParse(rawResponse);
    if (!parsed.success) {
      throw new JuicywayProviderError("INVALID_RESPONSE", "Juicyway quote response did not match the expected schema");
    }

    const [rawBase, rawQuote] = parsed.data.data.symbol.split("-") as [string, string];
    const decodedRate = decodeJuicywayRate(parsed.data.data.rate, rawQuote);
    const normalizedRate = normalizeToSourcePerTarget({
      rawRate: decodedRate,
      rawBase,
      rawQuote,
      sourceCurrency,
      targetCurrency,
    });
    const ttlSeconds = this.resolveTtlSeconds(parsed.data.data);

    return {
      provider: "JUICYWAY",
      providerQuoteId: parsed.data.data.id ?? null,
      sourceCurrency,
      targetCurrency,
      normalizedSourcePerTargetRate: normalizedRate,
      rawRate: parsed.data.data.rate,
      rawSymbol: parsed.data.data.symbol,
      rawType: parsed.data.data.type ?? null,
      locked: parsed.data.data.locked,
      expiresAt: new Date(this.now().getTime() + ttlSeconds * 1000),
      rawResponse,
    };
  }

  async healthCheck(): Promise<{ ok: boolean; message?: string }> {
    try {
      await this.requestJson(new URL(this.pairsPath, `${this.baseUrl}/`), 0);
      return { ok: true };
    } catch (error) {
      return { ok: false, message: error instanceof JuicywayProviderError ? error.code : "UNKNOWN_ERROR" };
    }
  }

  private resolveTtlSeconds(data: z.infer<typeof juicywayQuoteSchema>["data"]): number {
    const ttl = data.locked ? data.time_to_convert : data.time_to_lock;
    const fallback = data.ttl ?? data.time_to_convert ?? data.time_to_lock;
    if (!ttl && !fallback) {
      throw new JuicywayProviderError("INVALID_RESPONSE", "Juicyway quote response did not include a usable TTL");
    }
    return ttl ?? fallback!;
  }

  private async requestJson(url: URL, retries = this.maxRetries): Promise<unknown> {
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await this.fetchImpl(url, {
          method: "GET",
          headers: { Authorization: this.getApiKey(), Accept: "application/json" },
          signal: controller.signal,
        });
        if (response.ok) return await response.json();

        if (response.status === 401 || response.status === 403) {
          throw new JuicywayProviderError(
            "AUTHENTICATION_ERROR",
            `Juicyway rejected the API key (HTTP ${response.status}); confirm the key is active and belongs to this environment`,
            response.status,
          );
        }

        const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
        if (retryable && attempt < retries) {
          const retryAfter = Number(response.headers.get("retry-after"));
          await this.sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 250 * 2 ** attempt);
          continue;
        }
        throw new JuicywayProviderError("HTTP_ERROR", `Juicyway request failed with HTTP ${response.status}`, response.status);
      } catch (error) {
        if (error instanceof JuicywayProviderError) throw error;
        if (error instanceof Error && error.name === "AbortError") {
          if (attempt < retries) {
            await this.sleep(250 * 2 ** attempt);
            continue;
          }
          throw new JuicywayProviderError("REQUEST_TIMEOUT", "Juicyway request timed out");
        }
        if (attempt >= retries) {
          throw new JuicywayProviderError("HTTP_ERROR", "Juicyway request failed before receiving a response");
        }
        await this.sleep(250 * 2 ** attempt);
      } finally {
        clearTimeout(timeout);
      }
    }
    throw new JuicywayProviderError("HTTP_ERROR", "Juicyway request failed");
  }

  private getApiKey(): string {
    // Kept behind a method so errors and logs never serialize provider configuration.
    return this.apiKey;
  }
}
