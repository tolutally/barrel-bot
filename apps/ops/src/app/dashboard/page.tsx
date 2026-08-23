import Link from "next/link";
import { redirect } from "next/navigation";
import { ActivityDashboard } from "../../components/activity-dashboard";
import { LogoutButton } from "../../components/logout-button";
import { OpsNavigation } from "../../components/ops-navigation";
import { PushNotificationControl } from "../../components/push-notification-control";
import { BarrelInternalApiClient } from "../../lib/api-client";
import { getAuthorizedOperator } from "../../lib/require-operator";

export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const result = await getAuthorizedOperator();
  if ("reason" in result) redirect(result.reason === "UNAUTHENTICATED" ? "/login" : "/login?error=not_authorized");
  try {
    const requestedView = (await searchParams).view;
    const activeView = requestedView === "automation" || requestedView === "waiting" || requestedView === "human" ? requestedView : "all";
    const mode = activeView === "automation" ? "BOT" : activeView === "waiting" ? "HANDOFF_PENDING" : activeView === "human" ? "HUMAN" : undefined;
    const data = await new BarrelInternalApiClient(result.accessToken).listConversations({ limit: 50, order: "activity", ...(mode ? { mode } : {}) });
    return <main className="inbox"><header className="inbox-header"><div><span>Barrel</span><h1>Dashboard</h1></div><div className="inbox-header__actions"><PushNotificationControl /><LogoutButton /></div></header><ActivityDashboard data={data} activeView={activeView} /><footer className="ops-bottom-nav"><OpsNavigation active="dashboard" /></footer></main>;
  } catch {
    return <main className="inbox"><header className="inbox-header"><div><span>Barrel</span><h1>Dashboard</h1></div><LogoutButton /></header><section className="inbox-empty"><strong>We couldn’t load conversation activity.</strong><Link className="button-link" href="/dashboard">Try again</Link></section><footer className="ops-bottom-nav"><OpsNavigation active="dashboard" /></footer></main>;
  }
}
