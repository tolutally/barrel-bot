import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Prisma, type ChannelType, type PaymentPurpose, type PrismaClient } from "@prisma/client";
import { assertQuoteIsFresh, paymentPurposeSchema, validatePaymentPurpose } from "@barrel/domain";

export type TradeIntentRecord = {
  id: string;
  tradeIntentReference: string;
  publicReference: string;
  quoteId: string;
  customerId: string | null;
  customerType: "BUSINESS" | "INDIVIDUAL" | null;
  sourceCurrency: string;
  targetCurrency: string;
  sourceAmountMinor: bigint;
  indicativeTargetAmountMinor: bigint;
  purposeOfPayment: PaymentPurpose | null;
  purposeOfPaymentDetail: string | null;
  contactWhatsAppNumber: string | null;
  contactName: string | null;
  status: string;
  originatingChannel: "WHATSAPP" | "EMAIL" | "WEB";
};

export interface TradeIntentApplicationService {
  createFromQuote(conversationId: string, quoteId: string, originatingChannel?: ChannelType): Promise<TradeIntentRecord>;
  setPaymentPurpose(
    conversationId: string,
    tradeIntentId: string,
    purpose: PaymentPurpose,
    detail?: string,
  ): Promise<TradeIntentRecord>;
  createWebsiteRequest(input: {
    quoteId: string;
    purposeOfPayment: PaymentPurpose;
    purposeOfPaymentDetail?: string;
    whatsappNumber: string;
    contactName?: string;
    idempotencyKey: string;
  }): Promise<TradeIntentRecord>;
}

