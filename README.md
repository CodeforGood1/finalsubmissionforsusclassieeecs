# Sustainable Classroom LMS

Offline-first Learning Management System for schools. It supports admin, teacher, and student workflows; module creation; PDF/video content; MCQ tests; coding submissions; progress tracking; in-app notifications; email capture with MailHog; chat; and live sessions with self-hosted Jitsi.

## 1. Directory Structure

```text
.
|-- backend/                    Node.js Express API
|   |-- server.js               Main backend server
|   |-- seed.js                 Sample data and test users
|   |-- FRESH-COMPLETE-DATABASE.sql
|   |-- notification-system.sql
|   `-- uploads/                Local uploaded files
|-- client/                     React + Vite frontend
|   |-- src/
|   `-- vite.config.js
|-- nginx/                      Full Docker reverse proxy config
|-- monitoring/                 Optional Prometheus/Grafana config
|-- docker-compose.local.yml    Local services: Postgres, MailHog, Jitsi
|-- docker-compose.yml          Full deployment stack
|-- docker-compose.monitoring.yml
|-- Dockerfile
|-- setup.ps1                   One-command setup for Windows
|-- setup.sh                    One-command setup for Linux/macOS
|-- .env.example                Single env template for all services
`-- README.md
```

## 2. Requirements

- Docker Desktop or Docker Engine with Compose
- Node.js 20+
- Git
- PowerShell on Windows
- 8 GB RAM recommended

Check tools:

```powershell
docker --version
docker compose version
node --version
npm --version
```

Linux Docker install:

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker
docker compose version
```

## 3. One-Command Setup

From a fresh clone:

```powershell
git clone https://github.com/codeforgood1/finalsubmissionforsusclassieeecs.git
cd finalsubmissionforsusclassieeecs
```

Windows:

```powershell
.\setup.ps1
```

Linux/macOS:

```bash
chmod +x setup.sh
./setup.sh
```

The setup script creates `.env` with generated local secrets, starts PostgreSQL, waits for it to become ready, and lets Docker apply the database schema automatically from:

```text
backend/FRESH-COMPLETE-DATABASE.sql
backend/notification-system.sql
```

To reset the database volume and rerun schema initialization:

```powershell
.\setup.ps1 -Reset
```

```bash
./setup.sh --reset
```

To start the whole Docker app stack instead of only the database:

```powershell
.\setup.ps1 -StartApp
```

```bash
./setup.sh --start-app
```

The default stack is `docker-compose.local.yml`. For the full or production Compose files:

```powershell
.\setup.ps1 -Stack full
.\setup.ps1 -Stack prod
```

```bash
./setup.sh --stack full
./setup.sh --stack prod
```

## 4. Install Dependencies

Only needed when running the backend/frontend directly on your machine:

```powershell
cd D:\sus\backend
npm install

cd D:\sus\client
npm install
```

## 5. Environment Files

There is one env template and one runtime env file:

```text
.env.example  template committed to git
.env          generated runtime file used by Docker Compose, backend, and frontend
```

The old `backend/.env.example`, `client/.env.example`, `backend/.env`, and `client/.env` files are not needed. The backend now loads `../.env`, and Vite is configured to load env from the project root.

Normally, use `setup.ps1` or `setup.sh` to create `.env`. For reference, local development uses these values:

