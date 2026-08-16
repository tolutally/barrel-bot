-- Barrel uses Prisma through the server-side API. Until the identity and RLS
-- design is implemented, customer-facing Supabase Data API roles must not have
-- direct access to the permanent domain tables.
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA "public" FROM "anon", "authenticated";

-- Prevent later Prisma-created public tables from inheriting legacy Supabase
-- Data API grants. Future API exposure must be explicit and paired with RLS.
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
  REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM "anon", "authenticated";
