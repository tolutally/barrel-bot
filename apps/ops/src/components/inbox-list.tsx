import Link from "next/link";
import type { ConversationListResponse } from "../lib/api-client";
import { activityLabel, conversationHref, corridorLabel, customerLabel, maskWhatsApp, statusLabel } from "../lib/inbox-model";

export function InboxList({ data }: { data: ConversationListResponse }) {
  if (data.conversations.length === 0) return <section className="inbox-empty"><h2>You’re all caught up.</h2><p>New customer conversations will appear here.</p></section>;
  return <>
    <section className="conversation-list" aria-label="Conversations">
      {data.conversations.map((conversation) => <Link className="conversation-row" href={conversationHref(conversation.conversationId)} key={conversation.conversationId}>
        <div className="conversation-row__top"><strong>{customerLabel(conversation)}</strong><time dateTime={conversation.latestMessageAt ?? undefined}>{activityLabel(conversation.latestMessageAt)}</time></div>
        {conversation.customer.displayName ? <span className="conversation-row__contact">{maskWhatsApp(conversation.customer.whatsappNumber)}</span> : null}
        <span className="conversation-row__corridor">{corridorLabel(conversation)}</span>
        <p className="conversation-row__preview">{conversation.latestMessagePreview ?? "No messages yet."}</p>
        <span className={`conversation-row__status conversation-row__status--${conversation.automationMode.toLowerCase()}`}>{statusLabel(conversation.automationMode)}</span>
      </Link>)}
    </section>
    <nav className="inbox-pagination" aria-label="Conversation pages">
      {data.page.number > 1 ? <Link href={`/inbox?page=${data.page.number - 1}&limit=${data.page.limit}`}>Previous</Link> : <span />}
      <span>Page {data.page.number}</span>
      {data.page.hasMore ? <Link href={`/inbox?page=${data.page.number + 1}&limit=${data.page.limit}`}>Next</Link> : <span />}
    </nav>
  </>;
}