```env
DOCKER_HOST_ADDRESS=127.0.0.1
TZ=Asia/Kolkata
DB_USER=lms_user
DB_PASSWORD=lms_password
DB_NAME=lms_db
ADMIN_EMAIL=admin@classroom.local
ADMIN_PASSWORD=Admin@2026
JWT_SECRET=local_dev_jwt_secret_change_before_production_2026
JITSI_PUBLIC_URL=https://localhost:8443
JICOFO_AUTH_PASSWORD=jicofo-offline-2026
JICOFO_COMPONENT_SECRET=jicofo-component-offline-2026
JVB_AUTH_PASSWORD=jvb-offline-2026
PORT=5000
NODE_ENV=development
DATABASE_URL=postgresql://lms_user:lms_password@localhost:5432/lms_db
DB_SSL=false
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=524288000
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_SECURE=false
SMTP_IGNORE_TLS=true
EMAIL_DEV_MODE=false
EMAIL_FROM_NAME=Sustainable Classroom
EMAIL_FROM_ADDRESS=noreply@classroom.local
FRONTEND_URL=http://localhost:5173
JITSI_SERVER_URL=https://localhost:8443
ENABLE_REGISTRATION=true
ENABLE_PDF_GENERATION=true
ENABLE_CODE_EXECUTION=true
ENABLE_NOTIFICATIONS=true
OFFLINE_MODE=false
VITE_API_URL=http://localhost:5000
VITE_JITSI_SERVER_URL=https://localhost:8443
VITE_APP_MODE=development
VITE_DEBUG=true
```

Why `SMTP_HOST=localhost`: local `node server.js` runs on your machine, while MailHog runs in Docker and exposes port `1025` to localhost. In full Docker deployment, Compose overrides backend SMTP to `mailhog` inside the Docker network.

## 6. Local Development Flow

Use this during coding: Docker runs DB/MailHog/Jitsi; backend and frontend run locally.

Terminal 1, start local Docker services:

```powershell
cd D:\sus
.\setup.ps1
docker ps
```

Local services:

```text
PostgreSQL: localhost:5432
MailHog:    http://localhost:8025
Jitsi:      https://localhost:8443
```

Terminal 2, seed once and start backend:

```powershell
cd D:\sus\backend
node seed.js
node server.js
```

Daily backend start after seed:

```powershell
cd D:\sus\backend
node server.js
```

Terminal 3, start frontend:

```powershell
cd D:\sus\client
npm run dev
```

Open:

```text
http://localhost:5173
```

## 7. Default Accounts

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@classroom.local` | `Admin@2026` |
| Teacher | `susclass.global+sarah.teacher@gmail.com` | `password123` |
| Teacher | `susclass.global+emmanuel.teacher@gmail.com` | `password123` |
| Student | `susclass.global+amara@gmail.com` | `student123` |
| Student | `susclass.global+chidi@gmail.com` | `student123` |
| Student | `susclass.global+seun@gmail.com` | `student123` |

## 8. Useful Local Commands

Start only Postgres, MailHog, or Jitsi:

```powershell
docker compose -f docker-compose.local.yml up -d postgres
docker compose -f docker-compose.local.yml up -d mailhog
docker compose -f docker-compose.local.yml up -d jitsi-prosody jitsi-web jitsi-jicofo jitsi-jvb
```

Stop services, keep data:

```powershell
cd D:\sus
docker compose -f docker-compose.local.yml stop
```

Remove containers, keep data:

```powershell
cd D:\sus
docker compose -f docker-compose.local.yml down
```

Full local reset, deletes DB data:

```powershell
cd D:\sus
.\setup.ps1 -Reset
cd D:\sus\backend
node seed.js
```

Stop local Node processes:

```powershell
Get-Process -Name node | Stop-Process -Force
```

Build frontend production bundle:

```powershell
cd D:\sus\client
npm run build
```

Root Windows production build script:

```powershell
cd D:\sus
npm run build:win
```

## 9. Database Commands

PostgreSQL runs on `localhost:5432`, but `5432` is not a web page.

Do not open this in a browser:

```text
http://localhost:5432
```

That port speaks the PostgreSQL database protocol, not HTTP, so browsers show errors like `ERR_EMPTY_RESPONSE`. Use `psql` for terminal access or Adminer for a browser UI.

Open Postgres in the terminal:

```powershell
docker exec -it lms-db psql -U lms_user -d lms_db
```

Inside `psql`:

```sql
\dt
SELECT * FROM students LIMIT 5;
SELECT * FROM teachers LIMIT 5;
SELECT id, topic_title, subject, section, step_count FROM modules ORDER BY id DESC LIMIT 10;
\q
```

Manual Postgres-only setup, if not using the setup script or Compose:

```powershell
docker run -d --name lms-db `
  -e POSTGRES_USER=lms_user `
  -e POSTGRES_PASSWORD=lms_password `
  -e POSTGRES_DB=lms_db `
  -p 5432:5432 postgres:15-alpine

