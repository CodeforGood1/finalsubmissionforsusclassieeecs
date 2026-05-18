# Contributing

## Local Setup

1. Run `setup.ps1` on Windows or `./setup.sh` on Linux/macOS.
2. If a port is already in use, change the matching `HOST_*_PORT` value in `.env` and rerun setup.
3. Start local development with the backend on `PORT=5000` and Vite on `5173`.

## Checks Before Handoff

Run these from the repo root:

```powershell
cd backend
npm test
node --check server.js
node --check local-code-executor.js
node --check backupService.js

cd ..\client
npm run lint
npm run build
```

## Security Rules

- Do not commit `.env`, generated admin password hashes, uploaded files, or database backups.
- Passwords must be at least 8 characters and include a letter and number.
- Browser code must not store JWTs in localStorage. Use the cookie session and fetch interceptor in `client/src/config/api.js`.
- New state-changing API routes must either be explicitly exempted because they are public/auth bootstrap routes or must pass CSRF validation.
- Teacher endpoints must verify ownership or allocation before returning student data.

## Database Backup Verification

Use the admin API or backend script:

```powershell
cd backend
npm run backup:db
```

A successful result includes `"verified": true` and `"encrypted": true`. Backups are written to `DB_BACKUP_DIR`; encrypted files end in `.sql.gz.enc`.
