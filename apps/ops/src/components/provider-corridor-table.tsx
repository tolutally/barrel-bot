"use client";

import { useMemo, useState } from "react";
import type { ProviderCorridorsResponse, ProviderRateResponse } from "../lib/api-client";

const FIAT_CURRENCIES = new Set(["NGN", "USD", "CAD", "GBP", "EUR"]);
const SUPPORTED_CURRENCIES = new Set([...FIAT_CURRENCIES, "USDT", "USDC"]);
type Filter = "ALL" | "FIAT" | "USDT" | "USDC" | "NGN_OUTBOUND" | "NGN_INBOUND";
class RateRequestError extends Error {
  constructor(readonly status: number) { super(`Rate request failed with ${status}`); }
}

function formatRefreshed(value: string): string {
  return new Intl.DateTimeFormat("en-CA", { hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(value));
}

export function ProviderCorridorTable({ data }: { data: ProviderCorridorsResponse }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [selected, setSelected] = useState<{ sourceCurrency: string; targetCurrency: string } | null>(null);
  const [rate, setRate] = useState<ProviderRateResponse | null>(null);
  const [rateLoading, setRateLoading] = useState(false);
  const [rateError, setRateError] = useState<string | null>(null);
  const corridors = useMemo(() => data.corridors.filter((corridor) => {
    const currencies = [corridor.sourceCurrency, corridor.targetCurrency];
    if (!currencies.every((currency) => SUPPORTED_CURRENCIES.has(currency))) return false;
    if (filter === "FIAT" && !currencies.every((currency) => FIAT_CURRENCIES.has(currency))) return false;
    if (filter === "USDT" && !currencies.includes("USDT")) return false;
    if (filter === "USDC" && !currencies.includes("USDC")) return false;
    if (filter === "NGN_OUTBOUND" && corridor.sourceCurrency !== "NGN") return false;
    if (filter === "NGN_INBOUND" && corridor.targetCurrency !== "NGN") return false;
    return `${corridor.sourceCurrency} ${corridor.targetCurrency}`.toLowerCase().includes(query.trim().toLowerCase());
  }), [data.corridors, filter, query]);

  async function selectCorridor(sourceCurrency: string, targetCurrency: string) {
    setSelected({ sourceCurrency, targetCurrency });
    setRate(null);
    setRateError(null);
    setRateLoading(true);
    try {
      const response = await fetch(`/api/provider-rates/${encodeURIComponent(sourceCurrency)}/${encodeURIComponent(targetCurrency)}`, { cache: "no-store" });
      if (!response.ok) throw new RateRequestError(response.status);
      setRate(await response.json() as ProviderRateResponse);
    } catch {
      setRateError("We couldn't load a live rate. Try again.");
    } finally {
      setRateLoading(false);
    }
  }

  return <section className="provider-corridors" aria-labelledby="provider-corridors-title">
    <div className="provider-corridors__intro">
      <div>
        <p className="provider-corridors__eyebrow">Live source</p>
        <h2 id="provider-corridors-title">Provider corridors</h2>
        <p>Directional routes published by each connected provider. Refreshed on load.</p>
      </div>
      <time dateTime={data.asOf}>Updated {formatRefreshed(data.asOf)}</time>
    </div>
    <div className="provider-statuses" aria-label="Provider availability">
      {data.providers.map((provider) => <span key={provider.id} className={`provider-status provider-status--${provider.status.toLowerCase()}`}>
        <i aria-hidden="true" />{provider.name}: {provider.status === "AVAILABLE" ? "Live" : "Unavailable"}
      </span>)}
    </div>
    <div className="provider-controls"><label><span>Search routes</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="e.g. CAD or NGN" /></label><div className="provider-filters" aria-label="Currency filter">{(["ALL", "NGN_OUTBOUND", "NGN_INBOUND", "FIAT", "USDT", "USDC"] as const).map((item) => <button key={item} type="button" className={filter === item ? "provider-filter--active" : undefined} onClick={() => setFilter(item)}>{item === "ALL" ? "All" : item === "NGN_OUTBOUND" ? "NGN →" : item === "NGN_INBOUND" ? "← NGN" : item === "FIAT" ? "Fiat" : item}</button>)}</div></div>
    {selected ? <div className="provider-rate-modal" role="presentation" onMouseDown={() => setSelected(null)}><aside className="provider-rate-card" role="dialog" aria-modal="true" aria-labelledby="provider-rate-title" aria-live="polite" onMouseDown={(event) => event.stopPropagation()}><div><p>Direct provider rate</p><h3 id="provider-rate-title">{selected.sourceCurrency} → {selected.targetCurrency}</h3></div><button type="button" className="provider-rate-card__close" onClick={() => setSelected(null)} aria-label="Close rate details">×</button>{rateLoading ? <p className="provider-rate-card__loading">Checking Juicyway…</p> : rate ? <><strong>{rate.displayRate}</strong><p>Juicyway · live indication · retrieved {formatRefreshed(rate.fetchedAt)}</p><small>No Barrel markup. This is Juicyway’s direct provider rate, not a locked customer rate.</small></> : <><p>{rateError}</p><button type="button" className="button-secondary" onClick={() => selectCorridor(selected.sourceCurrency, selected.targetCurrency)}>Try again</button></>}</aside></div> : null}
    {corridors.length ? <><div className="provider-table-wrap">
      <table className="provider-table">
        <thead><tr><th scope="col">From</th><th scope="col">To</th>{data.providers.map((provider) => <th key={provider.id} scope="col">{provider.name}</th>)}</tr></thead>
        <tbody>{corridors.map((corridor) => <tr key={`${corridor.sourceCurrency}-${corridor.targetCurrency}`} className={selected?.sourceCurrency === corridor.sourceCurrency && selected.targetCurrency === corridor.targetCurrency ? "provider-table__row--selected" : undefined} onClick={() => selectCorridor(corridor.sourceCurrency, corridor.targetCurrency)}>
          <td>{corridor.sourceCurrency}</td><td><span className="provider-table__arrow" aria-hidden="true">→</span>{corridor.targetCurrency}</td>
          {data.providers.map((provider) => <td key={provider.id}>{corridor.providers[provider.id]?.available ? <span className="provider-table__available">Available</span> : <span className="provider-table__empty">—</span>}</td>)}
        </tr>)}</tbody>
      </table>
    </div><div className="provider-mobile-list">{corridors.map((corridor) => <button type="button" key={`${corridor.sourceCurrency}-${corridor.targetCurrency}`} className={selected?.sourceCurrency === corridor.sourceCurrency && selected.targetCurrency === corridor.targetCurrency ? "provider-mobile-card provider-mobile-card--selected" : "provider-mobile-card"} onClick={() => selectCorridor(corridor.sourceCurrency, corridor.targetCurrency)}><span className="provider-mobile-card__route"><strong>{corridor.sourceCurrency}</strong><i aria-hidden="true">→</i><strong>{corridor.targetCurrency}</strong></span><span className="provider-mobile-card__providers">{data.providers.map((provider) => <span key={provider.id}>{provider.name} {corridor.providers[provider.id]?.available ? <b>Live</b> : "—"}</span>)}</span></button>)}</div></> : <div className="provider-corridors__empty"><strong>No matching routes</strong><p>Try another currency or filter.</p></div>}
  </section>;
}
