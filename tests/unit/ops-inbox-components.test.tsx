import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InboxError } from "../../apps/ops/src/components/inbox-error";
import { InboxList } from "../../apps/ops/src/components/inbox-list";
import InboxLoading from "../../apps/ops/src/app/inbox/loading";

const row = {
  conversationId: "cm_internal_123",
  customer: { whatsappNumber: "+17805550198", displayName: null },
  automationMode: "HUMAN" as const,
  latestMessagePreview: "Okay, thanks.", latestMessageAt: "2026-08-16T16:08:00.000Z", latestMessageSenderType: "CUSTOMER" as const,
  publicReference: "BRL-7F9A", sourceCurrency: "NGN", targetCurrency: "CAD", handoffRequestedAt: null,
};

describe("Ops inbox components", () => {
  it("renders a navigable, sanitized conversation row with its status and public reference", () => {
    const html = renderToStaticMarkup(<InboxList data={{ conversations: [row], page: { number: 1, limit: 25, total: 2, hasMore: true } }} />);
    expect(html).toContain("+1 780 *** 0198");
    expect(html).toContain("NGN → CAD · BRL-7F9A");
    expect(html).toContain("Human handling");
    expect(html).toContain('href="/inbox/cm_internal_123"');
    expect(html).not.toContain("cm_internal_123</");
    expect(html).toContain("Next");
  });

  it("renders empty, loading, and retry states", () => {
    expect(renderToStaticMarkup(<InboxList data={{ conversations: [], page: { number: 1, limit: 25, total: 0, hasMore: false } }} />)).toContain("You’re all caught up.");
    expect(renderToStaticMarkup(<InboxLoading />)).toContain("Loading conversations");
    const error = renderToStaticMarkup(<InboxError />);
    expect(error).toContain("We couldn’t load conversations.");
    expect(error).toContain("Try again");
  });
});
