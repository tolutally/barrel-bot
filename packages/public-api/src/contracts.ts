import { z } from "zod";

const currencySchema = z.string().trim().toUpperCase().regex(/^[A-Z]{3,5}$/);
const amountSchema = z.string().trim().regex(/^\d+(?:\.\d+)?$/).max(40);
export const publicQuoteRequestSchema = z.object({
  sourceCurrency: currencySchema,
  targetCurrency: currencySchema,
  sourceAmount: amountSchema,
}).superRefine((value, context) => {
  if (value.sourceCurrency === value.targetCurrency) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "source and target currencies must differ" });
  }
});

export const publicTradeRequestSchema = z.object({
  quoteId: z.string().trim().min(1).max(100),
  purposeOfPayment: z.enum([
    "SUPPLIER_VENDOR", "GOODS_INVENTORY", "SERVICES_CONTRACTOR",
    "INVESTMENT", "PERSONAL_TRANSFER", "OTHER",
  ]),
  purposeOfPaymentDetail: z.string().trim().min(1).max(200).optional(),
  whatsappNumber: z.string().trim().min(8).max(40),
  contactName: z.string().trim().min(1).max(100).optional(),
}).superRefine((value, context) => {
  if (value.purposeOfPayment === "OTHER" && !value.purposeOfPaymentDetail) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["purposeOfPaymentDetail"], message: "detail is required for OTHER" });
  }
});

export function normalizePublicWhatsAppNumber(value: string): string {
  const normalized = value.trim().replace(/[\s()-]/g, "");
  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) throw new PublicApiError("INVALID_CONTACT", "Enter a valid international WhatsApp number.", 400);
  return normalized;
}

export type PublicCorridorDTO = {
  sourceCurrency: string;
  targetCurrency: string;
  sourceLabel: string;
  targetLabel: string;
  minSourceAmount: string;
  maxSourceAmount: string;
};

export type PublicQuoteDTO = {
  id: string;
  reference: string;
  sourceCurrency: string;
  targetCurrency: string;
  sourceAmount: string;
  targetAmount: string;
  customerRate: string;
  requestExpiresAt: string;
  indicative: true;
  disclaimer: string;
};

export type PublicTradeRequestDTO = {
  reference: string;
  status: "RECEIVED";
  message: string;
};

export type PublicApiErrorCode =
  | "INVALID_REQUEST" | "UNSUPPORTED_CORRIDOR" | "CORRIDOR_UNAVAILABLE"
  | "AMOUNT_BELOW_MINIMUM" | "AMOUNT_ABOVE_MAXIMUM" | "RATE_UNAVAILABLE"
  | "QUOTE_NOT_FOUND" | "QUOTE_EXPIRED" | "INVALID_PURPOSE" | "INVALID_CONTACT"
  | "TRADE_REQUEST_ALREADY_SUBMITTED" | "RATE_LIMITED" | "INTERNAL_ERROR";

export class PublicApiError extends Error {
  constructor(public readonly code: PublicApiErrorCode, message: string, public readonly status: number) {
    super(message);
    this.name = "PublicApiError";
  }
}
