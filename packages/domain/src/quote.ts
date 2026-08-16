import { z } from "zod";
import { currencyCodeSchema, nonEmptyTextSchema } from "@barrel/shared";

export const customerQuoteSchema = z.object({
  id: nonEmptyTextSchema,
  quoteReference: nonEmptyTextSchema,
  sourceCurrency: currencyCodeSchema,
  targetCurrency: currencyCodeSchema,
  sourceAmount: nonEmptyTextSchema,
  targetAmount: nonEmptyTextSchema,
  customerRate: nonEmptyTextSchema,
  customerQuoteExpiresAt: z.string().datetime(),
  disclaimer: nonEmptyTextSchema,
});

export type CustomerQuote = z.infer<typeof customerQuoteSchema>;

export type CustomerQuoteDisplay = {
  sendLabel: "You send";
  sendAmount: string;
  receiveLabel: "You receive";
  receiveAmount: string;
  rateLabel: "Indicative rate";
  customerRate: string;
};

export function toCustomerQuoteDisplay(quote: CustomerQuote): CustomerQuoteDisplay {
  return {
    sendLabel: "You send",
    sendAmount: `${quote.sourceAmount} ${quote.sourceCurrency}`,
    receiveLabel: "You receive",
    receiveAmount: `${quote.targetAmount} ${quote.targetCurrency}`,
    rateLabel: "Indicative rate",
    customerRate: `${quote.customerRate} ${quote.sourceCurrency} per ${quote.targetCurrency}`,
  };
}
