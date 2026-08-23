import Link from "next/link";
import type { ConversationListResponse } from "../lib/api-client";
import { activityLabel, conversationHref, corridorLabel, customerLabel, maskWhatsApp, statusLabel } from "../lib/inbox-model";

type DashboardView = "all" | "automation" | "waiting" | "human";

export function ActivityDashboard({ data, activeView }: { data: ConversationListResponse; activeView: DashboardView }) {
  const metrics = [
    { view: "all", label: "All conversations", value: data.summary.total, tone: "total", href: "/dashboard" },
    { view: "automation", label: "Talking to bot", value: data.summary.automation, tone: "bot", href: "/dashboard?view=automation" },
    { view: "waiting", label: "Waiting for team", value: data.summary.waitingForTeam, tone: "waiting", href: "/dashboard?view=waiting" },
    { view: "human", label: "Human handling", value: data.summary.humanHandling, tone: "human", href: "/dashboard?view=human" },
  ];
  return <section className="activity-dashboard">
    <div className="activity-metrics" aria-label="Filter conversations">{metrics.map((metric) => <Link aria-current={activeView === metric.view ? "page" : undefined} className={`activity-metric activity-metric--${metric.tone}${activeView === metric.view ? " activity-metric--active" : ""}`} href={metric.href} key={metric.label}><strong>{metric.value}</strong><span>{metric.label}</span></Link>)}</div>
    <div className="activity-heading"><div><h2>{activeView === "automation" ? "Talking to bot" : activeView === "waiting" ? "Waiting for team" : activeView === "human" ? "Human handling" : "Latest inquiries"}</h2><p>{activeView === "all" ? "Every WhatsApp conversation, including customers still talking to automation." : "Tap any customer to see the full conversation."}</p></div><Link href={metrics.find((metric) => metric.view === activeView)?.href ?? "/dashboard"}>Refresh</Link></div>
    {data.conversations.length === 0 ? <div className="inbox-empty"><strong>No inquiries yet.</strong><p>New WhatsApp conversations will appear here.</p></div> : <div className="activity-feed">{data.conversations.map((conversation) => <Link className="activity-item" href={conversationHref(conversation.conversationId)} key={conversation.conversationId}>
      <div className="activity-item__top"><strong>{customerLabel(conversation)}</strong><time dateTime={conversation.latestMessageAt ?? undefined}>{activityLabel(conversation.latestMessageAt)}</time></div>
      {conversation.customer.displayName ? <span>{maskWhatsApp(conversation.customer.whatsappNumber)}</span> : null}<span>{corridorLabel(conversation) ?? "Inquiry in progress"}</span><p>{conversation.latestMessagePreview ?? "Conversation started"}</p><b className={`conversation-row__status conversation-row__status--${conversation.automationMode.toLowerCase()}`}>{statusLabel(conversation.automationMode)}</b>
    </Link>)}</div>}
    {data.page.hasMore ? <p className="activity-more">Showing the 50 most recent matching conversations. <Link href="/inbox">Open the full Inbox</Link>.</p> : null}
  </section>;
}