export class PrismaTradeIntentService implements TradeIntentApplicationService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly now: () => Date = () => new Date(),
    private readonly publicReferenceFactory: () => string = generateTradePublicReference,
  ) {}

  async createFromQuote(
    conversationId: string,
    quoteId: string,
    originatingChannel: ChannelType = "WHATSAPP",
  ): Promise<TradeIntentRecord> {
    return this.withPublicReferenceRetry((publicReference) => this.prisma.$transaction(async (tx) => {
      const existing = await tx.tradeIntent.findFirst({ where: { conversationId, quoteId } });
      if (existing) return existing as TradeIntentRecord;
      const quote = await tx.quote.findFirstOrThrow({ where: { id: quoteId, conversationId } });
      assertQuoteIsFresh({
        status: quote.status,
        customerQuoteExpiresAt: quote.customerQuoteExpiresAt,
        now: this.now(),
      });
      const intent = await tx.tradeIntent.create({
        data: {
          tradeIntentReference: `BARREL-TI-${randomUUID()}`,
          publicReference,
          quoteId: quote.id,
          customerId: null,
          customerType: null,
          conversationId,
          sourceCurrency: quote.sourceCurrency,
          targetCurrency: quote.targetCurrency,
          sourceAmountMinor: quote.sourceAmountMinor,
          indicativeTargetAmountMinor: quote.targetAmountMinor,
          originatingChannel,
          status: "PAYMENT_PURPOSE_REQUIRED",
        },
      });
      await tx.quote.update({ where: { id: quote.id }, data: { status: "TRADE_INTENT_CREATED" } });
      await tx.conversation.update({
        where: { id: conversationId },
        data: { state: "AWAITING_PAYMENT_PURPOSE", latestTradeIntentId: intent.id },
      });
      return intent as TradeIntentRecord;
    }));
  }

  async setPaymentPurpose(
    conversationId: string,
    tradeIntentId: string,
    rawPurpose: PaymentPurpose,
    detail?: string,
  ): Promise<TradeIntentRecord> {
    const purpose = paymentPurposeSchema.parse(rawPurpose);
    if (purpose === "OTHER" && !detail?.trim()) {
      return this.prisma.$transaction(async (tx) => {
        const intent = await tx.tradeIntent.update({
          where: { id: tradeIntentId, conversationId },
          data: { purposeOfPayment: purpose, purposeOfPaymentDetail: null },
        });
        await tx.conversation.update({
          where: { id: conversationId },
          data: { state: "AWAITING_PAYMENT_PURPOSE_DETAIL" },
        });
        return intent as TradeIntentRecord;
      });
    }
    const validated = validatePaymentPurpose({ purpose, detail });
    return this.prisma.$transaction(async (tx) => {
      const intent = await tx.tradeIntent.update({
        where: { id: tradeIntentId, conversationId },
        data: {
          purposeOfPayment: validated.purpose,
          purposeOfPaymentDetail: validated.detail,
          status: "READY_FOR_HANDOFF",
        },
      });
      await tx.conversation.update({
        where: { id: conversationId },
        data: { state: "TRADE_REQUEST_READY" },
      });
      return intent as TradeIntentRecord;
    });
  }

  async createWebsiteRequest(input: {
    quoteId: string;
    purposeOfPayment: PaymentPurpose;
    purposeOfPaymentDetail?: string;
    whatsappNumber: string;
    contactName?: string;
    idempotencyKey: string;
  }): Promise<TradeIntentRecord> {
    const purpose = validatePaymentPurpose({
      purpose: input.purposeOfPayment,
      detail: input.purposeOfPaymentDetail,
    });
    const requestHash = createHash("sha256").update(JSON.stringify({
      quoteId: input.quoteId,
      purpose: purpose.purpose,
      detail: purpose.detail,
      whatsappNumber: input.whatsappNumber,
      contactName: input.contactName?.trim() || null,
    })).digest("hex");
    return this.withPublicReferenceRetry((publicReference) => this.prisma.$transaction(async (tx) => {
      const byKey = await tx.tradeIntent.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (byKey) {
        if (byKey.idempotencyRequestHash !== requestHash) throw new Error("IDEMPOTENCY_KEY_CONFLICT");
        return byKey as TradeIntentRecord;
      }
      const quote = await tx.quote.findUniqueOrThrow({ where: { id: input.quoteId } });
      assertQuoteIsFresh({
        status: quote.status,
        customerQuoteExpiresAt: quote.customerQuoteExpiresAt,
        now: this.now(),
      });
      const existing = await tx.tradeIntent.findFirst({
        where: { quoteId: quote.id, originatingChannel: "WEB" },
      });
      if (existing) throw new Error("TRADE_REQUEST_ALREADY_SUBMITTED");
      const intent = await tx.tradeIntent.create({
        data: {
          tradeIntentReference: `BARREL-TI-${randomUUID()}`,
          publicReference,
          quoteId: quote.id,
          customerId: null,
          customerType: null,
          sourceCurrency: quote.sourceCurrency,
          targetCurrency: quote.targetCurrency,
          sourceAmountMinor: quote.sourceAmountMinor,
          indicativeTargetAmountMinor: quote.targetAmountMinor,
          originatingChannel: "WEB",
          status: "READY_FOR_HANDOFF",
          purposeOfPayment: purpose.purpose,
          purposeOfPaymentDetail: purpose.detail,
          contactWhatsAppNumber: input.whatsappNumber,
          contactName: input.contactName?.trim() || null,
          idempotencyKey: input.idempotencyKey,
          idempotencyRequestHash: requestHash,
        },
      });
      await tx.quote.update({ where: { id: quote.id }, data: { status: "TRADE_INTENT_CREATED" } });
      return intent as TradeIntentRecord;
    }));
  }

  private async withPublicReferenceRetry<T>(operation: (publicReference: string) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        return await operation(this.publicReferenceFactory());
      } catch (error) {
        const target = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
          ? error.meta?.target
          : undefined;
        const fields = Array.isArray(target) ? target.map(String) : [String(target ?? "")];
        if (!fields.some((field) => field.includes("publicReference")) || attempt === 4) throw error;
      }
    }
    throw new Error("unable to generate a unique public trade reference");
  }
}

const PUBLIC_REFERENCE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function generateTradePublicReference(): string {
  const bytes = randomBytes(8);
  let value = "";
  for (let index = 0; index < 8; index += 1) {
    value += PUBLIC_REFERENCE_ALPHABET[bytes[index]! % PUBLIC_REFERENCE_ALPHABET.length];
  }
  return `BRL-${value}`;
}
