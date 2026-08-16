# Operator provisioning

Operator access is deliberately allowlisted. There is no public signup and no Google OAuth flow.

1. In Supabase Dashboard, create the staff member under **Authentication → Users** with email/password.
2. Copy the resulting Auth user UUID.
3. Insert the matching application operator record after the database migration is deployed:

```sql
INSERT INTO "Operator" ("id", "authUserId", "email", "displayName", "role", "status", "updatedAt")
VALUES ('replace-with-cuid', 'supabase-auth-user-uuid', 'operator@example.com', 'Name', 'OPERATOR', 'ACTIVE', NOW());
```

Use `ADMIN` only for staff who need administrative privileges. Set `status` to `DISABLED` to revoke Barrel operator access without deleting the Auth user. The `/api/internal/me` endpoint validates the signed-in session and this active operator mapping on every request.
