# Barrel architecture

Barrel is channel-independent. The backend and Supabase PostgreSQL are the permanent system of record. Prisma remains the ORM and authoritative schema/migration workflow. WhatsApp and Appsmith are replaceable interfaces; the future customer web application is a permanent product surface.

## Domain relationships

```text
Customer
|
+-- IndividualProfile
|
+-- BusinessProfile
|     +-- BusinessContacts
|     +-- Directors
|     +-- BeneficialOwners
|     +-- AuthorizedRepresentatives
|
+-- CustomerChannels
+-- ComplianceCases
|     +-- ComplianceDocuments
|     +-- ComplianceReviews
|
+-- Quotes
+-- TradeIntents
+-- Trades
```

`Customer` supports both `BUSINESS` and `INDIVIDUAL`. Type-specific data belongs in a one-to-one profile. A channel identifier is not a customer identity: a channel may exist unmatched during the anonymous quote flow and is attached to a customer after identification. Quotes and early trade intents may exist before a customer exists or is identified; a trade always requires an identified customer.

Compliance is customer-neutral: `INDIVIDUAL` starts KYC and `BUSINESS` starts KYB. Multiple compliance cases preserve onboarding, review, and remediation history. Existing approved customers do not repeat initial onboarding for every trade, though their compliance state may later require review or additional information.

## Canonical lifecycle

```text
1. Customer requests quote
        |
2. Quote returned
        |
3. Customer chooses PROCEED
        |
4. TradeIntent created
        |
5. Ask BUSINESS or INDIVIDUAL
        |
6. Existing or new customer?
        |
7A. Existing                    7B. New
    Identify/authenticate           Create Customer
    Check compliance status         Start KYC or KYB
        |                           |
        +-------------+-------------+
                      |
8. Compliance approved
        |
9. Obtain fresh Quote
        |
10. Customer confirms
        |
11. Trade submitted
```

`Quote`, `TradeIntent`, and `Trade` are distinct. A trade intent preserves desired currencies and amount, not executable pricing. An expired original quote remains historical and cannot be used for a trade; a fresh indicative quote must be obtained and confirmed after compliance.

## Permanent interface boundaries

- WhatsApp initially handles quotes, intent, customer-type selection, identification handoff, and notifications. It is never the customer source of truth.
- The future permanent customer web app handles authentication, onboarding, KYC/KYB, document upload, compliance requests/status, trade submission/history, and profiles.
- Appsmith is temporary operations tooling for review, customer/trade operations, pricing, exceptions, and audit. Core logic never belongs exclusively in Appsmith.

## Locked infrastructure

```text
Customer Web ----+
WhatsApp --------+--> Barrel API ----+--> Prisma --> Supabase PostgreSQL
Future Ops UI ---+                   |
                                     +--> SecureDocumentStorage --> Supabase Storage
```

Structured data lives in Supabase PostgreSQL. Compliance document bytes will live in a private Supabase Storage bucket; PostgreSQL stores metadata and opaque `storageKey` values only. Future access must perform authentication and authorization before issuing a short-lived signed URL or server-mediated response. There are no public URLs, database blobs, or email attachments in this design.

`SecureDocumentStorage` remains provider-neutral. A later `SupabaseDocumentStorage` adapter may implement it. Supabase Auth and customer-facing RLS are deliberately undecided until the identity/security phase; the Barrel API remains responsible for authorization meanwhile.

Until that security phase, these `public` schema tables must not be granted to `anon` or `authenticated` through Supabase's Data API. A Prisma-only deployment should disable the Data API or keep the tables unexposed. RLS policies will be designed only after the customer identity/session model is settled.

## Directional corridors

Corridors are directional configuration records. `NGN -> CAD` and `CAD -> NGN` are distinct and may have different providers, spreads, limits, fees, precision, TTL, and disclaimers. A reverse corridor is never inferred or enabled from its opposite direction.

Quote creation resolves the exact `sourceCurrency + targetCurrency` configuration, verifies it is enabled, and then resolves its configured provider through `ProviderRegistry`. Missing configuration produces `UNSUPPORTED_CORRIDOR` without calling a provider. Provider rates are normalized to source-currency units required for one target-currency unit, regardless of the raw pair orientation.

Ten production-probed directions among NGN, CAD, USD, and USDT are seeded. USD→USDT and USDT→USD remain unavailable because the provider did not return a valid quote. Adding any future direction still requires a deliberate `CorridorConfig`, provider support/orientation confirmation, direction-specific pricing and limits, tests, and enablement.

Customer-facing interfaces should avoid ambiguous pair notation. Present quotes as:

```text
You send:    <source amount> <source currency>
You receive: <target amount> <target currency>
Barrel rate: <source currency> per <target currency>
```
