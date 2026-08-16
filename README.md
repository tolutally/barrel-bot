# Barrel WhatsApp Rate Bot

Permanent, channel-independent backend foundation for Barrel's NGN-to-CAD FX product.

## Architecture

- `apps/api`: Next.js backend/API; route handlers remain thin.
- `packages/db`: PostgreSQL Prisma schema, migration, client, and seed.
- `packages/domain`: business customer, KYB, compliance, and trade input contracts.
- `packages/pricing`: framework-independent, decimal-safe money and pricing domain logic.
- `packages/providers`: provider-neutral FX contracts for the next integration phase.
- `packages/quotes`: direction-agnostic corridor lookup, provider routing, pricing, and customer-safe quote orchestration.
- `packages/storage`: provider-neutral private document-storage contracts.
- `packages/shared`: small shared validation helpers.

See [docs/architecture.md](docs/architecture.md) for the customer, compliance, and quote-to-trade model.

## Local setup

1. Install Node.js 20 or newer.
2. Run `npm install`.
3. Copy `.env.example` to `.env` and set a Supabase PostgreSQL `DATABASE_URL`. Set `DIRECT_URL` when application traffic uses Supavisor transaction mode.
4. Run `npm run db:generate`, `npm run db:migrate`, and `npm run db:seed`.
5. Run `npm run dev` and open `http://localhost:3000`.

The seed enables the ten Juicyway-supported directional corridors among NGN, CAD, USD, and USDT, excluding USD↔USDT. All use a 1.5% spread. Source limits are NGN 100,000–10,000,000 and CAD/USD/USDT 100–100,000. Unit tests do not require Supabase credentials.

## Checks

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npx prisma validate --schema packages/db/prisma/schema.prisma`
- `npm run build`

## Juicyway sandbox

Set `JUICYWAY_BASE_URL`, `JUICYWAY_API_KEY`, and optionally `JUICYWAY_QUOTE_PATH` in `.env.local`, then run `npm run test:juicyway`. The sandbox test requests an unlocked NGN → CAD quote, normalizes and prices it through `QuoteService`, persists the snapshot to Supabase, verifies the customer-safe response, and removes the synthetic quote afterward.

The complete product and security requirements are in `Barrel_WhatsApp_Rate_Bot_Technical_Spec_v1.0.md`.
