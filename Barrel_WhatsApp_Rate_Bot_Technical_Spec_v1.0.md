# Barrel WhatsApp Rate Bot
## MVP Technical Specification and Build Handover

**Version:** 1.0  
**Date:** 5 August 2026  
**Primary corridor:** NGN → CAD  
**Initial liquidity provider:** Juicyway  
**Delivery channel:** WhatsApp Business Platform (Cloud API)

---

## 1. Executive summary

Build a lightweight WhatsApp bot that lets a customer request the current Barrel NGN-to-CAD rate, enter an amount, receive an indicative quote, and request a human-assisted transaction.

The bot must fetch the underlying provider rate from Juicyway, apply a configurable Barrel spread, and show only the resulting customer rate and estimated CAD amount. The spread must be editable from an authenticated admin screen without a code deployment.

**Example:**

- Juicyway provider rate: ₦1,030 per C$1
- Barrel spread: ₦20 per C$1
- Customer-facing rate: ₦1,050 per C$1
- Customer sends: ₦2,000,000
- Customer receives: C$1,904.76 before any separately configured fee

This MVP is a quotation and lead-capture system. It does not collect money, perform KYC, create wallets, execute swaps, or send payouts.

## 2. Product objective

### 2.1 Goal

Allow Barrel to answer rate enquiries instantly on WhatsApp while keeping full control of pricing, margin and transaction fulfilment.

### 2.2 Success criteria

- A customer can request a quote in under 30 seconds.
- The displayed rate always includes Barrel's configured spread.
- The Juicyway provider rate is never exposed to the customer.
- An administrator can change the spread without redeploying the application.
- Every quote is stored with provider rate, customer rate, amount, margin estimate and expiry.
- A customer can reply **PROCEED** to create a human follow-up request.
- The provider integration can later be replaced or supplemented without rewriting the WhatsApp flow.

## 3. Scope

### 3.1 MVP in scope

- WhatsApp webhook verification and inbound message handling.
- NGN → CAD rate enquiries.
- Juicyway quote/rate retrieval.
- Configurable Barrel spread.
- Quote calculation and currency rounding.
- Customer quote message.
- **PROCEED**, **RATE**, **HELP** and **STOP** commands.
- Human handoff notification by email.
- Basic authenticated admin console.
- Quote, conversation, webhook and audit records.
- Sandbox and production configuration.
- Automated tests for pricing logic and webhook processing.

### 3.2 Explicitly out of scope for MVP

- Receiving customer funds.
- Automatic swap execution or rate locking.
- Automatic bank payouts.
- Customer onboarding, KYC or sanctions screening.
- Beneficiary collection.
- Wallet balances.
- Multi-user staff permissions beyond admin access.
- Marketing broadcasts.
- Additional corridors, except through configuration after the MVP is stable.

## 4. Recommended technology stack

| Layer | Recommendation |
|---|---|
| Application | Next.js 15 App Router with TypeScript |
| Runtime | Node.js 20+ |
| Hosting | Vercel |
| Database | PostgreSQL via Supabase or Neon |
| ORM | Prisma |
| Validation | Zod |
| WhatsApp | Meta WhatsApp Business Platform Cloud API |
| Admin authentication | Auth.js with Google sign-in and an email allowlist |
| Email notification | Resend |
| Logging | Pino with structured redaction |
| Monitoring | Sentry, optional for MVP but recommended |
| Testing | Vitest, Supertest or route-handler tests, and Playwright for admin smoke tests |

Do not use a client-side or no-code call directly to Juicyway. All provider requests must be made server-side.

## 5. High-level architecture

```text
WhatsApp customer
      │
      ▼
Meta WhatsApp Cloud API
      │ webhook
      ▼
Next.js webhook route
      │
      ├── Conversation state machine
      ├── Quote service
      │      ├── Pricing engine
      │      └── Provider registry
      │              └── Juicyway adapter
      │
      ├── PostgreSQL / Prisma
      └── Resend human-handoff notification

Admin user
      │
      ▼
Authenticated admin console
      ├── Change spread and limits
      ├── Enable/disable corridor
      └── Review quotes and proceed requests
```

