# Start Commands

After cloning/pulling the repo you have three options:

---

## Option A — No Docker (limited)
Code execution works. Login and everything DB-dependent will fail.
```powershell
cd backend
npm install
node server.js        # → http://localhost:5000
```

---

## Option B — Postgres only (recommended for dev)
Full login, modules, tests. No email, no video conferencing.

```powershell
# 1. Start DB
docker run -d --name lms-db `
  -e POSTGRES_USER=lms_user -e POSTGRES_PASSWORD=lms_password -e POSTGRES_DB=lms_db `
  -p 5432:5432 postgres:15-alpine

# 2. Load schema (first time only)
Get-Content backend\FRESH-COMPLETE-DATABASE.sql            | docker exec -i lms-db psql -U lms_user -d lms_db
Get-Content backend\add-module-progress-tracking.sql       | docker exec -i lms-db psql -U lms_user -d lms_db
Get-Content backend\add-coding-submissions.sql             | docker exec -i lms-db psql -U lms_user -d lms_db
Get-Content backend\add-inapp-notifications-table.sql      | docker exec -i lms-db psql -U lms_user -d lms_db
Get-Content backend\add-chat-tables.sql                    | docker exec -i lms-db psql -U lms_user -d lms_db
Get-Content backend\v2.2.6-multi-section.sql               | docker exec -i lms-db psql -U lms_user -d lms_db
Get-Content backend\notification-system.sql                | docker exec -i lms-db psql -U lms_user -d lms_db

# 3. Seed test accounts (first time only)
cd backend; node seed.js

# 4. Start server
node server.js        # → http://localhost:5000
```

---

## Option C — Full stack (Postgres + MailHog email + Jitsi video)
⚠️ Jitsi is very heavy and can crash VS Code Insiders. Only use outside VS Code.
```powershell
docker-compose -f docker-compose.local.yml up -d
cd backend; node server.js
# Email UI → http://localhost:8025
# Jitsi   → https://localhost:8443
```

---

## Frontend dev server (hot reload, use with any option above)
```powershell
cd client; npm install; npm run dev   # → http://localhost:5173
```
To rebuild the production bundle (updates what backend serves):
```powershell
cd client; npm run build
```

---

## Stop & purge Docker data
```powershell
Get-Process -Name node | Stop-Process -Force
docker stop lms-db; docker rm lms-db
docker volume prune -f
docker image rm postgres:15-alpine
```

---

## Test accounts (seeded by Option B step 3)
| Role    | Email                                      | Password    |
|---------|--------------------------------------------|-------------|
| Admin   | admin@classroom.local                      | Admin@2026  |
| Teacher | susclass.global+sarah.teacher@gmail.com    | password123 |
| Teacher | susclass.global+emmanuel.teacher@gmail.com | password123 |
| Student | susclass.global+amara@gmail.com (SS1 A)    | student123  |
| Student | susclass.global+chidi@gmail.com (SS1 A)    | student123  |
| Student | susclass.global+seun@gmail.com (SS1 B)     | student123  |
