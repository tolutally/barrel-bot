import { z } from "zod";
import { nonEmptyTextSchema } from "@barrel/shared";

export const customerTypeSchema = z.enum(["BUSINESS", "INDIVIDUAL"]);

export const customerStatusSchema = z.enum([
  "PROSPECT",
  "ONBOARDING",
  "ACTIVE",
  "SUSPENDED",
  "CLOSED",
  "REJECTED",
]);

export const complianceStatusSchema = z.enum([
  "NOT_STARTED",
  "INVITED",
  "IN_PROGRESS",
  "SUBMITTED",
  "UNDER_REVIEW",
  "NEEDS_INFORMATION",
  "APPROVED",
  "REVIEW_DUE",
  "REJECTED",
]);

export const createCustomerSchema = z.object({
  customerType: customerTypeSchema,
});

const profileBaseSchema = z.object({ customerId: nonEmptyTextSchema });

export const createBusinessProfileSchema = profileBaseSchema.extend({
  legalName: nonEmptyTextSchema,
  tradingName: nonEmptyTextSchema.optional(),
  entityType: nonEmptyTextSchema,
  registrationNumber: nonEmptyTextSchema.optional(),
  jurisdiction: z.string().trim().length(2).toUpperCase(),
  country: z.string().trim().length(2).toUpperCase(),
  website: z.string().url().optional(),
  natureOfBusiness: nonEmptyTextSchema.optional(),
});

export const createIndividualProfileSchema = profileBaseSchema.extend({
  firstName: nonEmptyTextSchema,
  lastName: nonEmptyTextSchema,
  dateOfBirth: z.coerce.date().optional(),
  phone: nonEmptyTextSchema.optional(),
  email: z.string().trim().email().optional(),
  occupation: nonEmptyTextSchema.optional(),
  country: z.string().trim().length(2).toUpperCase(),
  residencyCountry: z.string().trim().length(2).toUpperCase().optional(),
});

export const createCustomerWithProfileSchema = z.discriminatedUnion("customerType", [
  z.object({
    customerType: z.literal("BUSINESS"),
    profile: createBusinessProfileSchema.omit({ customerId: true }),
  }),
  z.object({
    customerType: z.literal("INDIVIDUAL"),
    profile: createIndividualProfileSchema.omit({ customerId: true }),
  }),
]);

export const createBusinessContactSchema = z
  .object({
    businessProfileId: nonEmptyTextSchema,
    firstName: nonEmptyTextSchema,
    lastName: nonEmptyTextSchema,
    email: z.string().trim().email().optional(),
    phone: nonEmptyTextSchema.optional(),
    jobTitle: nonEmptyTextSchema.optional(),
    isPrimary: z.boolean().default(false),
  })
  .refine((contact) => contact.email !== undefined || contact.phone !== undefined, {
    message: "a business contact requires an email or phone number",
  });

export const createCustomerChannelSchema = z.object({
  customerId: nonEmptyTextSchema.optional(),
  channelType: z.enum(["WHATSAPP", "EMAIL", "WEB"]),
  externalIdentifier: nonEmptyTextSchema,
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type CreateBusinessProfileInput = z.infer<typeof createBusinessProfileSchema>;
export type CreateIndividualProfileInput = z.infer<typeof createIndividualProfileSchema>;
export type CreateCustomerWithProfileInput = z.infer<typeof createCustomerWithProfileSchema>;
export type CreateBusinessContactInput = z.infer<typeof createBusinessContactSchema>;
export type CreateCustomerChannelInput = z.infer<typeof createCustomerChannelSchema>;
