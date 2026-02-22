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

Open `.env` and set **two values**:

```env
# 1. Your server's LAN IP address — run `ip addr show` or `hostname -I` to find it
#    Students/teachers connect to this IP from their browsers.
#    Set to 0.0.0.0 only for single-machine testing.
DOCKER_HOST_ADDRESS=192.168.1.100

# 2. Timezone — full list: https://en.wikipedia.org/wiki/List_of_tz_database_time_zones
TZ=Africa/Lagos
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
| Email viewer (debug) | `http://localhost:8025` |
| Jitsi video server | `https://localhost:8443` |

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

**Backend not starting**  
```bash
docker compose logs backend --tail=40
```
Most common cause: database still initialising. Wait 60 seconds, then:
```bash
docker compose restart backend
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

## Updating

```bash
git pull
docker compose down
docker compose up -d --build
```


---

## Table of Contents

1. [System Requirements](#system-requirements)
2. [Installation Steps](#installation-steps)
3. [Configuration](#configuration)
4. [Starting the System](#starting-the-system)
5. [Accessing the Application](#accessing-the-application)
6. [Admin Dashboard](#admin-dashboard)
7. [Optional: Email Configuration](#optional-email-configuration)
8. [Network Deployment](#network-deployment)
9. [Backup & Restore](#backup--restore)
10. [Troubleshooting](#troubleshooting)

---

## System Requirements

### Hardware (Minimum)
- **CPU:** 2 cores
- **RAM:** 4GB
- **Storage:** 20GB free space
- **Network:** Local network (no internet required)

### Hardware (Recommended)
- **CPU:** 4+ cores
- **RAM:** 8GB+
- **Storage:** 50GB+ SSD
- **Network:** Gigabit LAN for video streaming

### Software
- **Operating System:** Windows 10/11, Ubuntu 20.04+, macOS 11+
- **Docker Desktop:** Latest version
  - Windows/Mac: [Download Docker Desktop](https://www.docker.com/products/docker-desktop)
  - Linux: Install Docker Engine + Docker Compose
- **Git:** For cloning repository

---

## Installation Steps

### Step 1: Install Docker

#### Windows/macOS
1. Download and install [Docker Desktop](https://www.docker.com/products/docker-desktop)
2. Start Docker Desktop
3. Verify installation:
   ```powershell
   docker --version
   docker-compose --version
   ```

#### Linux (Ubuntu/Debian)
```bash
# Update package index
sudo apt update

# Install dependencies
sudo apt install -y ca-certificates curl gnupg lsb-release

# Add Docker's official GPG key
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

# Set up repository
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Add user to docker group (logout/login required)
sudo usermod -aG docker $USER

# Verify installation
docker --version
docker compose version
```

### Step 2: Clone Repository

```bash
git clone https://github.com/codeforgood1/finalsubmissionforsusclassieeecs.git
cd finalsubmissionforsusclassieeecs
```

### Step 3: Verify Files

Ensure the following files exist:
- `docker-compose.yml` - Main orchestration file
- `Dockerfile` - Application container definition
- `backend/.env.example` - Environment configuration template
- `nginx/nginx.conf` - Reverse proxy configuration

---

## Configuration

### Default Admin Credentials

The system comes pre-configured with admin credentials:

```
Email: admin@classroom.local
Password: Admin@2026
```

⚠️ **IMPORTANT:** Change these credentials after first login!

### Environment Variables (Optional)

The system works out-of-the-box with default settings. To customize:

```bash
# Copy example environment file
cp backend/.env.example backend/.env
```

Edit `backend/.env` if needed:

```env
# Database (Local PostgreSQL - no changes needed)
DATABASE_URL=postgresql://lms_admin:SecureLocalDB2026@postgres:5432/sustainable_classroom

# Admin Credentials (change these!)
ADMIN_EMAIL=admin@classroom.local
ADMIN_PASSWORD=Admin@2026

# JWT Secret (generate a random string for production)
JWT_SECRET=LocalDevSecret2026ClassroomChallenge

# Email (optional - see Email Configuration section)
SMTP_HOST=localhost
SMTP_PORT=1025
EMAIL_FROM_ADDRESS=noreply@classroom.local
```

---

## Starting the System

### One-Command Start

```bash
docker-compose up -d
```

This command:
1. Downloads all required Docker images
2. Creates and starts 8 containers:
   - PostgreSQL database
   - Redis cache
   - Backend API server
   - Nginx reverse proxy
   - Jitsi Web interface
   - Jitsi Prosody (XMPP server)
   - Jitsi Jicofo (conference focus)
   - Jitsi JVB (video bridge)

### Monitor Startup Progress

```bash
# View logs
docker-compose logs -f

