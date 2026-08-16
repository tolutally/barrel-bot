import type { ConversationRepository, InteractiveListRow, InteractiveOption, WhatsAppClient } from "./types";

/** Persists every customer-facing bot send after Meta accepts it. */
export class TranscriptWhatsAppClient implements WhatsAppClient {
  constructor(
    private readonly client: WhatsAppClient,
    private readonly conversations: ConversationRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async sendText(to: string, body: string): Promise<{ messageId: string }> {
    const result = await this.client.sendText(to, body);
    await this.record(to, result.messageId, "TEXT", body);
    return result;
  }

  async sendInteractive(to: string, body: string, options: InteractiveOption[]): Promise<{ messageId: string }> {
    const result = await this.client.sendInteractive(to, body, options);
    await this.record(to, result.messageId, "INTERACTIVE", body, { options });
    return result;
  }

  async sendList(
    to: string,
    body: string,
    buttonLabel: string,
    sectionTitle: string,
    rows: InteractiveListRow[],
  ): Promise<{ messageId: string }> {
    const result = await this.client.sendList(to, body, buttonLabel, sectionTitle, rows);
    await this.record(to, result.messageId, "INTERACTIVE", body, { buttonLabel, sectionTitle, rows });
    return result;
  }

  private async record(
    recipient: string,
    externalMessageId: string,
    contentType: "TEXT" | "INTERACTIVE",
    textBody: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const conversation = await this.conversations.getOrCreate(recipient, this.now());
    await this.conversations.recordMessage({
      conversationId: conversation.id,
      direction: "OUTBOUND",
      senderType: "BOT",
      contentType,
      textBody,
      externalMessageId,
      sentAt: this.now(),
      metadata,
    });
  }
}
