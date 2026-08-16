export type PricingErrorCode =
  | "INVALID_SOURCE_AMOUNT"
  | "INVALID_PROVIDER_RATE"
  | "INVALID_SPREAD"
  | "INVALID_FEE"
  | "INVALID_PRECISION"
  | "UNSAFE_CUSTOMER_RATE"
  | "NEGATIVE_MARGIN";

export class PricingError extends Error {
  constructor(
    public readonly code: PricingErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PricingError";
  }
}
