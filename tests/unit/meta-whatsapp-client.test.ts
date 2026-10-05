import { describe, expect, it, vi } from "vitest";
import { MetaWhatsAppClient, MetaWhatsAppSendError } from "@barrel/whatsapp";

describe("MetaWhatsAppClient template delivery", () => {
  it("downloads media through Meta's authenticated URL and sends uploaded images", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ url: "https://lookaside.example/media", mime_type: "image/jpeg" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ messages: [{ id: "wamid.image.1" }] }), { status: 200 }));
    const client = new MetaWhatsAppClient({ accessToken: "secret", phoneNumberId: "phone-id", graphApiVersion: "v23.0" }, fetchMock);
    await expect(client.downloadMedia("media-1")).resolves.toMatchObject({ mimeType: "image/jpeg" });
    await expect(client.sendImage("15551234567", "media-1", "Receipt")).resolves.toEqual({ messageId: "wamid.image.1" });
    expect(fetchMock.mock.calls[1]![1]?.headers).toMatchObject({ Authorization: "Bearer secret" });
    expect(JSON.parse(String(fetchMock.mock.calls[2]![1]?.body))).toMatchObject({ type: "image", image: { id: "media-1", caption: "Receipt" } });
  });

  it("uses the configured Barrel phone number for an exact operator text body", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ messages: [{ id: "wamid.operator.1" }] }), { status: 200 }));
    const client = new MetaWhatsAppClient(
      { accessToken: "secret", phoneNumberId: "barrel-cloud-number", graphApiVersion: "v23.0" },
      fetchMock,
    );
    await client.sendText("15551234567", "Hi — I've got your request.");
    expect(String(fetchMock.mock.calls[0]![0])).toContain("/barrel-cloud-number/messages");
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]?.body))).toEqual({
      messaging_product: "whatsapp", recipient_type: "individual", to: "15551234567", type: "text",
      text: { body: "Hi — I've got your request." },
    });
  });

  it("sends a WhatsApp interactive list for menus with more than three choices", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ messages: [{ id: "wamid.list.1" }] }), { status: 200 }));
    const client = new MetaWhatsAppClient(
      { accessToken: "secret", phoneNumberId: "phone-id", graphApiVersion: "v23.0" },
      fetchMock,
    );
    await client.sendList("15551234567", "What are you sending?", "Choose currency", "Available currencies", [
      { id: "NGN", title: "NGN — Nigerian Naira" },
      { id: "CAD", title: "CAD — Canadian Dollar" },
      { id: "USD", title: "USD — US Dollar" },
      { id: "USDT", title: "USDT — Tether" },
    ]);
    const payload = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body));
    expect(payload.interactive).toMatchObject({
      type: "list",
      action: { button: "Choose currency", sections: [{ title: "Available currencies" }] },
    });
    expect(payload.interactive.action.sections[0].rows).toHaveLength(4);
  });

  it("sends the approved template path with isolated body parameter ordering", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ messages: [{ id: "wamid.admin.1" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = new MetaWhatsAppClient(
      { accessToken: "secret", phoneNumberId: "phone-id", graphApiVersion: "v23.0" },
      fetchMock,
    );
    await expect(client.sendTemplate({
      to: "+14035550101",
      templateName: "barrel_new_trade_request",
      language: "en",
      bodyParameters: ["BRL-1042", "NGN → CAD"],
    })).resolves.toEqual({ messageId: "wamid.admin.1" });
    const payload = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body));
    expect(payload).toMatchObject({
      to: "+14035550101",
      type: "template",
      template: {
        name: "barrel_new_trade_request",
        language: { code: "en" },
        components: [{
          type: "body",
          parameters: [{ type: "text", text: "BRL-1042" }, { type: "text", text: "NGN → CAD" }],
        }],
      },
    });
    expect(JSON.stringify(payload)).not.toContain("secret");
  });

  it("classifies retryable Meta failures without exposing credentials", async () => {
    const client = new MetaWhatsAppClient(
      { accessToken: "top-secret", phoneNumberId: "phone-id", graphApiVersion: "v23.0" },
      vi.fn<typeof fetch>().mockResolvedValue(new Response("unavailable", { status: 503 })),
    );
    await expect(client.sendTemplate({
      to: "+14035550101",
      templateName: "barrel_new_trade_request",
      language: "en",
      bodyParameters: [],
    })).rejects.toMatchObject({
      safeCode: "META_HTTP_503",
      retryable: true,
    } satisfies Partial<MetaWhatsAppSendError>);
  });
});
