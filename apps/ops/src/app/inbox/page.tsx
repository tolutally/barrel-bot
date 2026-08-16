import { redirect } from "next/navigation";
import { LogoutButton } from "../../components/logout-button";
import { InboxError } from "../../components/inbox-error";
import { InboxList } from "../../components/inbox-list";
import { PushNotificationControl } from "../../components/push-notification-control";
import { BarrelInternalApiClient } from "../../lib/api-client";
import { getAuthorizedOperator } from "../../lib/require-operator";

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ page?: string; limit?: string }> }) {
  const result = await getAuthorizedOperator();
  if ("reason" in result) redirect(result.reason === "UNAUTHENTICATED" ? "/login" : "/login?error=not_authorized");
  const params = await searchParams;
  const page = Number(params.page);
  const limit = Number(params.limit);
  try {
    const data = await new BarrelInternalApiClient(result.accessToken).listConversations({
      ...(Number.isInteger(page) && page > 0 ? { page } : {}),
      ...(Number.isInteger(limit) && limit > 0 ? { limit } : {}),
    });
    return <main className="inbox"><header className="inbox-header"><div><span>Barrel</span><h1>Inbox</h1></div><div className="inbox-header__actions"><PushNotificationControl /><LogoutButton /></div></header><InboxList data={data} /></main>;
  } catch {
    return <main className="inbox"><header className="inbox-header"><div><span>Barrel</span><h1>Inbox</h1></div><div className="inbox-header__actions"><PushNotificationControl /><LogoutButton /></div></header><InboxError /></main>;
  }
}