## 6. Core pricing rule

### 6.1 Rate convention

Inside Barrel, normalize every provider quote to:

> **source currency units required to buy one target currency unit**

For the initial corridor, the normalized rate is **NGN per C$1**.

This removes ambiguity even if a future provider returns the inverse rate.

### 6.2 Customer rate formula

For NGN → CAD:

```text
customerRate = providerRate × (1 + percentageSpread) + fixedSpread
```

For the MVP, support these spread modes:

1. **Fixed spread:** add a fixed number of NGN per CAD.
2. **Percentage spread:** add a percentage to the provider rate.
3. **Hybrid spread:** apply the percentage and then add the fixed spread.

Examples:

```text
providerRate = 1030 NGN/CAD
fixedSpread = 20 NGN/CAD
percentageSpread = 0
customerRate = 1050 NGN/CAD
```

```text
providerRate = 1030 NGN/CAD
percentageSpread = 0.02
fixedSpread = 0
customerRate = 1050.60 NGN/CAD
```

### 6.3 Customer output calculation

```text
netSourceAmount = sourceAmount - explicitSourceFee
customerTargetAmount = netSourceAmount / customerRate
```

For CAD, round down to two decimal places so Barrel does not promise more than the calculation supports.

```text
customerTargetAmount = floor(rawTargetAmount × 100) / 100
```

### 6.4 Expected margin calculation

```text
providerSourceCost = customerTargetAmount × providerRate
expectedGrossMarginSource = sourceAmount
                          - providerSourceCost
                          - providerFeeInSourceCurrency
                          - payoutFeeInSourceCurrency
```

For the MVP, provider and payout fees may be entered as zero until Juicyway confirms them. Store the fee fields now so the pricing model does not need redesign later.

### 6.5 Worked example

```text
Source amount:                 ₦2,000,000
Juicyway provider rate:        ₦1,030/C$1
Barrel fixed spread:           ₦20/C$1
Customer rate:                 ₦1,050/C$1
Customer receives:             C$1,904.76
Provider source cost:          ₦1,961,902.80
Estimated gross margin:        ₦38,097.20
```

The estimated gross margin excludes any provider, payout or banking charges not yet configured.

### 6.6 Required safeguards

- Use a decimal library such as `decimal.js`; do not use JavaScript floating-point arithmetic for money.
- Store monetary values as integer minor units where practical.
- Store rates as decimal strings or database `DECIMAL`, never binary floats.
- Validate that the customer rate is never better than the provider rate for this corridor.
- Reject a quote if the calculated margin becomes negative.
- Save the exact pricing configuration used for each quote so historical quotes remain reproducible.

## 7. Customer experience

### 7.1 Supported commands

| Command | Behaviour |
|---|---|
| RATE, QUOTE, HI, HELLO | Start or restart a quote |
| PROCEED | Create a human follow-up request using the latest valid quote |
| HELP | Display concise help |
| STOP | Mark the contact as opted out and stop automated responses except confirmation |

### 7.2 MVP conversation flow

```text
Customer: Hi

Bot: Welcome to Barrel. Get an indicative NGN to CAD rate in seconds.
     How much NGN would you like to exchange?
     Example: 2000000

Customer: 2000000

Bot: Barrel rate: ₦1,050 per C$1
     You send: ₦2,000,000
     Estimated recipient amount: C$1,904.76
     Indicative quote valid for 30 seconds. Final rate is confirmed before payment.

     Reply PROCEED to continue or RATE for a new quote.

Customer: PROCEED

Bot: Your request has been received. A Barrel specialist will contact you shortly to confirm the final rate and next steps.
```

### 7.3 Message principles

- Do not show `Juicyway`, `provider rate`, `spread`, `margin` or internal fee details to the customer.
- Label the result as an **indicative quote** until Barrel has an execution workflow.
- Never imply that the customer rate is locked unless the provider quote has actually been locked.
- Use clear currency symbols and ISO codes together where confusion is possible.
- Keep each message short enough to scan on mobile.

