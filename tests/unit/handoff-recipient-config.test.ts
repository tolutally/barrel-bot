import { describe, expect, it } from "vitest";
import { normalizeAdminWhatsAppRecipient, parseAdminWhatsAppRecipients } from "@barrel/handoffs";

describe("admin WhatsApp recipient configuration", () => {
  it("normalizes, validates, and de-duplicates E.164 recipients", () => {
    expect(parseAdminWhatsAppRecipients("+1 (403) 555-0101, +15875550102,+14035550101")).toEqual([
      "+14035550101",
      "+15875550102",
    ]);
  });

  it("rejects invalid recipient identifiers", () => {
    expect(() => normalizeAdminWhatsAppRecipient("4035550101")).toThrow("E.164");
  });
});
