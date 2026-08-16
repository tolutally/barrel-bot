import { displayToMinorUnits } from "@barrel/pricing";
import type {
  ConversationRepository,
  ConversationSession,
  AdminNotificationDispatcher,
  CorridorDirection,
  QuoteApplicationService,
  TradeHandoffApplicationService,
  TradeIntentApplicationService,
  WhatsAppClient,
} from "./types";
import {
  currencyOptionLabel,
  formatAmountPrompt,
  formatCustomerMoneyMinor,
  formatCustomerQuoteMessage,
  parseCurrencySelection,
} from "./presentation";

const START_COMMANDS = new Set(["HI", "HELLO", "RATE", "QUOTE", "TRADE", "EXCHANGE", "START", "NEW RATE", "NEW_RATE", "NEW QUOTE", "NEW_QUOTE", "SEND MONEY"]);

function normalizeInput(input: string): string {
  return input.trim().replace(/\s+/g, " ").toUpperCase();
}

export function parseCustomerAmountMinor(input: string, precision = 2): bigint {
  const normalized = input.trim()
    .replace(/^(?:NGN|CAD|USD|USDT|C\$|US\$|₦|\$)\s*/i, "")
    .replace(/\s*(?:NGN|CAD|USD|USDT)$/i, "")
    .replace(/[₦,$\s]/g, "");
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) throw new Error("INVALID_AMOUNT");
  return displayToMinorUnits(normalized, precision);
}

function isQuoteOrTradeIntent(command: string): boolean {
  if (["CONTINUE_WITH_RATE", "NEW_RATE", "NEW RATE", "SPEAK_WITH_TEAM", "TRY_AGAIN", "TRY AGAIN"].includes(command)) return false;
  return START_COMMANDS.has(command) || /\b(?:RATE|QUOTE|TRADE|EXCHANGE|SEND MONEY)\b/.test(command);
}

