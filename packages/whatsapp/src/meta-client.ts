import type { InteractiveListRow, InteractiveOption, WhatsAppClient } from "./types";

export type MetaWhatsAppClientConfig = {
  accessToken: string;
  phoneNumberId: string;
  graphApiVersion: string;
};

export class MetaWhatsAppSendError extends Error {
  readonly safeCode: string;
  readonly safeMessage: string;
  readonly retryable: boolean;

  constructor(public readonly httpStatus: number) {
    super(`Meta WhatsApp send failed with HTTP ${httpStatus}`);
    this.name = "MetaWhatsAppSendError";
    this.safeCode = `META_HTTP_${httpStatus}`;
    this.safeMessage = `Meta WhatsApp delivery failed with HTTP ${httpStatus}`;
    this.retryable = httpStatus === 429 || httpStatus >= 500;
  }
}

export class MetaWhatsAppClient implements WhatsAppClient {
  constructor(
    private readonly config: MetaWhatsAppClientConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  sendText(to: string, body: string): Promise<{ messageId: string }> {
    return this.send({ messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { body } });
  }

  sendInteractive(to: string, body: string, options: InteractiveOption[]): Promise<{ messageId: string }> {
    return this.send({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: body },
        action: { buttons: options.map((option) => ({ type: "reply", reply: option })) },
      },
    });
  }

  sendList(
    to: string,
    body: string,
    buttonLabel: string,
    sectionTitle: string,
    rows: InteractiveListRow[],
  ): Promise<{ messageId: string }> {
    return this.send({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: body },
        action: {
          button: buttonLabel,
          sections: [{ title: sectionTitle, rows }],
        },
      },
    });
  }

  async downloadMedia(mediaId: string): Promise<{ bytes: Uint8Array; mimeType: string }> {
    const metadata = await this.authorizedFetch(
      `https://graph.facebook.com/${encodeURIComponent(this.config.graphApiVersion)}/${encodeURIComponent(mediaId)}`,
    );
    if (!metadata.ok) throw new MetaWhatsAppSendError(metadata.status);
    const body = await metadata.json() as { url?: unknown; mime_type?: unknown };
    if (typeof body.url !== "string" || typeof body.mime_type !== "string") {
      throw new Error("Meta media response did not include a download URL and MIME type");
    }
    const download = await this.authorizedFetch(body.url);
    if (!download.ok) throw new MetaWhatsAppSendError(download.status);
    return { bytes: new Uint8Array(await download.arrayBuffer()), mimeType: body.mime_type };
  }

  async uploadMedia(input: { bytes: Uint8Array; mimeType: string; fileName: string }): Promise<{ mediaId: string }> {
    const form = new FormData();
    form.set("messaging_product", "whatsapp");
    form.set("type", input.mimeType);
    const bytes = input.bytes.buffer.slice(input.bytes.byteOffset, input.bytes.byteOffset + input.bytes.byteLength) as ArrayBuffer;
    form.set("file", new Blob([bytes], { type: input.mimeType }), input.fileName);
    const response = await this.authorizedFetch(
      `https://graph.facebook.com/${encodeURIComponent(this.config.graphApiVersion)}/${encodeURIComponent(this.config.phoneNumberId)}/media`,
      { method: "POST", body: form },
    );
    if (!response.ok) throw new MetaWhatsAppSendError(response.status);
    const body = await response.json() as { id?: unknown };
    if (typeof body.id !== "string") throw new Error("Meta media upload did not include a media ID");
    return { mediaId: body.id };
  }

  sendImage(to: string, mediaId: string, caption?: string): Promise<{ messageId: string }> {
    return this.send({ messaging_product: "whatsapp", recipient_type: "individual", to, type: "image", image: { id: mediaId, ...(caption ? { caption } : {}) } });
  }

  sendDocument(to: string, mediaId: string, fileName: string, caption?: string): Promise<{ messageId: string }> {
    return this.send({ messaging_product: "whatsapp", recipient_type: "individual", to, type: "document", document: { id: mediaId, filename: fileName, ...(caption ? { caption } : {}) } });
  }

  sendTemplate(input: {
    to: string;
    templateName: string;
    language: string;
    bodyParameters: string[];
  }): Promise<{ messageId: string }> {
    return this.send({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: input.to,
      type: "template",
      template: {
        name: input.templateName,
        language: { code: input.language },
        components: [
          {
            type: "body",
            parameters: input.bodyParameters.map((text) => ({ type: "text", text })),
          },
        ],
      },
    });
  }

  private async send(payload: unknown): Promise<{ messageId: string }> {
    const response = await this.authorizedFetch(
      `https://graph.facebook.com/${encodeURIComponent(this.config.graphApiVersion)}/${encodeURIComponent(this.config.phoneNumberId)}/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    if (!response.ok) throw new MetaWhatsAppSendError(response.status);
    const body = (await response.json()) as { messages?: Array<{ id?: string }> };
    const messageId = body.messages?.[0]?.id;
    if (!messageId) throw new Error("Meta WhatsApp send response did not include a message ID");
    return { messageId };
  }

  private authorizedFetch(url: string, init: RequestInit = {}): Promise<Response> {
    return this.fetchImpl(url, {
      ...init,
      headers: { Authorization: `Bearer ${this.config.accessToken}`, ...init.headers },
    });
  }
}