## 8. Conversation state machine

Recommended states:

```text
IDLE
AWAITING_AMOUNT
QUOTE_PRESENTED
PROCEED_REQUESTED
HUMAN_HANDOFF
OPTED_OUT
```

Rules:

- Any recognized quote-start command moves the user to `AWAITING_AMOUNT`.
- A valid amount in `AWAITING_AMOUNT` triggers quote creation and moves to `QUOTE_PRESENTED`.
- `PROCEED` is accepted only when a recent quote exists. If it is expired, fetch a fresh quote and ask the customer to reconfirm.
- Unknown input returns one corrective prompt, not a long menu.
- Duplicate webhook messages must not create duplicate quotes or proceed requests.

## 9. Juicyway provider adapter

### 9.1 Provider interface

```ts
export type RateRequest = {
  sourceCurrency: string;
  targetCurrency: string;
  sourceAmountMinor: bigint;
};

export type ProviderQuote = {
  provider: string;
  providerQuoteId: string | null;
  sourceCurrency: string;
  targetCurrency: string;
  normalizedSourcePerTargetRate: string;
  rawRate: string;
  rawSymbol: string | null;
  rawType: 'buy' | 'sell' | null;
  locked: boolean;
  expiresAt: Date;
  rawResponse: unknown;
};

export interface RateProvider {
  getIndicativeQuote(request: RateRequest): Promise<ProviderQuote>;
  lockQuote?(providerQuoteId: string): Promise<ProviderQuote>;
  healthCheck(): Promise<{ ok: boolean; message?: string }>;
}
```

### 9.2 Juicyway integration behaviour

- Authenticate with the Juicyway API key in the `Authorization` header.
- Use the sandbox base URL for development and the production base URL only after approval.
- Request an **unlocked** quote for ordinary rate enquiries where supported, using `lock=false`.
- Map Juicyway's returned `rate`, `symbol`, `type`, `locked`, `time_to_lock` and `time_to_convert` into the provider-neutral model.
- Derive the expiry from the shorter relevant provider TTL and Barrel's configured quote TTL.
- Store the provider response for audit, but encrypt it or redact it from application logs.
- Implement request timeout, one safe retry for transient failures, and exponential backoff for HTTP 429.

Juicyway's public documentation has shown minor inconsistencies between endpoint headings and request examples. Keep the exact path, query parameters and field mapping isolated in `JuicywayProvider`, and verify them against the current account API reference before production.

### 9.3 Suggested adapter configuration

```ts
export const juicywayConfig = {
  baseUrl: process.env.JUICYWAY_BASE_URL,
  apiKey: process.env.JUICYWAY_API_KEY,
  quotePath: process.env.JUICYWAY_QUOTE_PATH ?? '/exchange/quote',
  timeoutMs: 8000,
};
```

### 9.4 Normalization function

The adapter must inspect the returned symbol and direction instead of assuming the rate orientation.

```ts
function normalizeToSourcePerTarget(input: {
  rawRate: Decimal;
  rawBase: string;
  rawQuote: string;
  sourceCurrency: string;
  targetCurrency: string;
}): Decimal {
  const { rawRate, rawBase, rawQuote, sourceCurrency, targetCurrency } = input;

  if (rawBase === targetCurrency && rawQuote === sourceCurrency) {
    // Example: CAD-NGN where 1 CAD = 1030 NGN
    return rawRate;
  }

  if (rawBase === sourceCurrency && rawQuote === targetCurrency) {
    // Example: NGN-CAD where 1 NGN = 0.00097087 CAD
    return new Decimal(1).div(rawRate);
  }

  throw new Error('Provider rate orientation does not match requested corridor');
}
```

Add contract tests using real sanitized sandbox responses before launch.

## 10. Quote service

### 10.1 Service responsibilities

`QuoteService.createIndicativeQuote()` must:

