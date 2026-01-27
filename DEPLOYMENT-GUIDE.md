# 🏫 Africa Sustainable Classroom - On-Premise Deployment Guide

## Overview

This guide provides step-by-step instructions for deploying the Sustainable Classroom LMS as a fully **offline, on-premise solution**. The system is designed to work without internet connectivity, making it ideal for schools in rural or underserved areas.

---

## 📋 Table of Contents

1. [System Requirements](#system-requirements)
2. [Architecture Overview](#architecture-overview)
3. [Quick Start with Docker](#quick-start-with-docker)
4. [Manual Installation](#manual-installation)
5. [Configuration](#configuration)
6. [Jitsi Video Conferencing Setup](#jitsi-video-conferencing-setup)
7. [LAN Deployment](#lan-deployment)
8. [Security Configuration](#security-configuration)
9. [Backup & Recovery](#backup--recovery)
10. [Troubleshooting](#troubleshooting)

---

## 🖥️ System Requirements

### Minimum Hardware
| Component | Requirement |
|-----------|-------------|
| CPU | 4 cores (x64) |
| RAM | 8 GB |
| Storage | 100 GB SSD |
| Network | 100 Mbps LAN |

### Recommended Hardware (50+ users)
| Component | Requirement |
|-----------|-------------|
| CPU | 8 cores (x64) |
| RAM | 16 GB |
| Storage | 500 GB SSD |
| Network | 1 Gbps LAN |

### Software Requirements
- **OS**: Ubuntu 22.04 LTS / Windows Server 2019+ / CentOS 8+
- **Docker**: 24.0+ with Docker Compose 2.0+
- **Node.js**: 18.0+ (for manual installation)
- **PostgreSQL**: 15+ (for manual installation)

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    SUSTAINABLE CLASSROOM LMS                │
│                    On-Premise Architecture                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐    ┌──────────────┐    ┌──────────────┐   │
│  │   Nginx     │    │   Backend    │    │  PostgreSQL  │   │
│  │ (Reverse    │◄───│   (Node.js)  │◄───│  (Database)  │   │
│  │  Proxy)     │    │              │    │              │   │
│  └─────────────┘    └──────────────┘    └──────────────┘   │
│         │                  │                    │          │
│         │           ┌──────────────┐    ┌──────────────┐   │
│         │           │    Redis     │    │   MailHog    │   │
│         │           │  (Caching)   │    │   (Email)    │   │
│         │           └──────────────┘    └──────────────┘   │
│         │                                                   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                  Local File Storage                   │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐           │  │
│  │  │  Videos  │  │  Images  │  │Documents │           │  │
│  │  └──────────┘  └──────────┘  └──────────┘           │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │               Optional: Self-Hosted Jitsi             │  │
│  │                  (Video Conferencing)                 │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start with Docker

### Step 1: Clone the Repository

```bash
git clone https://github.com/susclassglobal-oss/finalsubmission.git
cd finalsubmission
```

### Step 2: Configure Environment

```bash
# Copy environment template
cp .env.example .env

# Edit configuration
nano .env
```

**Minimum required changes:**
```env
# Generate secure secrets
JWT_SECRET=<generate-a-secure-random-string>
DATABASE_URL=postgresql://lms_user:secure_password@postgres:5432/lms_db

# Set to your server's IP for LAN access
SERVER_HOST=192.168.1.100
```

### Step 3: Start the Stack

```bash
# Build and start all services
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f
```

### Step 4: Initialize Database

```bash
# Run database migrations (first time only)
docker-compose exec backend npm run migrate

# Seed initial data (optional)
docker-compose exec backend npm run seed
```

### Step 5: Access the Application

| Service | URL |
|---------|-----|
| LMS Frontend | http://localhost:80 |
| Backend API | http://localhost:5000 |
| MailHog (Dev Email) | http://localhost:8025 |

---

## 🔧 Manual Installation

For environments where Docker is not available.

### Step 1: Install Dependencies

**Ubuntu/Debian:**
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install PostgreSQL 15
sudo apt install -y postgresql-15 postgresql-contrib-15

# Install Redis
sudo apt install -y redis-server
```

### Step 2: Configure PostgreSQL

```bash
# Switch to postgres user
sudo -u postgres psql

# Create database and user
CREATE USER lms_user WITH PASSWORD 'your_secure_password';
CREATE DATABASE lms_db OWNER lms_user;
GRANT ALL PRIVILEGES ON DATABASE lms_db TO lms_user;
\q
```

### Step 3: Setup Backend

```bash
cd backend

# Install dependencies
npm install

# Configure environment
cp .env.example .env
nano .env

# Start the server
npm start
```

### Step 4: Build Frontend

```bash
cd client

# Install dependencies
npm install

# Build for production
npm run build

# The build output will be in dist/
```

### Step 5: Configure Nginx

```bash
# Install nginx
sudo apt install -y nginx

# Copy configuration
sudo cp nginx/nginx.conf /etc/nginx/nginx.conf

# Test and restart
sudo nginx -t
sudo systemctl restart nginx
```

---

## ⚙️ Configuration

### Backend Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Backend server port | `5000` |
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `JWT_SECRET` | JWT signing secret | Required |
| `DB_SSL` | Enable SSL for database | `false` |
| `SMTP_HOST` | SMTP server hostname | `mailhog` |
| `SMTP_PORT` | SMTP server port | `1025` |
| `UPLOAD_MAX_SIZE_MB` | Max upload size | `500` |
| `REDIS_ENABLED` | Enable Redis caching | `false` |
| `REDIS_HOST` | Redis server hostname | `localhost` |

### Frontend Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_URL` | Backend API URL | `http://localhost:5000` |
| `VITE_JITSI_SERVER_URL` | Self-hosted Jitsi URL | Empty (uses public) |

---

## 📹 Jitsi Video Conferencing Setup

### Option 1: Use Public Jitsi (Requires Internet)

No configuration needed. The app will automatically use `meet.jit.si`.

### Option 2: Self-Hosted Jitsi (Fully Offline)

```bash
# Clone Jitsi Docker
git clone https://github.com/jitsi/docker-jitsi-meet
cd docker-jitsi-meet

# Generate secrets
./gen-passwords.sh

# Configure
cp env.example .env

# Edit .env and set:
# - PUBLIC_URL=http://meet.classroom.local:8000
# - ENABLE_AUTH=0 (or configure authentication)

# Start Jitsi
docker-compose up -d
```

Update client environment:
```env
VITE_JITSI_SERVER_URL=http://meet.classroom.local:8000
```

---

## 🌐 LAN Deployment

### Step 1: Determine Server IP

```bash
# Linux
ip addr show | grep "inet "

# Windows
ipconfig
```

### Step 2: Update Configuration

**Backend `.env`:**
```env
CORS_ORIGIN=http://192.168.1.100
```

**Client `.env`:**
```env
VITE_API_URL=http://192.168.1.100:5000
```

### Step 3: Configure Firewall

```bash
# Allow HTTP (80)
sudo ufw allow 80/tcp

# Allow Backend (5000)
sudo ufw allow 5000/tcp

# Allow Jitsi (if self-hosted)
sudo ufw allow 8000/tcp
sudo ufw allow 10000/udp
```

### Step 4: Client Device Setup

On each student/teacher device, open a browser and navigate to:
```
http://192.168.1.100
```

---

## 🔒 Security Configuration

### 1. Enable HTTPS (Recommended)

Generate self-signed certificates for LAN deployment:

```bash
# Generate certificate
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/ssl/private/classroom.key \
  -out /etc/ssl/certs/classroom.crt
```

Update nginx configuration for HTTPS.

### 2. Database Encryption

Enable PostgreSQL encryption at rest:

```bash
# In postgresql.conf
ssl = on
ssl_cert_file = '/etc/ssl/certs/classroom.crt'
ssl_key_file = '/etc/ssl/private/classroom.key'
```

### 3. JWT Configuration

Generate a strong secret:
```bash
openssl rand -base64 64
```

### 4. Rate Limiting

Rate limiting is pre-configured:
- General API: 100 requests per 15 minutes
- Authentication: 10 attempts per 15 minutes

---

## 💾 Backup & Recovery

### Automated Backup Script

```bash
#!/bin/bash
# backup.sh - Run daily via cron

BACKUP_DIR=/backups
DATE=$(date +%Y%m%d_%H%M%S)

# Backup PostgreSQL
docker-compose exec -T postgres pg_dump -U lms_user lms_db > $BACKUP_DIR/db_$DATE.sql

# Backup uploads
tar -czf $BACKUP_DIR/uploads_$DATE.tar.gz ./uploads

# Rotate old backups (keep 7 days)
find $BACKUP_DIR -mtime +7 -delete

echo "Backup completed: $DATE"
```

### Restore from Backup

```bash
# Restore database
docker-compose exec -T postgres psql -U lms_user lms_db < backup_file.sql

# Restore uploads
tar -xzf uploads_backup.tar.gz -C ./
```

---

## 🔧 Troubleshooting

### Common Issues

#### 1. Container Won't Start

```bash
# Check logs
docker-compose logs backend

# Common fix: Check environment variables
docker-compose config
```

#### 2. Database Connection Failed

```bash
# Test connection
docker-compose exec backend npm run db:test

# Check PostgreSQL is running
docker-compose ps postgres
```

#### 3. File Uploads Not Working

```bash
# Check permissions
ls -la uploads/

# Fix permissions
chmod -R 755 uploads/
chown -R 1000:1000 uploads/
```

#### 4. Video Streaming Issues

```bash
# Check nginx configuration
docker-compose exec nginx nginx -t

# Ensure mp4 module is loaded
docker-compose exec nginx nginx -V | grep mp4
```

#### 5. Jitsi Connection Failed

```bash
# Check if Jitsi server is accessible
curl http://meet.classroom.local:8000/external_api.js

# Check firewall
sudo ufw status
```

---

## 📊 Performance Optimization

### 1. Enable Redis Caching

```env
REDIS_ENABLED=true
REDIS_HOST=redis
REDIS_PORT=6379
```

### 2. Nginx Caching

Static file caching is pre-configured. Adjust in `nginx/nginx.conf`:

```nginx
# Increase cache time for production
expires 7d;
```

### 3. Database Indexing

```sql
-- Add indexes for frequently queried columns
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_courses_teacher ON courses(teacher_id);
CREATE INDEX idx_assignments_course ON assignments(course_id);
```

---

## 📞 Support

For issues or questions:
- **GitHub Issues**: https://github.com/susclassglobal-oss/finalsubmission/issues
- **Documentation**: This guide

---

## 📜 License

Open-source under MIT License. See LICENSE file for details.

---

*Sustainable Classroom LMS - Empowering Education in Africa* 🌍
