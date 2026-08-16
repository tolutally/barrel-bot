import { redirect } from "next/navigation";
import Link from "next/link";
import { LogoutButton } from "../../../components/logout-button";
import { ConversationScreen } from "../../../components/conversation-screen";
import { OpsNavigation } from "../../../components/ops-navigation";
import { BarrelInternalApiClient, InternalApiError } from "../../../lib/api-client";
import { getAuthorizedOperator } from "../../../lib/require-operator";

export default async function ConversationPage({ params }: { params: Promise<{ conversationId: string }> }) {
  const result = await getAuthorizedOperator();
  if ("reason" in result) redirect(result.reason === "UNAUTHENTICATED" ? "/login" : "/login?error=not_authorized");
  const { conversationId } = await params;
  try {
    const conversation = await new BarrelInternalApiClient(result.accessToken).getConversation(conversationId);
    return <main className="inbox"><header className="inbox-header"><div className="inbox-header__title"><Link className="inbox-back" href="/inbox" aria-label="Back to inbox">← Inbox</Link><span>Barrel</span><h1>Inbox</h1></div><LogoutButton /></header><ConversationScreen initial={conversation} /><footer className="ops-bottom-nav"><OpsNavigation active="inbox" /></footer></main>;
  } catch (error) {
    if (error instanceof InternalApiError && error.status === 404) return <main className="inbox"><section className="inbox-empty"><Link className="inbox-back" href="/inbox">← Back to inbox</Link><h2>Conversation not found.</h2></section></main>;
    return <main className="inbox"><section className="inbox-empty"><Link className="inbox-back" href="/inbox">← Back to inbox</Link><h2>We couldn’t load this conversation.</h2></section></main>;
  }
}
