import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoutButton } from "../../components/logout-button";
import { OpsNavigation } from "../../components/ops-navigation";
import { ProviderCorridorTable } from "../../components/provider-corridor-table";
import { BarrelInternalApiClient } from "../../lib/api-client";
import { getAuthorizedOperator } from "../../lib/require-operator";

export default async function ProvidersPage() {
  const result = await getAuthorizedOperator();
  if ("reason" in result) redirect(result.reason === "UNAUTHENTICATED" ? "/login" : "/login?error=not_authorized");

  try {
    const data = await new BarrelInternalApiClient(result.accessToken).listProviderCorridors();
    return <main className="inbox"><header className="inbox-header"><div className="inbox-header__title"><span>Barrel</span><h1>Providers</h1></div><LogoutButton /></header><ProviderCorridorTable data={data} /><footer className="ops-bottom-nav"><OpsNavigation active="providers" /></footer></main>;
  } catch {
    return <main className="inbox"><header className="inbox-header"><div className="inbox-header__title"><span>Barrel</span><h1>Providers</h1></div><LogoutButton /></header><section className="provider-corridors__empty"><strong>We couldn’t load provider corridors.</strong><p>Check the provider connection and try again.</p><Link className="button-link" href="/providers">Try again</Link></section><footer className="ops-bottom-nav"><OpsNavigation active="providers" /></footer></main>;
  }
}
