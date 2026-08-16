import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  extractInboundMessages,
  extractInboundStatuses,
  reserveInboundMessages,
  verifyMetaSignature,
  verifyWebhookChallenge,
  webhookPayloadHash,
  type WebhookEventRepository,
} from "@barrel/whatsapp";

const textPayload = {
  entry: [{ changes: [{ value: { messages: [{ id: "wamid.1", from: "15551234567", type: "text", text: { body: "RATE" } }] } }] }],
};

describe("Meta WhatsApp webhook boundary", () => {
  it("accepts GET verification only for the configured token", () => {
    expect(
      verifyWebhookChallenge(
        new URLSearchParams({ "hub.mode": "subscribe", "hub.verify_token": "correct", "hub.challenge": "12345" }),
        "correct",
      ),
    ).toBe("12345");
    expect(
      verifyWebhookChallenge(
        new URLSearchParams({ "hub.mode": "subscribe", "hub.verify_token": "wrong", "hub.challenge": "12345" }),
        "correct",
      ),
    ).toBeNull();
  });

  it("accepts a valid POST signature and rejects invalid signatures", () => {
    const raw = JSON.stringify(textPayload);
    const signature = `sha256=${createHmac("sha256", "app-secret").update(raw).digest("hex")}`;
    expect(verifyMetaSignature(raw, signature, "app-secret")).toBe(true);
    expect(verifyMetaSignature(raw, `sha256=${"0".repeat(64)}`, "app-secret")).toBe(false);
    expect(verifyMetaSignature(raw, null, "app-secret")).toBe(false);
  });

  it("extracts supported text and interactive customer messages", () => {
    const payload = {
      entry: [{ changes: [{ value: { messages: [
        { id: "1", from: "100", type: "text", context: { id: "wamid.alert" }, text: { body: "RATE" } },
        { id: "2", from: "100", type: "interactive", interactive: { button_reply: { id: "PROCEED", title: "Continue" } } },
      ] } }] }],
    };
    expect(extractInboundMessages(payload)).toEqual([
      { id: "1", from: "100", text: "RATE", type: "text", contextMessageId: "wamid.alert" },
      {
        id: "2",
        from: "100",
        text: "Continue",
        commandText: "PROCEED",
        type: "interactive",
        metadata: { interactiveId: "PROCEED", interactiveTitle: "Continue" },
      },
    ]);
  });

  it("ignores status callbacks and unsupported message events", () => {
    expect(extractInboundMessages({ entry: [{ changes: [{ value: { statuses: [{ id: "status-1" }] } }] }] })).toEqual([]);
    expect(
      extractInboundMessages({
        entry: [{ changes: [{ value: { messages: [{ id: "image-1", from: "100", type: "image" }] } }] }],
      }),
    ).toEqual([]);
  });

  it("extracts Meta delivery and sanitized failure status callbacks", () => {
    expect(extractInboundStatuses({ entry: [{ changes: [{ value: { statuses: [
      { id: "wamid.sent", status: "delivered", timestamp: "1786677000" },
      { id: "wamid.failed", status: "failed", timestamp: "1786677001", errors: [
        { code: 131026, title: "Message undeliverable", error_data: { details: "Recipient is unavailable" } },
      ] },
    ] } }] }] })).toEqual([
      { messageId: "wamid.sent", status: "delivered", occurredAt: new Date(1786677000 * 1_000) },
      {
        messageId: "wamid.failed",
        status: "failed",
        occurredAt: new Date(1786677001 * 1_000),
        failureCode: "META_131026",
        failureMessage: "Recipient is unavailable",
      },
    ]);
  });

  it("reserves an inbound message once and ignores duplicate delivery", async () => {
    const seen = new Set<string>();
    const repository: WebhookEventRepository = {
      reserve: vi.fn(async (input) => {
        if (seen.has(input.externalId)) return false;
        seen.add(input.externalId);
        return true;
      }),
      markProcessed: vi.fn(async () => undefined),
    };
    const messages = extractInboundMessages(textPayload);
    expect(await reserveInboundMessages(repository, messages, webhookPayloadHash(JSON.stringify(textPayload)))).toHaveLength(1);
    expect(await reserveInboundMessages(repository, messages, webhookPayloadHash(JSON.stringify(textPayload)))).toHaveLength(0);
  });
});
