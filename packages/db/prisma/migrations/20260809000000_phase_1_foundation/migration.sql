-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "CustomerType" AS ENUM ('BUSINESS', 'INDIVIDUAL');

-- CreateEnum
CREATE TYPE "CustomerStatus" AS ENUM ('PROSPECT', 'ONBOARDING', 'ACTIVE', 'SUSPENDED', 'CLOSED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ComplianceStatus" AS ENUM ('NOT_STARTED', 'INVITED', 'IN_PROGRESS', 'SUBMITTED', 'UNDER_REVIEW', 'NEEDS_INFORMATION', 'APPROVED', 'REVIEW_DUE', 'REJECTED');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('UNASSESSED', 'LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "RepresentativeStatus" AS ENUM ('PENDING', 'ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "ChannelType" AS ENUM ('WHATSAPP', 'EMAIL', 'WEB');

-- CreateEnum
CREATE TYPE "ConversationState" AS ENUM ('IDLE', 'AWAITING_AMOUNT', 'QUOTE_PRESENTED', 'IDENTIFYING_CUSTOMER', 'ONBOARDING_REQUIRED', 'TRADE_READY', 'OPTED_OUT');

-- CreateEnum
CREATE TYPE "SpreadMode" AS ENUM ('FIXED', 'PERCENTAGE', 'HYBRID');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('INDICATIVE', 'EXPIRED', 'TRADE_INTENT_CREATED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TradeIntentStatus" AS ENUM ('CREATED', 'CUSTOMER_TYPE_REQUIRED', 'CUSTOMER_IDENTIFICATION_REQUIRED', 'ONBOARDING_REQUIRED', 'AWAITING_COMPLIANCE', 'READY_FOR_FRESH_QUOTE', 'CONVERTED_TO_TRADE', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "TradeStatus" AS ENUM ('DRAFT', 'AWAITING_COMPLIANCE', 'READY_TO_SUBMIT', 'SUBMITTED', 'OPS_REVIEW', 'ACCEPTED', 'COMPLETED', 'CANCELLED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ComplianceCaseType" AS ENUM ('INDIVIDUAL_KYC', 'BUSINESS_KYB', 'PERIODIC_REVIEW', 'REMEDIATION');

-- CreateEnum
CREATE TYPE "ComplianceCaseStatus" AS ENUM ('INVITED', 'IN_PROGRESS', 'SUBMITTED', 'UNDER_REVIEW', 'NEEDS_INFORMATION', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ComplianceDocumentStatus" AS ENUM ('UPLOADED', 'UNDER_REVIEW', 'ACCEPTED', 'REJECTED', 'SUPERSEDED', 'DELETED');

-- CreateEnum
CREATE TYPE "ComplianceDecision" AS ENUM ('APPROVE', 'REJECT', 'REQUEST_INFORMATION', 'ESCALATE');

-- CreateEnum
CREATE TYPE "AuditActorType" AS ENUM ('SYSTEM', 'CUSTOMER', 'STAFF', 'SERVICE');

-- CreateEnum
CREATE TYPE "AuditSource" AS ENUM ('SYSTEM', 'API', 'WHATSAPP', 'WEB', 'APPSMITH', 'CUSTOM_ADMIN');

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "customerNumber" TEXT NOT NULL,
    "customerType" "CustomerType" NOT NULL,
    "customerStatus" "CustomerStatus" NOT NULL DEFAULT 'PROSPECT',
    "complianceStatus" "ComplianceStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "riskLevel" "RiskLevel" NOT NULL DEFAULT 'UNASSESSED',
    "approvedAt" TIMESTAMP(3),
    "nextReviewAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndividualProfile" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "dateOfBirth" DATE,
    "phone" TEXT,
    "email" TEXT,
    "residentialAddress" JSONB,
    "occupation" TEXT,
    "country" TEXT NOT NULL,
    "residencyCountry" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IndividualProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessProfile" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "tradingName" TEXT,
    "entityType" TEXT NOT NULL,
    "registrationNumber" TEXT,
    "jurisdiction" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "registeredAddress" JSONB,
    "operatingAddress" JSONB,
    "website" TEXT,
    "natureOfBusiness" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessContact" (
    "id" TEXT NOT NULL,
    "businessProfileId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "jobTitle" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "emailVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthorizedRepresentative" (
    "id" TEXT NOT NULL,
    "businessProfileId" TEXT NOT NULL,
    "businessContactId" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "jobTitle" TEXT,
    "canRequestQuotes" BOOLEAN NOT NULL DEFAULT false,
    "canSubmitTrades" BOOLEAN NOT NULL DEFAULT false,
    "canConfirmTrades" BOOLEAN NOT NULL DEFAULT false,
    "status" "RepresentativeStatus" NOT NULL DEFAULT 'PENDING',
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthorizedRepresentative_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerChannel" (
    "id" TEXT NOT NULL,
    "customerId" TEXT,
    "businessContactId" TEXT,
    "authorizedRepresentativeId" TEXT,
    "channelType" "ChannelType" NOT NULL,
    "externalIdentifier" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "customerChannelId" TEXT,
    "customerId" TEXT,
    "state" "ConversationState" NOT NULL DEFAULT 'IDLE',
    "latestQuoteId" TEXT,
    "latestTradeIntentId" TEXT,
    "optedOutAt" TIMESTAMP(3),
    "lastInboundAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CorridorConfig" (
    "id" TEXT NOT NULL,
    "sourceCurrency" TEXT NOT NULL,
    "targetCurrency" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "spreadMode" "SpreadMode" NOT NULL DEFAULT 'FIXED',
    "fixedSpread" DECIMAL(24,8) NOT NULL,
    "percentageSpread" DECIMAL(12,8) NOT NULL,
    "minSourceAmountMinor" BIGINT NOT NULL,
    "maxSourceAmountMinor" BIGINT NOT NULL,
    "explicitSourceFeeMinor" BIGINT NOT NULL DEFAULT 0,
    "providerFeeEstimateMinor" BIGINT NOT NULL DEFAULT 0,
    "payoutFeeEstimateMinor" BIGINT NOT NULL DEFAULT 0,
    "quoteTtlSeconds" INTEGER NOT NULL DEFAULT 30,
    "targetPrecision" INTEGER NOT NULL DEFAULT 2,
    "customerDisclaimer" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CorridorConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "quoteReference" TEXT NOT NULL,
    "customerId" TEXT,
    "conversationId" TEXT,
    "provider" TEXT NOT NULL,
    "providerQuoteId" TEXT,
    "sourceCurrency" TEXT NOT NULL,
    "targetCurrency" TEXT NOT NULL,
    "sourceAmountMinor" BIGINT NOT NULL,
    "targetAmountMinor" BIGINT NOT NULL,
    "providerRate" DECIMAL(24,10) NOT NULL,
    "customerRate" DECIMAL(24,10) NOT NULL,
    "fixedSpreadSnapshot" DECIMAL(24,10) NOT NULL,
    "percentageSpreadSnapshot" DECIMAL(12,8) NOT NULL,
    "explicitFeeMinor" BIGINT NOT NULL,
    "providerFeeEstimateMinor" BIGINT NOT NULL,
    "payoutFeeEstimateMinor" BIGINT NOT NULL DEFAULT 0,
    "expectedMarginMinor" BIGINT NOT NULL,
    "providerLocked" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "QuoteStatus" NOT NULL DEFAULT 'INDICATIVE',
    "rawProviderResponse" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeIntent" (
    "id" TEXT NOT NULL,
    "tradeIntentReference" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "customerId" TEXT,
    "customerType" "CustomerType",
    "conversationId" TEXT,
    "sourceCurrency" TEXT NOT NULL,
    "targetCurrency" TEXT NOT NULL,
    "sourceAmountMinor" BIGINT NOT NULL,
    "indicativeTargetAmountMinor" BIGINT NOT NULL,
    "originatingChannel" "ChannelType" NOT NULL,
    "status" "TradeIntentStatus" NOT NULL DEFAULT 'CREATED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradeIntent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL,
    "tradeReference" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "submittedByRepresentativeId" TEXT,
    "tradeIntentId" TEXT,
    "quoteId" TEXT NOT NULL,
    "sourceCurrency" TEXT NOT NULL,
    "targetCurrency" TEXT NOT NULL,
    "sourceAmountMinor" BIGINT NOT NULL,
    "targetAmountMinor" BIGINT NOT NULL,
    "providerRateSnapshot" DECIMAL(24,10) NOT NULL,
    "customerRateSnapshot" DECIMAL(24,10) NOT NULL,
    "fixedSpreadSnapshot" DECIMAL(24,10) NOT NULL,
    "percentageSpreadSnapshot" DECIMAL(12,8) NOT NULL,
    "purpose" TEXT,
    "sourceOfFunds" TEXT,
    "customerReference" TEXT,
    "status" "TradeStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceCase" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "caseReference" TEXT NOT NULL,
    "caseType" "ComplianceCaseType" NOT NULL,
    "status" "ComplianceCaseStatus" NOT NULL DEFAULT 'INVITED',
    "riskLevel" "RiskLevel" NOT NULL DEFAULT 'UNASSESSED',
    "submittedAt" TIMESTAMP(3),
    "reviewStartedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "nextReviewAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Director" (
    "id" TEXT NOT NULL,
    "businessProfileId" TEXT NOT NULL,
    "complianceCaseId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "dateOfBirth" DATE,
    "nationality" TEXT,
    "country" TEXT,
    "jobTitle" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Director_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BeneficialOwner" (
    "id" TEXT NOT NULL,
    "businessProfileId" TEXT NOT NULL,
    "complianceCaseId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "ownershipPercentage" DECIMAL(5,2),
    "controlType" TEXT,
    "dateOfBirth" DATE,
    "nationality" TEXT,
    "country" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BeneficialOwner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceDocument" (
    "id" TEXT NOT NULL,
    "complianceCaseId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "storageProvider" TEXT NOT NULL DEFAULT 'SUPABASE',
    "storageKey" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "sha256Hash" TEXT NOT NULL,
    "status" "ComplianceDocumentStatus" NOT NULL DEFAULT 'UPLOADED',
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "retentionUntil" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceReview" (
    "id" TEXT NOT NULL,
    "complianceCaseId" TEXT NOT NULL,
    "reviewerIdentity" TEXT NOT NULL,
    "decision" "ComplianceDecision" NOT NULL,
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplianceReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorType" "AuditActorType" NOT NULL,
    "actorId" TEXT,
    "actorEmail" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "source" "AuditSource" NOT NULL,
    "correlationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Customer_customerNumber_key" ON "Customer"("customerNumber");

-- CreateIndex
CREATE INDEX "Customer_customerType_customerStatus_complianceStatus_idx" ON "Customer"("customerType", "customerStatus", "complianceStatus");

-- CreateIndex
CREATE UNIQUE INDEX "IndividualProfile_customerId_key" ON "IndividualProfile"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessProfile_customerId_key" ON "BusinessProfile"("customerId");

-- CreateIndex
CREATE INDEX "BusinessProfile_registrationNumber_jurisdiction_idx" ON "BusinessProfile"("registrationNumber", "jurisdiction");

-- CreateIndex
CREATE INDEX "BusinessContact_businessProfileId_isPrimary_idx" ON "BusinessContact"("businessProfileId", "isPrimary");

-- CreateIndex
CREATE INDEX "BusinessContact_email_idx" ON "BusinessContact"("email");

-- CreateIndex
CREATE UNIQUE INDEX "AuthorizedRepresentative_businessContactId_key" ON "AuthorizedRepresentative"("businessContactId");

-- CreateIndex
CREATE INDEX "AuthorizedRepresentative_businessProfileId_status_idx" ON "AuthorizedRepresentative"("businessProfileId", "status");

-- CreateIndex
CREATE INDEX "CustomerChannel_customerId_channelType_idx" ON "CustomerChannel"("customerId", "channelType");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerChannel_channelType_externalIdentifier_key" ON "CustomerChannel"("channelType", "externalIdentifier");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_latestQuoteId_key" ON "Conversation"("latestQuoteId");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_latestTradeIntentId_key" ON "Conversation"("latestTradeIntentId");

-- CreateIndex
CREATE INDEX "Conversation_customerChannelId_updatedAt_idx" ON "Conversation"("customerChannelId", "updatedAt");

-- CreateIndex
CREATE INDEX "Conversation_customerId_idx" ON "Conversation"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "CorridorConfig_sourceCurrency_targetCurrency_key" ON "CorridorConfig"("sourceCurrency", "targetCurrency");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_quoteReference_key" ON "Quote"("quoteReference");

-- CreateIndex
CREATE INDEX "Quote_customerId_createdAt_idx" ON "Quote"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "Quote_conversationId_createdAt_idx" ON "Quote"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "Quote_status_expiresAt_idx" ON "Quote"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "TradeIntent_tradeIntentReference_key" ON "TradeIntent"("tradeIntentReference");

-- CreateIndex
CREATE INDEX "TradeIntent_quoteId_idx" ON "TradeIntent"("quoteId");

-- CreateIndex
CREATE INDEX "TradeIntent_customerId_status_idx" ON "TradeIntent"("customerId", "status");

-- CreateIndex
CREATE INDEX "TradeIntent_conversationId_createdAt_idx" ON "TradeIntent"("conversationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Trade_tradeReference_key" ON "Trade"("tradeReference");

-- CreateIndex
CREATE INDEX "Trade_customerId_status_idx" ON "Trade"("customerId", "status");

-- CreateIndex
CREATE INDEX "Trade_tradeIntentId_idx" ON "Trade"("tradeIntentId");

-- CreateIndex
CREATE INDEX "Trade_quoteId_idx" ON "Trade"("quoteId");

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceCase_caseReference_key" ON "ComplianceCase"("caseReference");

-- CreateIndex
CREATE INDEX "ComplianceCase_customerId_createdAt_idx" ON "ComplianceCase"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "ComplianceCase_status_nextReviewAt_idx" ON "ComplianceCase"("status", "nextReviewAt");

-- CreateIndex
CREATE INDEX "Director_businessProfileId_idx" ON "Director"("businessProfileId");

-- CreateIndex
CREATE INDEX "Director_complianceCaseId_idx" ON "Director"("complianceCaseId");

-- CreateIndex
CREATE INDEX "BeneficialOwner_businessProfileId_idx" ON "BeneficialOwner"("businessProfileId");

-- CreateIndex
CREATE INDEX "BeneficialOwner_complianceCaseId_idx" ON "BeneficialOwner"("complianceCaseId");

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceDocument_storageKey_key" ON "ComplianceDocument"("storageKey");

-- CreateIndex
CREATE INDEX "ComplianceDocument_complianceCaseId_status_idx" ON "ComplianceDocument"("complianceCaseId", "status");

-- CreateIndex
CREATE INDEX "ComplianceDocument_customerId_createdAt_idx" ON "ComplianceDocument"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "ComplianceDocument_sha256Hash_idx" ON "ComplianceDocument"("sha256Hash");

-- CreateIndex
CREATE INDEX "ComplianceReview_complianceCaseId_createdAt_idx" ON "ComplianceReview"("complianceCaseId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_provider_externalId_key" ON "WebhookEvent"("provider", "externalId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_createdAt_idx" ON "AuditLog"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_correlationId_idx" ON "AuditLog"("correlationId");

-- AddForeignKey
ALTER TABLE "IndividualProfile" ADD CONSTRAINT "IndividualProfile_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessProfile" ADD CONSTRAINT "BusinessProfile_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessContact" ADD CONSTRAINT "BusinessContact_businessProfileId_fkey" FOREIGN KEY ("businessProfileId") REFERENCES "BusinessProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthorizedRepresentative" ADD CONSTRAINT "AuthorizedRepresentative_businessProfileId_fkey" FOREIGN KEY ("businessProfileId") REFERENCES "BusinessProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthorizedRepresentative" ADD CONSTRAINT "AuthorizedRepresentative_businessContactId_fkey" FOREIGN KEY ("businessContactId") REFERENCES "BusinessContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerChannel" ADD CONSTRAINT "CustomerChannel_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerChannel" ADD CONSTRAINT "CustomerChannel_businessContactId_fkey" FOREIGN KEY ("businessContactId") REFERENCES "BusinessContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerChannel" ADD CONSTRAINT "CustomerChannel_authorizedRepresentativeId_fkey" FOREIGN KEY ("authorizedRepresentativeId") REFERENCES "AuthorizedRepresentative"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_customerChannelId_fkey" FOREIGN KEY ("customerChannelId") REFERENCES "CustomerChannel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_latestQuoteId_fkey" FOREIGN KEY ("latestQuoteId") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_latestTradeIntentId_fkey" FOREIGN KEY ("latestTradeIntentId") REFERENCES "TradeIntent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeIntent" ADD CONSTRAINT "TradeIntent_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeIntent" ADD CONSTRAINT "TradeIntent_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeIntent" ADD CONSTRAINT "TradeIntent_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_submittedByRepresentativeId_fkey" FOREIGN KEY ("submittedByRepresentativeId") REFERENCES "AuthorizedRepresentative"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_tradeIntentId_fkey" FOREIGN KEY ("tradeIntentId") REFERENCES "TradeIntent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceCase" ADD CONSTRAINT "ComplianceCase_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Director" ADD CONSTRAINT "Director_businessProfileId_fkey" FOREIGN KEY ("businessProfileId") REFERENCES "BusinessProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Director" ADD CONSTRAINT "Director_complianceCaseId_fkey" FOREIGN KEY ("complianceCaseId") REFERENCES "ComplianceCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BeneficialOwner" ADD CONSTRAINT "BeneficialOwner_businessProfileId_fkey" FOREIGN KEY ("businessProfileId") REFERENCES "BusinessProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BeneficialOwner" ADD CONSTRAINT "BeneficialOwner_complianceCaseId_fkey" FOREIGN KEY ("complianceCaseId") REFERENCES "ComplianceCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceDocument" ADD CONSTRAINT "ComplianceDocument_complianceCaseId_fkey" FOREIGN KEY ("complianceCaseId") REFERENCES "ComplianceCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceDocument" ADD CONSTRAINT "ComplianceDocument_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceReview" ADD CONSTRAINT "ComplianceReview_complianceCaseId_fkey" FOREIGN KEY ("complianceCaseId") REFERENCES "ComplianceCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
