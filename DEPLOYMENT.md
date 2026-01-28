# Deployment Guide

This document covers deployment options for the Sustainable Classroom LMS.

---

## Table of Contents

1. [Quick Deployment](#quick-deployment)
2. [Docker Compose Deployment](#docker-compose-deployment)
3. [Production Deployment](#production-deployment)
4. [Manual Deployment](#manual-deployment)
5. [Environment Configuration](#environment-configuration)
6. [SSL/TLS Configuration](#ssltls-configuration)
7. [Database Management](#database-management)
8. [Monitoring](#monitoring)
9. [Troubleshooting](#troubleshooting)

---

## Quick Deployment

### Prerequisites
- Docker Engine 20.10+
- Docker Compose v2.0+
- 4GB RAM minimum
- 20GB disk space

### One-Command Deploy

Linux/Mac:
```bash
git clone https://github.com/susclassglobal-oss/susclasssrefine.git
cd susclasssrefine
./deploy.sh          # Development mode (local build)
./deploy.sh prod     # Production mode (pre-built images)
```

Windows:
```cmd
git clone https://github.com/susclassglobal-oss/susclasssrefine.git
cd susclasssrefine
deploy.bat           # Development mode (local build)
deploy.bat prod      # Production mode (pre-built images)
```

Development mode builds Docker images locally. Production mode pulls pre-built images from GitHub Container Registry.

---

## Docker Compose Deployment

### Services Overview

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| backend | ghcr.io/susclassglobal-oss/susclass-lms:latest | 5000 | API and frontend |
| postgres | postgres:15-alpine | 5432 | Database |
| redis | redis:7-alpine | 6379 | Cache |
| jitsi-web | jitsi/web:stable | 8443 | Video conferencing |
| jitsi-prosody | jitsi/prosody:stable | 5222 | XMPP server |
| jitsi-jicofo | jitsi/jicofo:stable | - | Focus component |
| jitsi-jvb | jitsi/jvb:stable | 10000/udp | Video bridge |
| mailhog | mailhog/mailhog:latest | 8025 | Local email |

### Start Services

```bash
# Pull images and start
docker-compose pull
docker-compose up -d

# Verify status
docker-compose ps

# Check health
curl http://localhost:5000/api/health
```

### Stop Services

```bash
# Stop containers
docker-compose down

# Stop and remove volumes (data loss)
docker-compose down -v
```

---

## Production Deployment

### Environment Setup

1. Create production .env file:

```env
NODE_ENV=production
PORT=5000

# Database
DATABASE_URL=postgresql://lms_admin:STRONG_PASSWORD@postgres:5432/sustainable_classroom
DB_SSL=false

# Security
JWT_SECRET=GENERATE_64_CHAR_RANDOM_STRING

# Admin
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_PASSWORD=STRONG_ADMIN_PASSWORD

# Email (Gmail)
GMAIL_USER=notifications@yourdomain.com
GMAIL_APP_PASSWORD=YOUR_APP_PASSWORD

# URLs
FRONTEND_URL=https://yourdomain.com

# Jitsi
JITSI_DOMAIN=meet.yourdomain.com
```

2. Generate secure JWT secret:
```bash
openssl rand -hex 64
```

### Nginx Reverse Proxy

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    location /socket.io {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

### SSL with Let's Encrypt

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

---

## Manual Deployment

### Without Docker

#### Prerequisites
- Node.js 18+
- PostgreSQL 15+
- Redis 7+ (optional)

#### Backend Setup

```bash
cd backend
npm install
cp .env.example .env
# Edit .env with database credentials
node server.js
```

#### Frontend Setup

```bash
cd client
npm install
npm run build
# Copy dist/ contents to backend/public/
```

#### Database Setup

```bash
psql -U postgres -c "CREATE DATABASE sustainable_classroom;"
psql -U postgres -c "CREATE USER lms_admin WITH PASSWORD 'password';"
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE sustainable_classroom TO lms_admin;"

cd backend
psql -U lms_admin -d sustainable_classroom -f FRESH-COMPLETE-DATABASE.sql
psql -U lms_admin -d sustainable_classroom -f add-module-progress-tracking.sql
psql -U lms_admin -d sustainable_classroom -f add-coding-submissions.sql
psql -U lms_admin -d sustainable_classroom -f add-inapp-notifications-table.sql
psql -U lms_admin -d sustainable_classroom -f add-chat-tables.sql
```

#### Process Manager

```bash
npm install -g pm2
pm2 start server.js --name lms-backend
pm2 save
pm2 startup
```

---

## Environment Configuration

### Required Variables

| Variable | Description | Default |
|----------|-------------|---------|
| DATABASE_URL | PostgreSQL connection string | - |
| JWT_SECRET | Token signing key | - |
| ADMIN_EMAIL | Admin account email | admin@classroom.local |
| ADMIN_PASSWORD | Admin account password | Admin@2026 |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| PORT | Server port | 5000 |
| NODE_ENV | Environment | development |
| DB_SSL | Enable SSL for database | false |
| GMAIL_USER | Gmail account | - |
| GMAIL_APP_PASSWORD | Gmail app password | - |
| REDIS_URL | Redis connection | redis://localhost:6379 |
| JITSI_DOMAIN | Jitsi server domain | localhost:8443 |

### Gmail Configuration

1. Enable 2-Factor Authentication on Google account
2. Generate App Password at https://myaccount.google.com/apppasswords
3. Set GMAIL_USER and GMAIL_APP_PASSWORD in .env

---

## SSL/TLS Configuration

### Self-Signed Certificate (Testing)

```bash
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout nginx/ssl/server.key \
  -out nginx/ssl/server.crt
```

### Let's Encrypt (Production)

```bash
sudo certbot certonly --standalone -d yourdomain.com
```

---

## Database Management

### Backup

```bash
# Docker
docker exec lms-database pg_dump -U lms_admin sustainable_classroom > backup.sql

# Local
pg_dump -U lms_admin -h localhost sustainable_classroom > backup.sql
```

### Restore

```bash
# Docker
docker exec -i lms-database psql -U lms_admin sustainable_classroom < backup.sql

# Local
psql -U lms_admin -h localhost sustainable_classroom < backup.sql
```

### Migrations

SQL migration files are in backend/ directory. Run in order:
1. FRESH-COMPLETE-DATABASE.sql
2. add-module-progress-tracking.sql
3. add-coding-submissions.sql
4. add-inapp-notifications-table.sql
5. add-chat-tables.sql

---

## Monitoring

### Health Check

```bash
curl http://localhost:5000/api/health
```

### Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend

# Last 100 lines
docker-compose logs --tail 100 backend
```

### Resource Usage

```bash
docker stats
```

---

## Troubleshooting

### Common Issues

#### Port Already in Use

```bash
# Find process
netstat -ano | findstr :5000
lsof -i :5000

# Kill process
taskkill /PID <PID> /F
kill -9 <PID>
```

#### Database Connection Failed

```bash
# Check database status
docker-compose ps postgres
docker exec -it lms-database pg_isready -U lms_admin

# View database logs
docker-compose logs postgres
```

#### Backend Not Starting

```bash
# View backend logs
docker-compose logs backend

# Check environment
docker-compose exec backend env | grep DATABASE_URL
```

#### Jitsi Not Working

```bash
# Check all Jitsi services
docker-compose ps | grep jitsi

# View Jitsi logs
docker-compose logs jitsi-web
docker-compose logs jitsi-jvb
```

### Reset Everything

```bash
# Stop all services
docker-compose down

# Remove volumes
docker volume prune -f

# Start fresh
docker-compose up -d
```

---

## Security Checklist

Before production deployment:

- [ ] Change default admin password
- [ ] Generate strong JWT_SECRET (64+ characters)
- [ ] Enable HTTPS with valid SSL certificate
- [ ] Configure firewall (allow only 80, 443, 22)
- [ ] Set DB_SSL=true for external databases
- [ ] Remove default test accounts
- [ ] Review and restrict CORS settings
- [ ] Enable rate limiting
- [ ] Set up log rotation
- [ ] Configure backup schedule

---

## Support

For issues and questions:
- GitHub: https://github.com/susclassglobal-oss/susclasssrefine/issues
