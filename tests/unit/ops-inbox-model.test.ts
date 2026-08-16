import { describe, expect, it } from "vitest";
import { conversationHref, corridorLabel, customerLabel, maskWhatsApp, statusLabel } from "../../apps/ops/src/lib/inbox-model";

const item = {
  conversationId: "cm_internal_123",
  customer: { whatsappNumber: "+17805550198", displayName: null },
  automationMode: "HUMAN" as const,
  latestMessagePreview: "Okay, thanks.", latestMessageAt: "2026-08-16T16:08:00.000Z", latestMessageSenderType: "CUSTOMER" as const,
  publicReference: "BRL-7F9A", sourceCurrency: "NGN", targetCurrency: "CAD", handoffRequestedAt: null,
};

describe("Ops inbox row model", () => {
  it("maps every automation state to human-friendly copy", () => {
    expect(statusLabel("BOT")).toBe("Automation on");
    expect(statusLabel("HANDOFF_PENDING")).toBe("Waiting for team");
    expect(statusLabel("HUMAN")).toBe("Human handling");
  });

  it("shows a masked customer contact, public reference, corridor, and safe navigation", () => {
    expect(maskWhatsApp(item.customer.whatsappNumber)).toBe("+1 780 *** 0198");
    expect(customerLabel(item)).toBe("+1 780 *** 0198");
    expect(corridorLabel(item)).toBe("NGN → CAD · BRL-7F9A");
    expect(conversationHref(item.conversationId)).toBe("/inbox/cm_internal_123");
    expect(corridorLabel(item)).not.toContain(item.conversationId);
  });

  it("uses a display name when available without exposing a raw number as the row title", () => {
    expect(customerLabel({ ...item, customer: { ...item.customer, displayName: "Ada Okafor" } })).toBe("Ada Okafor");
  });
});
