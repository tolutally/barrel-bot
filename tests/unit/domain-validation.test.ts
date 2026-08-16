import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  assertQuoteIsFresh,
  createBusinessContactSchema,
  createComplianceCaseSchema,
  createCustomerChannelSchema,
  createCustomerSchema,
  createCustomerWithProfileSchema,
  createQuoteRecordSchema,
  createTradeInstructionSchema,
  createTradeIntentSchema,
  DomainRuleError,
  recordComplianceDecisionSchema,
  validatePaymentPurpose,
} from "@barrel/domain";

function modelField(modelName: string, fieldName: string) {
  const model = Prisma.dmmf.datamodel.models.find((candidate) => candidate.name === modelName);
  const field = model?.fields.find((candidate) => candidate.name === fieldName);
  if (!field) throw new Error(`missing ${modelName}.${fieldName}`);
  return field;
}

describe("customer and profile validation", () => {
  it.each(["BUSINESS", "INDIVIDUAL"] as const)("supports %s customers", (customerType) => {
    expect(createCustomerSchema.parse({ customerType })).toEqual({ customerType });
  });

  it("accepts a BUSINESS customer with a BusinessProfile", () => {
    const result = createCustomerWithProfileSchema.parse({
      customerType: "BUSINESS",
      profile: {
        legalName: "Barrel Test Inc.",
        entityType: "CORPORATION",
        jurisdiction: "ca",
        country: "ca",
      },
    });
    expect(result.profile.country).toBe("CA");
  });

  it("accepts an INDIVIDUAL customer with an IndividualProfile", () => {
    const result = createCustomerWithProfileSchema.parse({
      customerType: "INDIVIDUAL",
      profile: { firstName: "Ada", lastName: "Okafor", country: "ng" },
    });
    expect(result.profile.country).toBe("NG");
  });

  it("keeps business contacts attached to a BusinessProfile", () => {
    const contact = createBusinessContactSchema.parse({
      businessProfileId: "profile-1",
      firstName: "Ada",
      lastName: "Okafor",
      email: "ada@example.com",
    });
    expect(contact.businessProfileId).toBe("profile-1");
  });

  it("allows a channel identity before it is matched to a Customer", () => {
    expect(modelField("CustomerChannel", "customerId").isRequired).toBe(false);
    const channel = createCustomerChannelSchema.parse({
      channelType: "WHATSAPP",
      externalIdentifier: "whatsapp-user-1",
    });
    expect(channel.customerId).toBeUndefined();
  });
});

describe("quote, intent, and trade identity rules", () => {
  it("allows a Quote without a Customer", () => {
    expect(modelField("Quote", "customerId").isRequired).toBe(false);
    expect(
      createQuoteRecordSchema.parse({
        sourceCurrency: "NGN",
        targetCurrency: "CAD",
        sourceAmountMinor: 200_000_000n,
        targetAmountMinor: 190_476n,
        providerExpiresAt: new Date(Date.now() + 30_000),
        customerQuoteExpiresAt: new Date(Date.now() + 900_000),
      }).customerId,
    ).toBeUndefined();
  });

  it("allows a TradeIntent before Customer and customer type are known", () => {
    expect(modelField("TradeIntent", "customerId").isRequired).toBe(false);
    expect(modelField("TradeIntent", "customerType").isRequired).toBe(false);
    const intent = createTradeIntentSchema.parse({
      quoteId: "quote-1",
      sourceCurrency: "ngn",
      targetCurrency: "cad",
      sourceAmountMinor: 500_000_000n,
      indicativeTargetAmountMinor: 476_190n,
      originatingChannel: "WHATSAPP",
    });
    expect(intent.customerId).toBeUndefined();
    expect(intent.customerType).toBeUndefined();
  });

  it("requires an identified Customer for a Trade", () => {
    expect(modelField("Trade", "customerId").isRequired).toBe(true);
    expect(() => createTradeInstructionSchema.parse({ quoteId: "quote-1" })).toThrow();
  });

  it("retains an expired Quote historically but rejects it as current pricing", () => {
    expect(() =>
      assertQuoteIsFresh({
        status: "INDICATIVE",
        customerQuoteExpiresAt: new Date("2026-01-01T00:00:00Z"),
        now: new Date("2026-01-01T00:00:01Z"),
      }),
    ).toThrowError(new DomainRuleError("QUOTE_EXPIRED"));
  });

  it("requires a short description only when payment purpose is OTHER", () => {
    expect(validatePaymentPurpose({ purpose: "SUPPLIER_VENDOR" })).toEqual({
      purpose: "SUPPLIER_VENDOR",
      detail: null,
    });
    expect(() => validatePaymentPurpose({ purpose: "OTHER" })).toThrowError(
      new DomainRuleError("PURPOSE_DETAIL_REQUIRED"),
    );
    expect(validatePaymentPurpose({ purpose: "OTHER", detail: "Family support" })).toEqual({
      purpose: "OTHER",
      detail: "Family support",
    });
  });
});

describe("customer-neutral compliance", () => {
  it("allows BUSINESS_KYB only for a BUSINESS customer", () => {
    expect(
      createComplianceCaseSchema.parse({
        customerId: "customer-1",
        customerType: "BUSINESS",
        caseType: "BUSINESS_KYB",
      }).caseType,
    ).toBe("BUSINESS_KYB");
    expect(() =>
      createComplianceCaseSchema.parse({
        customerId: "customer-1",
        customerType: "INDIVIDUAL",
        caseType: "BUSINESS_KYB",
      }),
    ).toThrow("BUSINESS_KYB requires a BUSINESS customer");
  });

  it("allows INDIVIDUAL_KYC only for an INDIVIDUAL customer", () => {
    expect(
      createComplianceCaseSchema.parse({
        customerId: "customer-2",
        customerType: "INDIVIDUAL",
        caseType: "INDIVIDUAL_KYC",
      }).caseType,
    ).toBe("INDIVIDUAL_KYC");
  });

  it("supports multiple historical ComplianceCases for one Customer", () => {
    expect(modelField("Customer", "complianceCases").isList).toBe(true);
    const initial = createComplianceCaseSchema.parse({
      customerId: "customer-1",
      customerType: "BUSINESS",
      caseType: "BUSINESS_KYB",
    });
    const review = createComplianceCaseSchema.parse({
      customerId: "customer-1",
      customerType: "BUSINESS",
      caseType: "PERIODIC_REVIEW",
    });
    expect(initial.customerId).toBe(review.customerId);
  });

  it("requires a reason for an immutable compliance decision", () => {
    expect(() =>
      recordComplianceDecisionSchema.parse({
        complianceCaseId: "case-1",
        reviewerIdentity: "reviewer@example.com",
        decision: "APPROVE",
        reason: "",
      }),
    ).toThrow();
  });
});