Start-Sleep 5
Get-Content backend\FRESH-COMPLETE-DATABASE.sql            | docker exec -i lms-db psql -U lms_user -d lms_db
Get-Content backend\notification-system.sql                | docker exec -i lms-db psql -U lms_user -d lms_db
cd backend
node seed.js
node server.js
```

Browser database UI with Adminer:

```powershell
docker rm -f lms-adminer
docker network ls
docker run -d --name lms-adminer --network sus_lms-local -p 8080:8080 adminer
```

```
To reuse without pulling again, just restart the existing container if it's stopped:
docker start lms-adminer
```

If your Compose network is not `sus_lms-local`, use the network from `docker network ls` that ends with `lms-local`.

Open:

```text
http://localhost:8080
```

Adminer login:

```text
System: PostgreSQL
Server: lms-db
Username: lms_user
Password: lms_password
Database: lms_db
```

Use Adminer only for viewing/editing database tables in the browser. The LMS app itself runs at `http://localhost:5173`.

## 10. MailHog

Open:

```text
http://localhost:8025
```

MailHog receives password reset emails and backend notification emails. In-app notifications appear inside the LMS notification bell, not in MailHog.

For local backend:

```env
SMTP_HOST=localhost
SMTP_PORT=1025
EMAIL_DEV_MODE=false
```

For backend inside Docker:

```env
SMTP_HOST=mailhog
SMTP_PORT=1025
```

## 11. Jitsi Live Sessions

Open once and accept the browser certificate:

```text
https://localhost:8443
```

Required env:

```env
JITSI_SERVER_URL=https://localhost:8443
VITE_JITSI_SERVER_URL=https://localhost:8443
```

Test:

1. Login as teacher.
2. Create a module with `Live Video (Jitsi)`.
3. Schedule it for now or within 15 minutes.
4. Login as student in the same section.
5. Join from the live session calendar or module step.

## 12. Feature Use and Test Flow

Admin first-time setup:

1. Login as admin.
2. Register teachers.
3. Register students or upload CSV.
4. Allocate sections if needed.

Teacher module flow:

1. Login as teacher.
2. Open Module Builder.
3. Create text, PDF, video, coding, MCQ, or Jitsi steps.
4. Publish to target section.

Bulk PDF upload:

1. Login as teacher.
2. Open Module Builder.
3. Click Bulk PDF Upload.
4. Fill module title, subject, and section.
5. Select PDF files.
6. Upload.
7. Login as student in that section and open the module.

Mixed media upload:

1. Login as teacher.
2. Open Module Builder.
3. Use Mixed Media Upload.
4. Upload PDFs and videos together.
5. PDFs become PDF steps; videos become video steps.

PDF storage:

```text
backend/uploads/documents/
```

Video storage:

```text
backend/uploads/videos/
```

Main upload endpoints:

```text
POST /api/teacher/upload-module-pdfs
POST /api/teacher/upload-module-mixed
```

## 13. API and Health Checks

Backend:

```text
http://localhost:5000
```

Health:

```powershell
curl http://localhost:5000/api/health
curl http://localhost:5000/api/health/detailed
```

Docker deployment health through nginx:

```powershell
curl http://localhost/api/health/detailed
```

Backend logs in full Docker:

```powershell
docker compose logs backend -f
docker compose logs backend --tail=40
```

Local Docker service status:

```powershell
docker compose -f docker-compose.local.yml ps
docker ps
```

## 14. Tests

Backend tests:

```powershell
cd D:\sus\backend
npm test
```

Notification DB test:

