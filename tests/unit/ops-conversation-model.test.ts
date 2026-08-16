import { describe, expect, it } from "vitest";
import { messageLabel, messageStatus, rateLabel } from "../../apps/ops/src/lib/conversation-model";

describe("Ops conversation model", () => {
  it("maps internal sender types and supported delivery states", () => {
    expect(messageLabel("CUSTOMER")).toBe("Customer");
    expect(messageLabel("BOT")).toBe("Bot");
    expect(messageLabel("OPERATOR")).toBe("Staff");
    const base = { senderType: "OPERATOR" as const, contentType: "TEXT", textBody: "Hi", createdAt: "2026-08-16T16:08:00Z", sentAt: "2026-08-16T16:08:00Z", deliveredAt: null, readAt: null, failedAt: null };
    expect(messageStatus(base)).toBe("Sent");
    expect(messageStatus({ ...base, deliveredAt: "2026-08-16T16:08:05Z" })).toBe("Delivered");
    expect(messageStatus({ ...base, readAt: "2026-08-16T16:08:07Z" })).toBe("Read");
    expect(messageStatus({ ...base, failedAt: "2026-08-16T16:08:02Z" })).toBe("Failed");
  });

  it("labels an immutable quote as indicative without calling it current or final", () => {
    expect(rateLabel({ publicReference: "BRL-1", sourceCurrency: "NGN", targetCurrency: "CAD", sourceAmount: "₦2,000,000", indicativeTargetAmount: "C$1,913.05", indicativeCustomerRate: "1045.45", quoteCreatedAt: "2026-08-16T16:00:00Z", customerRequestExpiresAt: "2026-08-16T16:15:00Z", indicative: true })).toBe("C$1 = ₦1,045.45");
  });
});