1. Load the active corridor configuration.
2. Validate source currency, target currency, minimum and maximum amount.
3. Request an indicative provider quote.
4. Normalize the provider rate.
5. Apply the active Barrel spread and fees.
6. Calculate the target amount and expected margin.
7. Reject negative-margin or stale quotes.
8. Save the quote and immutable pricing snapshot.
9. Return a customer-safe response object.

### 10.2 Customer-safe response

```ts
export type CustomerQuote = {
  id: string;
  sourceCurrency: 'NGN';
  targetCurrency: 'CAD';
  sourceAmount: string;
  targetAmount: string;
  customerRate: string;
  expiresAt: string;
  disclaimer: string;
};
```

Do not include provider name, provider rate, raw response, estimated margin or API identifiers in this object.

## 11. Admin console

### 11.1 Required screens

**Dashboard**

- Current corridor status.
- Latest Juicyway rate.
- Current customer rate after spread.
- Quotes today.
- Proceed requests awaiting follow-up.
- Provider health status.

**Corridor settings**

- Enable/disable NGN → CAD.
- Spread mode: fixed, percentage or hybrid.
- Fixed spread in NGN per CAD.
- Percentage spread in percent or basis points.
- Minimum and maximum NGN amount.
- Optional fixed customer fee.
- Optional provider fee estimate.
- Quote validity seconds.
- Rounding precision.
- Customer disclaimer.

**Quotes**

- Customer WhatsApp ID, masked by default.
- Source amount.
- Provider rate.
- Customer rate.
- Target amount.
- Expected margin.
- Created and expiry times.
- Status.

**Proceed requests**

- Customer contact.
- Quote snapshot.
- Requested time.
- Assignment/status notes.

### 11.2 Spread update requirement

When an administrator saves a new spread, it must apply to the **next quote request immediately**. Existing quotes must retain their original pricing snapshot and must not be recalculated.

Every configuration change must create an audit log with old value, new value, admin identity and timestamp.

## 12. Data model

Suggested Prisma models:

```prisma
enum ConversationState {
  IDLE
  AWAITING_AMOUNT
  QUOTE_PRESENTED
  PROCEED_REQUESTED
  HUMAN_HANDOFF
  OPTED_OUT
}

enum QuoteStatus {
  INDICATIVE
  EXPIRED
  PROCEED_REQUESTED
  CANCELLED
}

enum SpreadMode {
  FIXED
  PERCENTAGE
  HYBRID
}

model CorridorConfig {
  id                        String   @id @default(cuid())
  sourceCurrency            String
  targetCurrency            String
  enabled                   Boolean  @default(true)
  spreadMode                SpreadMode @default(FIXED)
  fixedSpread               Decimal  @db.Decimal(24, 8)
  percentageSpread          Decimal  @db.Decimal(12, 8)
  minSourceAmountMinor      BigInt
  maxSourceAmountMinor      BigInt
  explicitSourceFeeMinor    BigInt   @default(0)
  providerFeeEstimateMinor  BigInt   @default(0)
  quoteTtlSeconds           Int      @default(30)
  targetPrecision           Int      @default(2)
  disclaimer                String
  createdAt                 DateTime @default(now())
  updatedAt                 DateTime @updatedAt

  @@unique([sourceCurrency, targetCurrency])
}

model Conversation {
  id                String   @id @default(cuid())
  whatsappUserId    String   @unique
  phoneMasked       String?
  state             ConversationState @default(IDLE)
  latestQuoteId     String?
  optedOutAt        DateTime?
  lastInboundAt     DateTime?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
}

model Quote {
  id                         String   @id @default(cuid())
  conversationId             String
  provider                   String
  providerQuoteId            String?
  sourceCurrency             String
  targetCurrency             String
  sourceAmountMinor          BigInt
  targetAmountMinor          BigInt
  providerRate               Decimal  @db.Decimal(24, 10)
  customerRate               Decimal  @db.Decimal(24, 10)
  fixedSpreadSnapshot        Decimal  @db.Decimal(24, 10)
  percentageSpreadSnapshot   Decimal  @db.Decimal(12, 8)
  explicitFeeMinor           BigInt
  providerFeeEstimateMinor   BigInt
  expectedMarginMinor        BigInt
  providerLocked             Boolean  @default(false)
  expiresAt                  DateTime
  status                     QuoteStatus @default(INDICATIVE)
  rawProviderResponse        Json?
  createdAt                  DateTime @default(now())

  conversation Conversation @relation(fields: [conversationId], references: [id])
}

model ProceedRequest {
  id              String   @id @default(cuid())
  conversationId  String
  quoteId          String
  status           String   @default("OPEN")
  assignedTo       String?
  notes            String?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  @@unique([conversationId, quoteId])
}

model WebhookEvent {
  id             String   @id @default(cuid())
  provider       String
  externalId     String
  eventType      String
  payloadHash    String
  processedAt    DateTime?
  createdAt      DateTime @default(now())

  @@unique([provider, externalId])
}

model AuditLog {
  id          String   @id @default(cuid())
  actorEmail  String
  action      String
  entityType  String
  entityId    String
  before      Json?
  after       Json?
  createdAt   DateTime @default(now())
}
```

