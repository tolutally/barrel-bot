# Railway deployment

Deploy the API from the repository root because it consumes shared workspace packages. Deploy Ops with `apps/ops` as its service root; Ops is self-contained.

## API service

- Config file path: `/apps/api/railway.toml`
- Public domain: required for the Meta WhatsApp webhook.
- Health check: `/api/health`
- The configured pre-deploy command runs Prisma migrations before the API begins serving traffic.

Set the server-only values from `.env.example`, including the database URL, Supabase server settings, Meta credentials, Juicyway credentials, and the three `WEB_PUSH_VAPID_*` values. Set `APP_URL` to the API's public HTTPS domain. Set `PUBLIC_WEB_ORIGINS` to the public website domain only.

## Ops service

- Root directory: `/apps/ops`
- Config file path: `/apps/ops/railway.toml`
- Public domain: required for staff access and iPhone notifications.
- Health check: `/api/health`

Set only:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `BARREL_API_URL` to the API's public HTTPS domain
- `NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY` matching the API public VAPID key

Never add the database URL, Supabase secret key, Meta credentials, Juicyway key, or VAPID private key to Ops.

## Railway setup

1. Create the **Barrel API** service from the GitHub repository. In service settings, set the config-file path to `/apps/api/railway.toml`, add its variables, and generate a public domain.
2. Create the **Barrel Ops** service from the same repository. Set the config-file path to `/apps/ops/railway.toml`, add its limited variables, and generate a public domain.
3. Add the API webhook URL to Meta: `https://<api-domain>/api/whatsapp/webhook`.
4. Update `BARREL_API_URL` on Ops with the deployed API domain, then redeploy Ops.
5. Open Ops over HTTPS on an iPhone, add it to the home screen, sign in, and tap **Enable alerts**.

## Conversation media cleanup

Create a third Railway service from the same repository using `/apps/api/railway.media-cleanup.toml`. Set `BARREL_API_URL` to the API domain and set the same strong `MEDIA_CLEANUP_SECRET` on both the API and cleanup services. The service runs daily at 03:15 UTC, removes private conversation attachments after 90 days, and exits.

The API database migration command is safe to repeat: Prisma records applied migrations and only applies pending ones.
