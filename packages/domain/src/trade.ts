import { z } from "zod";
import { currencyCodeSchema, nonEmptyTextSchema, positiveMinorAmountSchema } from "@barrel/shared";
import { customerTypeSchema } from "./customer";

export const originatingChannelSchema = z.enum(["WHATSAPP", "EMAIL", "WEB"]);
export const paymentPurposeSchema = z.enum([
  "SUPPLIER_VENDOR",
  "GOODS_INVENTORY",
  "SERVICES_CONTRACTOR",
  "INVESTMENT",
  "PERSONAL_TRANSFER",
  "OTHER",
]);

export const createQuoteRecordSchema = z.object({
  customerId: nonEmptyTextSchema.optional(),
  conversationId: nonEmptyTextSchema.optional(),
  sourceCurrency: currencyCodeSchema,
  targetCurrency: currencyCodeSchema,
  sourceAmountMinor: positiveMinorAmountSchema,
  targetAmountMinor: positiveMinorAmountSchema,
  providerExpiresAt: z.coerce.date(),
  customerQuoteExpiresAt: z.coerce.date(),
});

export const createTradeIntentSchema = z.object({
  quoteId: nonEmptyTextSchema,
  customerId: nonEmptyTextSchema.optional(),
  customerType: customerTypeSchema.optional(),
  conversationId: nonEmptyTextSchema.optional(),
  sourceCurrency: currencyCodeSchema,
  targetCurrency: currencyCodeSchema,
  sourceAmountMinor: positiveMinorAmountSchema,
  indicativeTargetAmountMinor: positiveMinorAmountSchema,
  originatingChannel: originatingChannelSchema,
});

export const createTradeInstructionSchema = z.object({
  customerId: nonEmptyTextSchema,
  quoteId: nonEmptyTextSchema,
  tradeIntentId: nonEmptyTextSchema.optional(),
  submittedByRepresentativeId: nonEmptyTextSchema.optional(),
  purpose: nonEmptyTextSchema.optional(),
  sourceOfFunds: nonEmptyTextSchema.optional(),
  customerReference: z.string().trim().max(100).optional(),
});

export class DomainRuleError extends Error {
  constructor(public readonly code: "QUOTE_EXPIRED" | "QUOTE_NOT_INDICATIVE" | "PURPOSE_DETAIL_REQUIRED") {
    super(
      code === "QUOTE_EXPIRED"
        ? "quote has expired"
        : code === "PURPOSE_DETAIL_REQUIRED"
          ? "purpose detail is required for OTHER"
          : "quote is not executable",
    );
    this.name = "DomainRuleError";
  }
}

export function assertQuoteIsFresh(input: {
  status: "INDICATIVE" | "EXPIRED" | "TRADE_INTENT_CREATED" | "CANCELLED";
  customerQuoteExpiresAt: Date;
  now?: Date;
}): void {
  if (input.status !== "INDICATIVE") throw new DomainRuleError("QUOTE_NOT_INDICATIVE");
  if (input.customerQuoteExpiresAt.getTime() <= (input.now ?? new Date()).getTime()) {
    throw new DomainRuleError("QUOTE_EXPIRED");
  }
}

export function assertCustomerRequestWindowOpen(input: {
  status: "INDICATIVE" | "EXPIRED" | "TRADE_INTENT_CREATED" | "CANCELLED";
  customerQuoteExpiresAt: Date;
  now?: Date;
}): void {
  if (input.status !== "INDICATIVE" && input.status !== "TRADE_INTENT_CREATED") {
    throw new DomainRuleError("QUOTE_NOT_INDICATIVE");
  }
  if (input.customerQuoteExpiresAt.getTime() <= (input.now ?? new Date()).getTime()) {
    throw new DomainRuleError("QUOTE_EXPIRED");
  }
}

export function validatePaymentPurpose(input: {
  purpose: unknown;
  detail?: string | null;
}): { purpose: z.infer<typeof paymentPurposeSchema>; detail: string | null } {
  const purpose = paymentPurposeSchema.parse(input.purpose);
  const detail = input.detail?.trim() || null;
  if (purpose === "OTHER" && !detail) throw new DomainRuleError("PURPOSE_DETAIL_REQUIRED");
  if (detail && detail.length > 200) throw new Error("purpose detail must be 200 characters or fewer");
  return { purpose, detail: purpose === "OTHER" ? detail : null };
}

export type CreateQuoteRecordInput = z.infer<typeof createQuoteRecordSchema>;
export type CreateTradeIntentInput = z.infer<typeof createTradeIntentSchema>;
export type CreateTradeInstructionInput = z.infer<typeof createTradeInstructionSchema>;