Encrypt or omit `rawProviderResponse` if it contains sensitive data. Do not store full WhatsApp payloads indefinitely.

## 13. HTTP routes

### 13.1 Public routes

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/whatsapp/webhook` | Meta webhook verification |
| POST | `/api/whatsapp/webhook` | Receive WhatsApp messages and statuses |
| GET | `/api/health` | Liveness check without exposing secrets |

### 13.2 Authenticated admin routes

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/admin/dashboard` | Summary metrics |
| GET | `/api/admin/corridors` | List corridor configurations |
| PATCH | `/api/admin/corridors/:id` | Update spread, limits and status |
| GET | `/api/admin/quotes` | Search and review quotes |
| GET | `/api/admin/proceed-requests` | Review follow-up requests |
| PATCH | `/api/admin/proceed-requests/:id` | Update request status |
| POST | `/api/admin/provider-health` | Run a controlled provider check |

### 13.3 Internal quote route for testing

```http
POST /api/internal/quotes/preview
```

This route is admin-authenticated and returns both provider and customer calculations for QA. It must never be public.

## 14. WhatsApp integration details

- Use Meta Cloud API webhooks to receive inbound messages.
- Implement the verification GET challenge using the configured verify token.
- Verify the webhook signature using the Meta app secret before processing POST requests.
- Use the inbound WhatsApp message ID as an idempotency key.
- Return HTTP 200 quickly, then perform processing safely. For Vercel, keep the workflow short or hand off to a queue if response times become unreliable.
- Send free-form service responses only within the active customer-service window. The customer initiates this quote flow, so the normal 24-hour service window applies.
- Do not send marketing messages in the MVP.

## 15. Error handling and fallback behaviour

| Situation | Customer response | Internal behaviour |
|---|---|---|
| Invalid amount | Ask for digits only and show an example | Do not call provider |
| Below minimum | State minimum allowed | Log validation event |
| Above maximum | Ask customer to contact Barrel | Create optional high-value lead |
| Provider timeout | “Rates are temporarily unavailable. Please try again shortly.” | Retry once, alert after threshold |
| Provider rate orientation unknown | Generic unavailable message | Fail closed and alert developer |
| Negative expected margin | Generic unavailable message | Block quote and create critical alert |
| Quote expired before PROCEED | Fetch a new quote and ask customer to confirm | Do not reuse stale quote |
| Duplicate webhook | No duplicate response or record | Return 200 using idempotency record |
| Admin disables corridor | State that the corridor is temporarily unavailable | Do not call provider |

Never fall back to a hardcoded rate in production.

## 16. Security and privacy requirements

