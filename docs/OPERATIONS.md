# Operations Runbook

## Port Conflicts

If setup fails because a port is busy, change only the relevant `HOST_*_PORT` value in `.env`. If PostgreSQL changes, also update the port inside `DATABASE_URL`.

## Backups

Backups run every `DB_BACKUP_INTERVAL_HOURS` hours when `DB_BACKUP_ENABLED=true`.

Default behavior:

- `pg_dump` creates a clean gzip dump.
- The gzip stream is verified.
- The file is encrypted with AES-256-GCM using `DB_BACKUP_ENCRYPTION_KEY` or `JWT_SECRET`.
- The encrypted file is verified before the plaintext gzip is deleted.
- Retention uses `DB_BACKUP_RETENTION_DAYS` and `DB_BACKUP_MAX_FILES`.

Manual backup:

```powershell
cd backend
npm run backup:db
```

Admin API:

```text
GET  /api/admin/backups/status
POST /api/admin/backups/run
```

## Monitoring

Start Prometheus/Grafana:

```powershell
docker compose -f docker-compose.yml -f docker-compose.monitoring.yml up -d
```

Prometheus reads `monitoring/prometheus.yml` and `monitoring/alert-rules.yml`.

## Production Auth

Use HTTPS in production. Keep `FORCE_HTTPS` enabled unless TLS is terminated in an environment that does not forward `x-forwarded-proto`.

Browser authentication uses an httpOnly `susclass_auth` cookie plus the `X-CSRF-Token` header. `/api/logout` records the token hash in `revoked_sessions` until the JWT would naturally expire, so a copied token cannot be reused after logout.

Repeated failed admin, teacher, student, and TOTP login attempts are tracked in `auth_failures`. Defaults:

```env
AUTH_LOCKOUT_MAX_FAILURES=5
AUTH_LOCKOUT_WINDOW_MS=900000
AUTH_LOCKOUT_DURATION_MS=900000
```