function isHumanSupportIntent(command: string): boolean {
  return /^(?:HUMAN|AGENT|SUPPORT|HELP ME|SPEAK TO SOMEONE|TALK TO SOMEONE|SPEAK WITH BARREL|TALK TO BARREL|SPEAK WITH (?:OUR )?TEAM|SPEAK_WITH_TEAM|I NEED (?:TO SPEAK TO )?SOMEONE)$/.test(command);
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

export class ConversationService {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly quotes: QuoteApplicationService,
    private readonly tradeIntents: TradeIntentApplicationService,
    private readonly handoffs: TradeHandoffApplicationService,
    private readonly adminNotifications: AdminNotificationDispatcher,
    private readonly whatsApp: WhatsAppClient,
    private readonly now: () => Date = () => new Date(),
    private readonly humanIdleTimeoutMs = Number(process.env.HUMAN_HANDOFF_IDLE_TIMEOUT_HOURS ?? "24") * 60 * 60 * 1_000,
  ) {}

  async handleInboundMessage(input: {
    from: string;
    messageId: string;
    text: string;
    transcriptText?: string;
    contentType?: "TEXT" | "INTERACTIVE" | "IMAGE" | "DOCUMENT" | "OTHER";
    replyToExternalMessageId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const conversation = await this.conversations.getOrCreate(input.from, this.now());
    const recorded = await this.conversations.recordMessage({
      conversationId: conversation.id,
      direction: "INBOUND",
      senderType: "CUSTOMER",
      contentType: input.contentType ?? "TEXT",
      textBody: input.transcriptText ?? input.text,
      externalMessageId: input.messageId,
      replyToExternalMessageId: input.replyToExternalMessageId,
      metadata: input.metadata,
    });
    if (!recorded) return;
    if (conversation.automationMode === "HUMAN") {
      const stale = await this.conversations.closeStaleHandoff(conversation.id, this.now(), this.humanIdleTimeoutMs);
      await this.conversations.recordInbound(conversation.id, this.now());
      if (!stale) return;
      conversation.automationMode = "BOT";
      conversation.state = "IDLE";
    } else {
      await this.conversations.recordInbound(conversation.id, this.now());
    }
    const command = normalizeInput(input.text);

    if (command === "STOP") {
      if (conversation.state !== "OPTED_OUT") {
        await this.conversations.markOptedOut(conversation.id, this.now());
        await this.whatsApp.sendText(input.from, "You’ve been unsubscribed from Barrel automated messages.");
      }
      return;
    }
    if (conversation.state === "OPTED_OUT") return;
    if (conversation.automationMode !== "BOT") return;
    if (command === "HELP") {
      await this.whatsApp.sendText(
        input.from,
        "I can help you:\n\n• Get an FX rate\n• Continue with a rate\n• Speak with the Barrel team\n\nSend RATE anytime to get started.",
      );
      return;
    }
    if (["NEW_RATE", "NEW RATE", "TRY_AGAIN", "TRY AGAIN"].includes(command)) {
      await this.startQuoteJourney(input.from, conversation, false, true);
      return;
    }
    if (isHumanSupportIntent(command)) {
      await this.speakWithTeam(input.from, conversation);
      return;
    }
    if (isQuoteOrTradeIntent(command)) {
      await this.startQuoteJourney(input.from, conversation, true);
      return;
    }

    switch (conversation.state) {
      case "CHOOSING_SOURCE_CURRENCY":
        await this.chooseSource(input.from, conversation, command);
        return;
      case "CHOOSING_TARGET_CURRENCY":
        await this.chooseTarget(input.from, conversation, command);
        return;
      case "AWAITING_AMOUNT":
        await this.createQuote(input.from, conversation, input.text);
        return;
      case "QUOTE_PRESENTED":
        if (command === "CONTINUE WITH THIS RATE" || command === "CONTINUE_WITH_RATE") {
          await this.requestTrade(input.from, conversation);
        } else {
          await this.sendQuoteActions(input.from);
        }
        return;
      case "AWAITING_PAYMENT_PURPOSE":
      case "AWAITING_PAYMENT_PURPOSE_DETAIL":
        if (conversation.latestQuoteId) await this.sendQuoteActions(input.from);
        else await this.startQuoteJourney(input.from, conversation);
        return;
      case "TRADE_REQUEST_READY":
        await this.whatsApp.sendText(input.from, "Whenever you need another rate, just say what you’d like to trade.");
        return;
      default:
        await this.startQuoteJourney(input.from, conversation, false);
    }
  }

  private sendQuoteActions(to: string): Promise<{ messageId: string }> {
    return this.whatsApp.sendList(to, "What would you like to do?\n\nNeed help? Speak with our team", "Choose action", "Rate actions", [
      { id: "CONTINUE_WITH_RATE", title: "Continue with this rate" },
      { id: "NEW_RATE", title: "New rate" },
      { id: "SPEAK_WITH_TEAM", title: "Speak with our team" },
    ]);
  }

  private async startQuoteJourney(to: string, conversation: ConversationSession, withIntro = false, restarting = false): Promise<void> {
    const directions = await this.conversations.listEnabledDirections();
    const sources = unique(directions.map((item) => item.sourceCurrency));
    if (sources.length === 0) {
      await this.whatsApp.sendText(to, "Rates are temporarily unavailable. Please try again shortly.");
      return;
    }
    if (sources.length === 1) {
      await this.continueWithSource(to, conversation.id, sources[0]!, directions);
      return;
    }
    await this.conversations.setJourney(conversation.id, {
      state: "CHOOSING_SOURCE_CURRENCY",
      sourceCurrency: null,
      targetCurrency: null,
    });
    const body = restarting ? "Sure.\n\nWhat are you sending?" : withIntro
      ? "Hi 👋\nLet's get you a rate.\n\nWhat are you sending?"
      : "What are you sending?";
    await this.sendCurrencySelector(to, body, sources);
  }

  private async chooseSource(to: string, conversation: ConversationSession, source: string): Promise<void> {
    const directions = await this.conversations.listEnabledDirections();
    const sources = unique(directions.map((item) => item.sourceCurrency));
    const selected = parseCurrencySelection(source, sources);
    if (!selected) {
      await this.sendCurrencySelector(to, "What are you sending?", sources);
      return;
    }
    await this.continueWithSource(to, conversation.id, selected, directions);
  }

  private async continueWithSource(
    to: string,
    conversationId: string,
    source: string,
    directions: CorridorDirection[],
  ): Promise<void> {
    const targets = unique(directions.filter((item) => item.sourceCurrency === source).map((item) => item.targetCurrency));
    if (targets.length === 1) {
      await this.moveToAmount(to, conversationId, source, targets[0]!, directions);
      return;
    }
    await this.conversations.setJourney(conversationId, {
      state: "CHOOSING_TARGET_CURRENCY",
      sourceCurrency: source,
      targetCurrency: null,
    });
    await this.sendCurrencySelector(to, "What would you like to receive?", targets);
  }

  private async chooseTarget(to: string, conversation: ConversationSession, target: string): Promise<void> {
    const directions = await this.conversations.listEnabledDirections();
    if (!conversation.selectedSourceCurrency) {
      await this.startQuoteJourney(to, conversation);
      return;
    }
    const targets = unique(directions.filter((item) => item.sourceCurrency === conversation.selectedSourceCurrency).map((item) => item.targetCurrency));
    const selected = parseCurrencySelection(target, targets);
    if (!selected) {
      await this.sendCurrencySelector(to, "What would you like to receive?", targets);
      return;
    }
    await this.moveToAmount(to, conversation.id, conversation.selectedSourceCurrency, selected, directions);
  }

  private async createQuote(to: string, conversation: ConversationSession, rawAmount: string): Promise<void> {
    const source = conversation.selectedSourceCurrency;
    const target = conversation.selectedTargetCurrency;
    if (!source || !target) {
      await this.startQuoteJourney(to, conversation);
      return;
    }
    let amountMinor: bigint;
    try {
      amountMinor = parseCustomerAmountMinor(rawAmount);
    } catch {
      await this.whatsApp.sendText(to, `I couldn't read that amount.\n\nTry something like ${formatCustomerMoneyMinor(source === "NGN" ? 2_000_000_00n : 2_000_00n, source, true)}.`);
      return;
    }
    const corridor = (await this.conversations.listEnabledDirections()).find(
      (item) => item.sourceCurrency === source && item.targetCurrency === target,
    );
    if (!corridor) {
      await this.startQuoteJourney(to, conversation);
      return;
    }
    if (amountMinor < corridor.minSourceAmountMinor) {
      await this.whatsApp.sendText(to, `That's below the minimum for ${source} → ${target}.\n\nMinimum: ${formatCustomerMoneyMinor(corridor.minSourceAmountMinor, source, true)}\n\nEnter another amount.`);
      return;
    }
    if (amountMinor > corridor.maxSourceAmountMinor) {
      await this.whatsApp.sendText(to, `That's above the current limit for ${source} → ${target}.\n\nMaximum: ${formatCustomerMoneyMinor(corridor.maxSourceAmountMinor, source, true)}\n\nEnter a smaller amount.`);
      return;
    }
    try {
      const quote = await this.quotes.createIndicativeQuote({
        sourceCurrency: source,
        targetCurrency: target,
        sourceAmountMinor: amountMinor,
        conversationId: conversation.id,
      });
      await this.conversations.presentQuote(conversation.id, quote.id);
      await this.whatsApp.sendList(to, formatCustomerQuoteMessage(quote), "Choose action", "Rate actions", [
        { id: "CONTINUE_WITH_RATE", title: "Continue with this rate" },
        { id: "NEW_RATE", title: "New rate" },
        { id: "SPEAK_WITH_TEAM", title: "Speak with our team" },
      ]);
    } catch {
      await this.whatsApp.sendInteractive(to, "We can't get a rate for this route right now.\n\nPlease try again shortly.", [
        { id: "TRY_AGAIN", title: "Try again" },
        { id: "SPEAK_WITH_TEAM", title: "Speak with our team" },
      ]);
    }
  }

  private async requestTrade(to: string, conversation: ConversationSession): Promise<void> {
    if (!conversation.latestQuoteId) {
      await this.whatsApp.sendInteractive(to, "That rate has expired.\n\nLet's get you a fresh one.", [{ id: "NEW_RATE", title: "Get a new rate" }]);
      return;
    }
    try {
      const intent = await this.tradeIntents.createFromQuote(conversation.id, conversation.latestQuoteId);
      await this.completeHandoff(to, conversation, intent.id);
    } catch {
      await this.whatsApp.sendInteractive(to, "That rate has expired.\n\nLet's get you a fresh one.", [{ id: "NEW_RATE", title: "Get a new rate" }]);
    }
  }

  private async speakWithTeam(to: string, conversation: ConversationSession): Promise<void> {
    if (!conversation.latestQuoteId) {
      try {
        const handoff = await this.handoffs.requestGeneralHumanHandoff({ conversationId: conversation.id, originatingChannel: "WHATSAPP" });
        await this.whatsApp.sendText(to, "Sure — someone from Barrel will join the conversation shortly.");
        await this.adminNotifications.dispatchTradeIntentNotifications(handoff.handoffId);
      } catch {
        // The persisted request/outbox remains recoverable when delivery fails.
      }
      return;
    }
    try {
      const intent = await this.tradeIntents.createFromQuote(conversation.id, conversation.latestQuoteId);
      await this.completeHandoff(to, conversation, intent.id, true);
    } catch {
      await this.whatsApp.sendText(to, "Sure — someone from Barrel will join the conversation shortly.");
    }
  }

  private async completeHandoff(
    to: string,
    conversation: ConversationSession,
    tradeIntentId: string,
    supportOnly = false,
  ): Promise<void> {
    try {
      await this.handoffs.requestHumanHandoff({
        tradeIntentId,
        originatingChannel: "WHATSAPP",
      });
    } catch {
      await this.whatsApp.sendText(to, "We couldn’t submit that trade request. Send RATE to get a fresh quote.");
      await this.startQuoteJourney(to, conversation);
      return;
    }
    if (supportOnly) await this.whatsApp.sendText(to, "Sure — someone from Barrel will join the conversation shortly.");
    else await this.sendCompletion(to);
    try {
      await this.adminNotifications.dispatchTradeIntentNotifications(tradeIntentId);
    } catch {
      // The durable outbox remains recoverable. Do not send contradictory customer copy.
    }
  }

  private sendCompletion(to: string): Promise<{ messageId: string }> {
    return this.whatsApp.sendText(
      to,
      "Got it ✓\n\nWe've shared this rate with the Barrel team.\n\nSomeone will message you here shortly to confirm the live rate and next steps.",
    );
  }

  private async sendCurrencySelector(to: string, body: string, currencies: string[]): Promise<void> {
    if (currencies.length <= 3) {
      await this.whatsApp.sendInteractive(to, body, currencies.map((currency) => ({ id: currency, title: currency })));
      return;
    }
    await this.whatsApp.sendList(
      to,
      body,
      "Choose currency",
      "Available currencies",
      currencies.map((currency) => ({ id: currency, title: currencyOptionLabel(currency) })),
    );
  }

  private async moveToAmount(
    to: string,
    conversationId: string,
    sourceCurrency: string,
    targetCurrency: string,
    directions: CorridorDirection[],
  ): Promise<void> {
    const corridor = directions.find((item) => item.sourceCurrency === sourceCurrency && item.targetCurrency === targetCurrency);
    if (!corridor) throw new Error("enabled corridor disappeared during selection");
    await this.conversations.setJourney(conversationId, {
      state: "AWAITING_AMOUNT",
      sourceCurrency,
      targetCurrency,
    });
    await this.whatsApp.sendText(to, formatAmountPrompt(corridor));
  }
}
