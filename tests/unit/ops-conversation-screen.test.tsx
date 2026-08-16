import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../apps/ops/src/app/inbox/[conversationId]/actions", () => ({ sendHumanReply: vi.fn(), finishHumanConversation: vi.fn() }));
import { ConversationScreen } from "../../apps/ops/src/components/conversation-screen";

const detail = {
  conversation: {
    conversationId: "cm_internal_123", automationMode: "HUMAN" as const,
    customer: { whatsappNumber: "+17805550198", displayName: "Ada Okafor" },
    handoff: { publicReference: "BRL-7F9A", state: "HANDED_OFF", tradeRequestStatus: "READY_FOR_HANDOFF", requestedAt: null, handedOffAt: null, closedAt: null },
    quote: { publicReference: "BRL-7F9A", sourceCurrency: "NGN", targetCurrency: "CAD", sourceAmount: "₦2,000,000", indicativeTargetAmount: "C$1,913.05", indicativeCustomerRate: "1045.45", quoteCreatedAt: "2026-08-16T16:00:00Z", customerRequestExpiresAt: "2026-08-16T16:15:00Z", indicative: true as const },
  },
  messages: [
    { senderType: "CUSTOMER" as const, contentType: "TEXT", textBody: "Okay, thanks.", createdAt: "2026-08-16T16:08:00Z", sentAt: null, deliveredAt: null, readAt: null, failedAt: null },
    { senderType: "OPERATOR" as const, contentType: "TEXT", textBody: "I’m checking.", createdAt: "2026-08-16T16:09:00Z", sentAt: "2026-08-16T16:09:00Z", deliveredAt: null, readAt: null, failedAt: null },
  ],
  messagePage: { limit: 50, hasMore: false, nextBefore: null },
};

describe("Ops conversation screen", () => {
  it("renders rate context, transcript, HUMAN composer, and finish action", () => {
    const html = renderToStaticMarkup(<ConversationScreen initial={detail} />);
    expect(html).toContain("NGN → CAD");
    expect(html).toContain("Customer sends");
    expect(html).toContain("₦2,000,000");
    expect(html).toContain("Indicative receive");
    expect(html).toContain("C$1 = ₦1,045.45");
    expect(html).toContain("Indicative rate");
    expect(html).toContain("Customer");
    expect(html).toContain("Staff");
    expect(html).toContain("Type a reply");
    expect(html).toContain("Finish conversation");
    expect(html).not.toContain("Barrel specialist:");
  });

  it("hides human controls when automation is on", () => {
    const html = renderToStaticMarkup(<ConversationScreen initial={{ ...detail, conversation: { ...detail.conversation, automationMode: "BOT" } }} />);
    expect(html).toContain("Automation on");
    expect(html).not.toContain("Type a reply");
    expect(html).not.toContain("Finish conversation");
  });
});
