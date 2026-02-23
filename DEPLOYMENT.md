# Deployment Guide — Sustainable Classroom LMS

Offline-first LMS designed to run entirely on a local server with no internet required.

---

## Requirements

- Docker Engine + Docker Compose plugin (or Docker Desktop)
- Git
- 4 GB RAM minimum, 8 GB recommended
- 20 GB free disk space

### Install Docker on Ubuntu/Debian (Linux server)

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker          # apply group without logout
docker compose version # verify
```

---

## Deployment Steps

### 1. Clone the repository

```bash
git clone https://github.com/codeforgood1/finalsubmissionforsusclassieeecs.git
cd finalsubmissionforsusclassieeecs
```

### 2. Create the environment file

```bash
cp .env.example .env
```

Open `.env` and set **three values**:

```env
# 1. Your server's LAN IP address — run `ip addr show` or `hostname -I` to find it
#    Students/teachers connect to this IP from their browsers.
#    Set to 0.0.0.0 only for single-machine testing.
DOCKER_HOST_ADDRESS=192.168.1.100

# 2. Timezone — full list: https://en.wikipedia.org/wiki/List_of_tz_database_time_zones
TZ=Africa/Lagos

# 3. Secure random secret for JWT tokens — MUST change before going live
#    Generate one: openssl rand -hex 32
JWT_SECRET=replace-this-with-a-long-random-string
```

Everything else in `.env` has working defaults and does **not** need to change for a standard deployment.

### 3. Start the system

```bash
docker compose up -d
```

First run downloads images (~1 GB). Takes 2–5 minutes depending on connection.  
Subsequent starts are near-instant.

> **First-run note:** On the very first start, the database initialises itself from the SQL schemas.  
> Wait **2 minutes** before opening the app to ensure all tables are ready.

### 4. Verify all containers are running

```bash
docker compose ps
```

Expected output — all 8 services should show `Up`:

```
NAME                STATUS
lms-backend         Up (healthy)
lms-database        Up (healthy)
lms-proxy           Up
lms-mailserver      Up
lms-jitsi-web       Up
lms-jitsi-prosody   Up
lms-jitsi-jicofo    Up
lms-jitsi-jvb       Up
```

If `lms-backend` shows `health: starting`, wait 30 seconds and check again.

---

## Access the Application

| Who | URL |
|-----|-----|
| Everyone on the LAN | `http://<server-IP>` |
| Admin (same machine) | `http://localhost` |
| Direct API / test | `http://localhost:5000` |
| Email viewer (debug) | `http://localhost:8025` |
| Jitsi video server | `https://localhost:8443` |
| Grafana (if monitoring started) | `http://localhost:3001` |
| Prometheus (if monitoring started) | `http://localhost:9090` |

> `http://localhost` (port 80) goes through nginx — recommended for normal use.  
> `http://localhost:5000` hits the backend directly, bypassing nginx — useful for API testing or when running on the same machine.

### Default Admin Credentials

```
Email:    admin@classroom.local
Password: Admin@2026
```

> Change these in `.env` (`ADMIN_EMAIL` / `ADMIN_PASSWORD`) before going live, then restart: `docker compose restart backend`

---

## First-Time Setup

1. Log in as admin at `http://<server-IP>`
2. **Register Teachers** — Admin Dashboard → Register Teacher
3. **Register Students** — Admin Dashboard → Register Student  
   *(or upload bulk CSV — download template from the dashboard)*
4. **Create Modules** — Teacher dashboard → Module Builder
5. **Create Tests** — Teacher dashboard → Test Knowledge

Students and teachers log in at the same URL using their registered email + password.

---

## Common Operations

```bash
# Stop (preserves all data)
docker compose stop

# Start again
docker compose start

# View backend logs
docker compose logs backend -f

# Full reset — DELETES ALL DATA
docker compose down -v --remove-orphans && docker compose up -d

# Backup database
docker compose exec postgres pg_dump -U lms_admin sustainable_classroom > backup-$(date +%F).sql

# Restore database
docker compose exec -T postgres psql -U lms_admin sustainable_classroom < backup-2026-02-22.sql
```