# Check container status
docker-compose ps
```

All containers should show `Up` status after 1-2 minutes.

---

## Accessing the Application

### Local Access

**Main Application:**  
http://localhost

**Admin Dashboard:**  
http://localhost → Login with admin credentials

**Jitsi Video Conferencing:**  
https://localhost:8443  
⚠️ Accept self-signed certificate warning in browser

### First-Time Setup

1. Open browser and navigate to http://localhost
2. Login with admin credentials:
   - Email: `admin@classroom.local`
   - Password: `Admin@2026`
3. You'll be redirected to the Admin Dashboard

---

## Admin Dashboard

### Initial Setup Tasks

1. **Register Teachers**
   - Navigate to: Admin Dashboard → Register Teacher
   - Fill in teacher details (name, email, staff ID, department)
   - Assign sections to teacher

2. **Register Students**
   - Navigate to: Admin Dashboard → Register Student
   - Fill in student details (name, email, registration number, class, section)
   - **Note:** Class and section are case-insensitive (e.g., "ECE A" = "ece a")

3. **Create Courses/Modules**
   - Navigate to: Admin Dashboard → Module Builder
   - Create learning modules with text content, videos, or coding problems

4. **Create Tests**
   - Navigate to: Admin Dashboard → Test Knowledge
   - Create MCQ tests or upload via CSV template

### CSV Bulk Upload

For bulk student/teacher registration:

1. Download CSV template from Admin Dashboard
2. Fill in details following the format
3. Upload CSV file
4. System validates and imports data

**Sample CSV Format (Students):**
```csv
name,email,password,reg_no,class_dept,section
John Doe,john@example.com,password123,2024001,CSE,A
Jane Smith,jane@example.com,password456,2024002,ECE,B
```

---

## Optional: Email Configuration

Email notifications are **optional**. The system works fully offline without email.

### Option 1: No Email (Default)

System logs email content to console. No configuration needed.

### Option 2: Local Development (MailHog)

Already included in Docker Compose:

```env
SMTP_HOST=mailhog
SMTP_PORT=1025
```

View sent emails: http://localhost:8025

### Option 3: Production SMTP (Gmail)

Edit `backend/.env`:

```env
EMAIL_SERVICE=gmail
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-16-char-app-password
EMAIL_FROM_NAME=Sustainable Classroom
EMAIL_FROM_ADDRESS=your-email@gmail.com
```

**Getting Gmail App Password:**
1. Go to Google Account Settings
2. Security → 2-Step Verification
3. App Passwords → Generate new password
4. Copy 16-character password to `SMTP_PASSWORD`

### Option 4: Other SMTP Providers

```env
SMTP_HOST=smtp.yourprovider.com
SMTP_PORT=587
SMTP_SECURE=true
SMTP_USER=your-username
SMTP_PASSWORD=your-password
```

After changing `.env`, restart backend:
```bash
docker-compose restart backend
```

---

## Network Deployment

To access from other devices on your local network:

### Step 1: Find Server IP Address

**Windows:**
```powershell
ipconfig
```
Look for "IPv4 Address" (e.g., 192.168.1.100)

**Linux/macOS:**
```bash
ip addr show
# or
ifconfig
```

### Step 2: Update Frontend Configuration

Edit `client/src/config/api.js`:

```javascript
const API_BASE_URL = 'http://192.168.1.100:5000';  // Replace with your server IP
```

Rebuild frontend:
```bash
docker-compose restart backend
```

### Step 3: Configure Firewall

Allow incoming connections on ports:
- 80 (HTTP)
- 443 (HTTPS)
- 5000 (Backend API)
- 8443 (Jitsi)

**Windows Firewall:**
```powershell
netsh advfirewall firewall add rule name="LMS HTTP" dir=in action=allow protocol=TCP localport=80
netsh advfirewall firewall add rule name="LMS Backend" dir=in action=allow protocol=TCP localport=5000
netsh advfirewall firewall add rule name="LMS Jitsi" dir=in action=allow protocol=TCP localport=8443
```

**Linux (UFW):**
```bash
sudo ufw allow 80/tcp
sudo ufw allow 5000/tcp
sudo ufw allow 8443/tcp
```

### Step 4: Access from Other Devices

On student/teacher devices, open browser:
```
http://192.168.1.100
```

---

## Backup & Restore

### Database Backup

```bash
# Backup PostgreSQL database
docker-compose exec postgres pg_dump -U lms_admin sustainable_classroom > backup-$(date +%Y%m%d).sql

# Restore from backup
docker-compose exec -T postgres psql -U lms_admin sustainable_classroom < backup-20260203.sql
```

### Full System Backup

```bash
# Stop containers
docker-compose down

