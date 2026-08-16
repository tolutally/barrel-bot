import { z } from "zod";
import { nonEmptyTextSchema } from "@barrel/shared";
import { customerTypeSchema } from "./customer";

export const complianceCaseTypeSchema = z.enum([
  "INDIVIDUAL_KYC",
  "BUSINESS_KYB",
  "PERIODIC_REVIEW",
  "REMEDIATION",
]);

export const riskLevelSchema = z.enum(["UNASSESSED", "LOW", "MEDIUM", "HIGH"]);

export const createComplianceCaseSchema = z
  .object({
    customerId: nonEmptyTextSchema,
    customerType: customerTypeSchema,
    caseType: complianceCaseTypeSchema,
  })
  .superRefine((input, context) => {
    if (input.caseType === "BUSINESS_KYB" && input.customerType !== "BUSINESS") {
      context.addIssue({ code: "custom", message: "BUSINESS_KYB requires a BUSINESS customer", path: ["caseType"] });
    }
    if (input.caseType === "INDIVIDUAL_KYC" && input.customerType !== "INDIVIDUAL") {
      context.addIssue({ code: "custom", message: "INDIVIDUAL_KYC requires an INDIVIDUAL customer", path: ["caseType"] });
    }
  });

export const recordComplianceDecisionSchema = z.object({
  complianceCaseId: nonEmptyTextSchema,
  reviewerIdentity: nonEmptyTextSchema,
  decision: z.enum(["APPROVE", "REJECT", "REQUEST_INFORMATION", "ESCALATE"]),
  reason: nonEmptyTextSchema,
  notes: z.string().trim().max(5000).optional(),
});

export type CreateComplianceCaseInput = z.infer<typeof createComplianceCaseSchema>;
export type RecordComplianceDecisionInput = z.infer<typeof recordComplianceDecisionSchema>;
