# Architecture

## Runtime

Sustainable Classroom LMS runs as a React/Vite frontend served by the Node/Express backend. PostgreSQL is the system of record. MailHog or SMTP handles email. Jitsi is self-hosted for live classes. Uploaded files are stored on local disk under the configured upload directory.

```text
Browser
  | HTTPS, httpOnly auth cookie, CSRF header
  v
Node/Express backend
  | SQL pool
  v
PostgreSQL

Backend side services:
- localStorageService: file upload validation and local file layout
- localEmailService: SMTP/MailHog email queue
- backupService: scheduled encrypted, verified database backups
- local-code-executor: queued sandboxed student code execution
- Socket.IO: authenticated chat transport
```

## Security Boundaries

- Authentication is issued as an httpOnly `susclass_auth` cookie. Legacy bearer tokens remain accepted for tests and API clients, but the browser no longer stores the JWT.
- State-changing cookie-authenticated API calls must include `X-CSRF-Token`.
- Logout persists a token hash in `revoked_sessions` until token expiry, and repeated failed login/TOTP attempts are locked through `auth_failures`.
- Admin, teacher, and student API paths are role-gated. Teacher views additionally check module ownership or teacher-to-student allocation before returning progress or submissions.
- Student code execution uses `spawn` without a shell, fixed class names for Java, blocked network/file/process APIs, source/stdin/output limits, a rate limiter, and a FIFO execution queue.
- Uploaded files receive random server names and are served only from the configured upload directory.
- Logs are redacted at the console boundary to avoid writing email addresses, passwords, OTPs, bearer tokens, and secrets.

## Operations

- `/api/health`, `/api/health/detailed`, and `/api/metrics` are used by Docker health checks and Prometheus.
- `/api/docs/openapi.json` exposes the current API contract.
- Backups are scheduled by `backupService`; each backup is gzip-verified, encrypted with AES-256-GCM by default, and verified again before the plaintext dump is deleted.
- Optional clustering is available with `npm run start:cluster` or Docker `WEB_CONCURRENCY`. Keep `WEB_CONCURRENCY=1` unless Socket.IO sticky sessions are provided by the reverse proxy.