# Backup volumes
docker run --rm -v finalsubmissionforsusclassieeecs_postgres-data:/data -v $(pwd):/backup ubuntu tar czf /backup/postgres-backup.tar.gz /data

# Restart system
docker-compose up -d
```

### Automated Backup Script

Create `backup.sh`:

```bash
#!/bin/bash
BACKUP_DIR="./backups"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Database backup
docker-compose exec -T postgres pg_dump -U lms_admin sustainable_classroom > "$BACKUP_DIR/db-$DATE.sql"

# Delete backups older than 30 days
find $BACKUP_DIR -name "db-*.sql" -mtime +30 -delete

echo "Backup completed: $BACKUP_DIR/db-$DATE.sql"
```

Schedule with cron:
```bash
# Run daily at 2 AM
0 2 * * * /path/to/backup.sh
```

---

## Troubleshooting

### Container Won't Start

**Check logs:**
```bash
docker-compose logs backend
docker-compose logs postgres
```

**Common issues:**
- Port already in use → Change port in `docker-compose.yml`
- Insufficient disk space → Free up space and restart
- Docker daemon not running → Start Docker Desktop/service

### Database Connection Error

```bash
# Restart PostgreSQL
docker-compose restart postgres

# Check PostgreSQL logs
docker-compose logs postgres
```

### Jitsi Video Not Working

**Accept self-signed certificate:**
1. Navigate to https://localhost:8443
2. Click "Advanced" → "Proceed to localhost (unsafe)"
3. Return to main application

**Check Jitsi containers:**
```bash
docker-compose ps | grep jitsi
```

All 4 containers (web, prosody, jicofo, jvb) should be running.

### Permission Denied Errors (Linux)

```bash
# Fix Docker permissions
sudo chown -R $USER:$USER .
sudo chmod -R 755 backend/uploads
```

### Reset Admin Password

```bash
# Connect to PostgreSQL
docker-compose exec postgres psql -U lms_admin sustainable_classroom

# Generate new bcrypt hash (10 rounds) for "NewPassword123"
# Use online bcrypt generator or Node.js:
# const bcrypt = require('bcrypt'); bcrypt.hash('NewPassword123', 10, (err, hash) => console.log(hash));

# Update admin password
UPDATE admins SET password = '$2b$10$hashedPasswordHere' WHERE email = 'admin@classroom.local';
\q
```

### Clear All Data and Reset

```bash
# WARNING: This deletes all data!
docker-compose down -v
docker-compose up -d
```

System will recreate database with default admin account.

---

## System Management

### Stop System

```bash
# Stop containers (preserves data)
docker-compose stop

# Stop and remove containers (preserves data)
docker-compose down
```

### Restart System

```bash
docker-compose restart
```

### View Logs

```bash
# All containers
docker-compose logs -f

# Specific container
docker-compose logs -f backend
docker-compose logs -f postgres
```

### Update System

```bash
# Pull latest code
git pull origin main

# Rebuild and restart
docker-compose down
docker-compose up -d --build
```

---

## Performance Optimization

### For Large Deployments (100+ Users)

Edit `docker-compose.yml`:

```yaml
backend:
  deploy:
    resources:
      limits:
        cpus: '2'
        memory: 4G

postgres:
  environment:
    POSTGRES_SHARED_BUFFERS: 256MB
    POSTGRES_MAX_CONNECTIONS: 200
```

### Enable Redis Caching

Edit `backend/.env`:
```env
REDIS_ENABLED=true
```

Restart:
```bash
docker-compose restart backend
```

---

## Security Recommendations

1. **Change Default Credentials:**
   - Admin password
   - Database password (in `docker-compose.yml`)
   - JWT secret (in `backend/.env`)

2. **Generate Strong JWT Secret:**
   ```bash
   # Linux/macOS
   openssl rand -hex 32
   
   # Windows (PowerShell)
   -join ((1..32) | ForEach-Object { '{0:X2}' -f (Get-Random -Maximum 256) })
   ```

3. **Firewall Configuration:**
   - Only expose port 80/443 externally
   - Keep ports 5432, 6379 internal

4. **Regular Backups:**
   - Schedule automated daily backups
   - Test restore procedures monthly

5. **Update System:**
   - Pull latest updates monthly
   - Review changelog for security patches

---

## Support

For issues or questions:

1. Check logs: `docker-compose logs -f`
2. Review this troubleshooting section
3. Open GitHub issue: https://github.com/codeforgood1/finalsubmissionforsusclassieeecs/issues

---

## License

MIT License - Free for educational use

---

**Congratulations!** Your Sustainable Classroom LMS is now deployed and ready to use.
