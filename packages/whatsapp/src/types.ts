import type { CustomerQuote } from "@barrel/domain";
export type { TradeHandoffApplicationService, CustomerSafeHandoffResult } from "@barrel/handoffs";
export type { AdminNotificationDispatcher } from "@barrel/handoffs";
export type { TradeIntentApplicationService, TradeIntentRecord } from "@barrel/trade-intents";

export type ConversationState =
  | "IDLE"
  | "CHOOSING_SOURCE_CURRENCY"
  | "CHOOSING_TARGET_CURRENCY"
  | "AWAITING_AMOUNT"
  | "QUOTE_PRESENTED"
  | "AWAITING_PAYMENT_PURPOSE"
  | "AWAITING_PAYMENT_PURPOSE_DETAIL"
  | "TRADE_REQUEST_READY"
  | "OPTED_OUT";

export type ConversationSession = {
  id: string;
  state: ConversationState;
  automationMode: "BOT" | "HANDOFF_PENDING" | "HUMAN";
  selectedSourceCurrency: string | null;
  selectedTargetCurrency: string | null;
  latestQuoteId: string | null;
  latestTradeIntentId: string | null;
  lastInboundAt?: Date | null;
  handoffStartedAt?: Date | null;
  lastOperatorActivityAt?: Date | null;
};

export type CorridorDirection = {
  sourceCurrency: string;
  targetCurrency: string;
  minSourceAmountMinor: bigint;
  maxSourceAmountMinor: bigint;
};

export type ConversationMessageInput = {
  conversationId: string;
  direction: "INBOUND" | "OUTBOUND";
  senderType: "CUSTOMER" | "BOT" | "OPERATOR" | "SYSTEM";
  contentType: "TEXT" | "INTERACTIVE" | "IMAGE" | "DOCUMENT" | "OTHER";
  textBody?: string;
  externalMessageId?: string;
  replyToExternalMessageId?: string;
  operatorId?: string;
  sentAt?: Date;
  metadata?: Record<string, unknown>;
};

export type OutboundMessageStatus = {
  messageId: string;
  status: "sent" | "delivered" | "read" | "failed";
  occurredAt: Date;
  failureCode?: string;
  failureMessage?: string;
};

export interface ConversationRepository {
  getOrCreate(externalIdentifier: string, at: Date): Promise<ConversationSession>;
  listEnabledDirections(): Promise<CorridorDirection[]>;
  setJourney(
    id: string,
    input: { state: ConversationState; sourceCurrency?: string | null; targetCurrency?: string | null },
  ): Promise<void>;
  presentQuote(id: string, quoteId: string): Promise<void>;
  markOptedOut(id: string, at: Date): Promise<void>;
  recordInbound(id: string, at: Date): Promise<void>;
  recordMessage(input: ConversationMessageInput): Promise<boolean>;
  recordOutboundStatus(input: OutboundMessageStatus): Promise<boolean>;
  closeStaleHandoff(id: string, at: Date, idleTimeoutMs: number): Promise<boolean>;
}

export interface QuoteApplicationService {
  createIndicativeQuote(input: {
    sourceCurrency: string;
    targetCurrency: string;
    sourceAmountMinor: bigint;
    conversationId?: string;
  }): Promise<CustomerQuote>;
}

export type InteractiveOption = { id: string; title: string };
export type InteractiveListRow = { id: string; title: string; description?: string };

export interface WhatsAppClient {
  sendText(to: string, body: string): Promise<{ messageId: string }>;
  sendInteractive(to: string, body: string, options: InteractiveOption[]): Promise<{ messageId: string }>;
  sendList(
    to: string,
    body: string,
    buttonLabel: string,
    sectionTitle: string,
    rows: InteractiveListRow[],
  ): Promise<{ messageId: string }>;
}