```powershell
cd D:\sus\backend
npm run test:notify
```

## 15. Full Docker Deployment

Use this for packaged deployment with backend, nginx, Postgres, MailHog, and Jitsi in Docker:

```powershell
cd D:\sus
docker compose up -d
docker compose ps
```

Open:

```text
http://localhost
```

Common deployment commands:

```powershell
docker compose stop
docker compose start
docker compose restart backend
docker compose logs backend -f
docker compose build backend --no-cache
docker compose up -d --force-recreate backend
docker compose down -v --remove-orphans
```

Update deployment:

```powershell
git pull
docker compose build backend --no-cache
docker compose up -d --force-recreate backend
```

Backup database in full Docker:

```powershell
docker compose exec postgres pg_dump -U lms_admin sustainable_classroom > backup.sql
```

Restore database in full Docker:

```powershell
docker compose exec -T postgres psql -U lms_admin sustainable_classroom < backup.sql
```

## 16. Optional Monitoring

Start:

```powershell
cd D:\sus
docker compose -f docker-compose.yml -f docker-compose.monitoring.yml up -d
```

Open:

```text
Grafana:    http://localhost:3001
Prometheus: http://localhost:9090
```

Stop monitoring:

```powershell
docker compose -f docker-compose.monitoring.yml down
```

## 17. Production Checklist

Before production:

- Change `JWT_SECRET`.
- Change `ADMIN_PASSWORD`.
- Set `DOCKER_HOST_ADDRESS` to the server LAN IP.
- Set `TZ` correctly.
- Open firewall ports.
- Test admin login.
- Test student login.
- Test teacher module creation.
- Test PDF/video upload.
- Test MailHog or real SMTP.
- Test Jitsi on the target devices.

Linux firewall:

```bash
sudo ufw allow 80/tcp
sudo ufw allow 8443/tcp
sudo ufw allow 10000/udp
sudo ufw enable
```

Optional Gmail SMTP:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-google-app-password
EMAIL_FROM_ADDRESS=your-email@gmail.com
```

Restart after SMTP changes:

```powershell
docker compose restart backend
```

## 18. Troubleshooting

`JWT_SECRET environment variable is not set`

```env
JWT_SECRET=local_dev_jwt_secret_change_before_production_2026
```

`password authentication failed for user "lms_admin"`

```env
DATABASE_URL=postgresql://lms_user:lms_password@localhost:5432/lms_db
```

Reset local DB if credentials were created differently:

```powershell
cd D:\sus
docker compose -f docker-compose.local.yml down -v
docker compose -f docker-compose.local.yml up -d
cd D:\sus\backend
node seed.js
```

`http://localhost:5432` does not open:

```text
PostgreSQL is not a browser UI. Use psql or Adminer.
```

MailHog inbox empty:

```env
SMTP_HOST=localhost
SMTP_PORT=1025
EMAIL_DEV_MODE=false
```

Jitsi not loading:

```powershell
docker compose -f docker-compose.local.yml restart jitsi-prosody jitsi-web jitsi-jicofo jitsi-jvb
```

Then open:

```text
https://localhost:8443
```

Port in use:

```powershell
netstat -ano | findstr :5000
netstat -ano | findstr :5173
netstat -ano | findstr :5432
netstat -ano | findstr :8025
netstat -ano | findstr :8443
```

Remove old manual DB container before Compose:

```powershell
docker stop lms-db
docker rm lms-db
docker compose -f docker-compose.local.yml up -d
```

PDF upload fails:

```text
Use PDF files only for bulk PDF upload.
Keep files under the configured 500 MB limit.
Check backend terminal logs.
```

Uploaded files not visible:

```powershell
Get-ChildItem D:\sus\backend\uploads\documents
Get-ChildItem D:\sus\backend\uploads\videos
```

Full Docker backend crash:

```powershell
docker compose logs backend --tail=40
docker compose build backend --no-cache
docker compose up -d --force-recreate backend
```
