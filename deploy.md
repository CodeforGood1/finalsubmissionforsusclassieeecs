# Deployment Guide

## Prerequisites
- Docker Engine 20.10+
- Docker Compose v2.0+
- 4GB RAM minimum
- 20GB disk space

## Quick Start

### 1. Clone Repository
```bash
git clone https://github.com/susclassglobal-oss/susclasssrefine.git
cd susclasssrefine
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env with your settings (database password, JWT secret, etc.)
```

### 3. Deploy
```bash
docker-compose up -d --build
```

### 4. Verify Deployment
```bash
docker-compose ps
curl http://localhost:5000/api/health
```

Access the application at `http://localhost` (port 80)

## Clean Rebuild (Prevents Cache Issues)

If you encounter build cache problems:

```bash
# Stop all containers
docker-compose down

# Clean client build cache
cd client
npm run clean
npm ci --production=false
npm run build
cd ..

# Clean Docker build cache and rebuild
docker-compose build --no-cache backend
docker-compose up -d
```

## Production Deployment

### SSL/TLS Configuration
1. Obtain SSL certificates (Let's Encrypt recommended)
2. Place certificates in `nginx/ssl/`
3. Update `docker-compose.yml` nginx volumes
4. Restart nginx: `docker-compose restart nginx`

### Database Backup
```bash
docker exec lms-database pg_dump -U lms_admin sustainable_classroom > backup-$(date +%Y%m%d).sql
```

### Update Deployment
```bash
git pull origin main
docker-compose down
docker-compose build --no-cache backend
docker-compose up -d
```

## Monitoring

### View Logs
```bash
docker-compose logs -f backend
docker-compose logs -f postgres
```

### Check Container Health
```bash
docker-compose ps
docker stats
```

## Troubleshooting

### Frontend Changes Not Visible
This happens due to Vite build cache. Solution:
```bash
cd client
npm run build:fresh  # Cleans all caches and rebuilds
cd ..
docker-compose build --no-cache backend
docker-compose up -d --force-recreate backend
```

### Database Connection Issues
```bash
docker-compose logs postgres
docker exec -it lms-database psql -U lms_admin -d sustainable_classroom
```

### Port Conflicts
If ports 80, 443, 5000, 5432, 6379 are in use:
1. Stop conflicting services
2. Or modify ports in `docker-compose.yml`

## Service URLs

| Service | URL | Description |
|---------|-----|-------------|
| Application | http://localhost | Main LMS interface |
| API | http://localhost:5000 | Backend API |
| Jitsi Video | https://localhost:8443 | Video conferencing |
| MailHog | http://localhost:8025 | Email testing interface |
| Database | localhost:5432 | PostgreSQL (internal) |
| Redis | localhost:6379 | Cache (internal) |

## Default Credentials

**Admin Account:**
- Email: `admin@classroom.local`
- Password: `ChangeThisPassword`

**⚠️ Change these immediately after first login!**

## CI/CD with GitHub Actions

The repository includes automated builds via GitHub Actions:
- Automatically builds on push to main branch
- Runs clean builds without cache to prevent issues
- Publishes Docker images to GitHub Container Registry

To deploy from pre-built images:
```bash
docker-compose pull
docker-compose up -d
```