- Keep Juicyway and Meta credentials in server-side environment variables.
- Never expose provider credentials in browser bundles, WhatsApp messages or logs.
- Use HTTPS only.
- Verify Meta webhook challenge and POST signatures.
- Restrict the admin console to approved emails.
- Redact phone numbers, API keys and provider payloads in logs.
- Apply database encryption at rest through the hosting provider.
- Use least-privilege API keys where supported.
- Rotate live keys periodically.
- Add rate limiting to webhook and admin endpoints.
- Store the minimum data necessary for the quote workflow.
- Provide a deletion mechanism for a contact's stored quote/conversation data.

## 17. Environment variables

```bash
# Application
NODE_ENV=development
APP_URL=https://your-domain.example
DATABASE_URL=

# Admin authentication
AUTH_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
ADMIN_EMAIL_ALLOWLIST=founder@example.com

# Meta WhatsApp Cloud API
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=
WHATSAPP_VERIFY_TOKEN=
META_APP_SECRET=
META_GRAPH_API_VERSION=

# Juicyway
JUICYWAY_BASE_URL=https://api-sandbox.spendjuice.com
JUICYWAY_API_KEY=
JUICYWAY_QUOTE_PATH=/exchange/quote

# Notifications
RESEND_API_KEY=
HANDOFF_NOTIFICATION_EMAIL=

# Optional monitoring
SENTRY_DSN=
```

Do not commit `.env` files. Include `.env.example` with empty values and comments.

## 18. Suggested repository structure

```text
src/
  app/
    api/
      health/route.ts
      whatsapp/webhook/route.ts
      admin/
      internal/quotes/preview/route.ts
    admin/
      page.tsx
      corridors/page.tsx
      quotes/page.tsx
      proceed-requests/page.tsx
  components/
  lib/
    auth/
    db/
    money/
      decimal.ts
      formatting.ts
    pricing/
      pricing-engine.ts
      pricing-types.ts
    providers/
      provider-interface.ts
      provider-registry.ts
      juicyway-provider.ts
    whatsapp/
      client.ts
      parser.ts
      state-machine.ts
      message-templates.ts
      signature.ts
    notifications/
      handoff-email.ts
    logging/
      logger.ts
  services/
    quote-service.ts
    conversation-service.ts
    handoff-service.ts
prisma/
  schema.prisma
  seed.ts
tests/
  unit/
  integration/
  fixtures/
```

## 19. Required tests

### 19.1 Pricing unit tests

| Provider rate | Spread | Source amount | Expected customer rate | Expected CAD |
|---:|---:|---:|---:|---:|
| 1030 | fixed 20 | ₦2,000,000 | 1050 | C$1,904.76 |
| 1030 | 2% | ₦2,000,000 | 1050.60 | C$1,903.67 |
| 1030 | fixed 0 | ₦10,000 | 1030 | C$9.70 |

Also test:

- Decimal precision and round-down behaviour.
- Minimum and maximum amount validation.
- Negative margin blocking.
- Inverse-rate normalization.
- Disabled corridor.
- Exact pricing snapshot persistence.

### 19.2 Provider adapter tests

- Correct authorization header.
- `lock=false` applied for indicative quotes where supported.
- Timeout and HTTP 429 handling.
- Buy/sell and symbol orientation mapping.
- Invalid or changed response schema fails safely.

### 19.3 WhatsApp tests

- Webhook verification.
- Signature validation.
- Duplicate message idempotency.
- RATE → amount → quote flow.
- PROCEED with valid quote.
- PROCEED with expired quote.
- STOP opt-out.
- Provider error response.

## 20. Acceptance criteria

The MVP is accepted only when all of the following are demonstrated:

1. Admin sets the fixed spread to **₦20/C$1**.
2. A mocked or sandbox Juicyway response returns **₦1,030/C$1**.
3. The customer receives a WhatsApp quote showing **₦1,050/C$1**, not ₦1,030.
4. For ₦2,000,000, the bot returns **C$1,904.76** using round-down rules.
5. Admin changes the spread to **₦25/C$1** without a deployment.
6. The next quote shows **₦1,055/C$1**.
7. The previous quote remains stored at **₦1,050/C$1**.
8. The customer never receives provider rate, provider name or internal margin.
9. PROCEED creates exactly one follow-up request and sends one notification.
10. A duplicate Meta webhook does not create a second quote or notification.
11. If Juicyway is unavailable, no hardcoded or stale rate is shown.
12. All secrets remain server-side and automated tests pass.