---

## Troubleshooting

**Backend not starting / keeps restarting**  
```bash
docker compose logs backend --tail=40
```
Common causes:
- *Database still initialising* — wait 60 seconds, then `docker compose restart backend`
- *`SyntaxError: Unexpected end of JSON input` in package.json* — the image was built incorrectly. Fix with a clean rebuild:
```bash
docker compose build backend --no-cache
docker compose up -d --force-recreate backend
```

**Video calls not connecting from other devices**  
Your `DOCKER_HOST_ADDRESS` in `.env` must be the server's real LAN IP, not `0.0.0.0` or `127.0.0.1`.
```bash
hostname -I     # shows all IPs; use the 192.168.x.x one
```
Then update `.env` and restart:
```bash
docker compose restart jitsi-jvb
```

**Jitsi certificate warning in browser**  
Navigate to `https://<server-IP>:8443`, click Advanced → Proceed. Do this once per browser.

**Check system health**  
```bash
curl http://localhost/api/health/detailed
```

**Full reset (wipes all data)**  
```bash
docker compose down -v --remove-orphans
```

---

## Firewall (Linux server)

```bash
sudo ufw allow 80/tcp    # main app
sudo ufw allow 8443/tcp  # jitsi web
sudo ufw allow 10000/udp # jitsi video bridge
sudo ufw enable
```

---

## Monitoring (Optional — Prometheus + Grafana)

The monitoring stack is **not started by default**. It adds Prometheus (metrics collection), Grafana (dashboards), and exporters for system and database metrics.

Start it alongside the main stack:

```bash
docker compose -f docker-compose.yml -f docker-compose.monitoring.yml up -d
```

| Tool | URL | Credentials |
|------|-----|-------------|
| Grafana dashboards | `http://localhost:3001` | `admin` / value of `GRAFANA_PASSWORD` in `.env` (default: `Admin@2026`) |
| Prometheus raw metrics | `http://localhost:9090` | none |

To stop just monitoring (without touching the main app):

```bash
docker compose -f docker-compose.monitoring.yml down
```

> The monitoring stack is purely optional. The LMS runs fine without it.

---

## Deploying Without Email (Recommended for Schools)

By default the stack includes MailHog, a local mail server used only for **password reset OTP codes**. Every other feature — login, modules, tests, coding, video calls, notifications — works with no email at all.

**Why you may want to disable it:** With MailHog running, students can request a password-reset code for any email address (including other students'). Removing MailHog disables the password reset flow entirely, so only an admin can change passwords — which is the safer default in a supervised school environment.

To deploy without MailHog, open `docker-compose.yml` and comment out or delete the `mailhog` service block and the related `backend` environment variables:

```yaml
# Comment out or delete this entire block:
  # mailhog:
  #   image: mailhog/mailhog:latest
  #   container_name: lms-mailserver
  #   ports:
  #     - "1025:1025"
  #     - "8025:8025"
  #   networks:
  #     - lms-network
  #   restart: unless-stopped

# And comment out these lines inside the backend → environment section:
  #     SMTP_HOST: mailhog
  #     SMTP_PORT: 1025
  #     SMTP_SECURE: "false"
  #     SMTP_IGNORE_TLS: "true"
  #     EMAIL_FROM_NAME: Sustainable Classroom
  #     EMAIL_FROM_ADDRESS: noreply@classroom.local
```

Then start normally:

```bash
docker compose up -d
```

Only 7 containers will start. If a student requests a password reset, the page will say "code sent" but no code will ever be delivered — so the reset cannot be completed. Only an admin can change passwords from the Admin Dashboard.

---

## Updating

```bash
git pull
docker compose build backend --no-cache
docker compose up -d --force-recreate backend
```

> Always use `--no-cache` when updating. Skipping it can result in a corrupted image (0-byte files) that causes the backend to crash on start.