## 21. Implementation phases

### Phase 1: Foundation

- Create Next.js project and database.
- Add Prisma schema and seed one NGN → CAD corridor.
- Implement decimal money helpers and pricing unit tests.

### Phase 2: Provider integration

- Build provider interface and Juicyway adapter.
- Add sandbox fixtures and contract tests.
- Implement quote service.

### Phase 3: WhatsApp bot

- Implement webhook verification and signature checks.
- Build message parser and state machine.
- Send quote responses and handle PROCEED.

### Phase 4: Admin console

- Add authentication and email allowlist.
- Build corridor settings, quote list and proceed-request list.
- Add audit logs.

### Phase 5: Hardening and launch

- Add monitoring, redaction and rate limits.
- Complete sandbox end-to-end test.
- Configure production Meta and Juicyway credentials.
- Run launch checklist and deploy.

## 22. Future-ready design

The following should be possible without rewriting the bot:

- Add TransFi, Busha, Fincra or another provider adapter.
- Request quotes from multiple providers and choose the cheapest executable route.
- Add CAD → NGN and other corridors.
- Lock provider quotes after customer confirmation.
- Collect beneficiary information through WhatsApp Flows or a secure web form.
- Add KYC and compliance orchestration.
- Execute swaps and payouts after operational and regulatory approval.
- Add customer accounts and transaction history.

Do not build these features in the MVP, but preserve the provider interface and immutable pricing snapshots needed for them.

## 23. Build instructions for Claude

Use this document as the source of truth. Build a production-quality MVP repository, not a prototype snippet.

Required delivery:

- Complete Next.js 15 TypeScript application.
- Prisma schema, migrations and seed script.
- Meta WhatsApp Cloud API webhook integration.
- Provider-neutral quote interface and Juicyway adapter.
- Decimal-safe pricing engine with configurable fixed, percentage and hybrid spread.
- Authenticated admin console.
- Resend handoff notification.
- Unit and integration tests.
- `.env.example`.
- `README.md` with local setup, Meta setup, Juicyway sandbox setup, database migration, test and deployment instructions.
- Sample sanitized provider fixtures.
- No exposed secrets, hardcoded live rates or TODO placeholders in core paths.

Before declaring the build complete, run the acceptance criteria in Section 20 and include the test output in the handover notes.

## 24. Launch checklist

- [ ] Juicyway sandbox quote confirmed and mapped correctly.
- [ ] Rate orientation verified for NGN → CAD.
- [ ] Barrel spread configured and tested.
- [ ] Meta webhook GET verification passes.
- [ ] Meta webhook POST signature verification passes.
- [ ] Test WhatsApp number completes the full quote flow.
- [ ] Duplicate webhook test passes.
- [ ] Admin access restricted to allowlisted email.
- [ ] Provider and customer rates visible only to admin.
- [ ] Logs redact phone numbers and secrets.
- [ ] Provider outage produces a safe customer message.
- [ ] PROCEED sends one handoff notification.
- [ ] Production secrets entered directly in hosting environment.
- [ ] No automatic money movement is enabled.

## 25. Official implementation references

- Juicyway API Request Authentication — API key in the `Authorization` header; server-side secret handling.
- Juicyway Quickstart Guide — sandbox/production keys and webhook setup.
- Juicyway Get Swap Rate / Get Quote — quote fields, direction and locking behaviour.
- Juicyway Fetch Rate — unlocked quote support with `lock=false` and quote timing fields.
- Meta WhatsApp Cloud API Get Started — send messages and receive webhooks.
- Meta Create a Webhook Endpoint — verification challenge and verify token.
- Meta Service Messages — customer-initiated 24-hour service window.

**Important:** Reconfirm endpoint paths, API versions and commercial permissions in the live Juicyway and Meta accounts before production deployment.
