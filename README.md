# Sustainable Classroom - On-Premise Student Learning System

An on-premise Learning Management System designed for educational institutions with limited connectivity. Built for the Africa Sustainable Classroom Challenge.

---

## Overview

Sustainable Classroom provides a complete e-learning platform that runs entirely on local infrastructure without cloud dependencies. Core features include module-based learning, coding workbench, MCQ assessments, video content, live sessions, progress tracking, and real-time chat.

---

## Features

### Student Features
- Module-based learning with video, text, and PDF content
- Integrated coding workbench with test case validation
- MCQ assessments with automatic grading
- Live video sessions via Jitsi Meet
- Progress tracking with study time and streaks
- Real-time chat with teachers
- In-app and email notifications

### Teacher Features
- Module creation with multiple step types
- Student management by class and section
- CSV-based MCQ test upload
- Live session scheduling
- Student progress analytics
- Real-time chat with students

### Admin Features
- Bulk user import via CSV
- Subject and section management
- Teacher-subject allocation
- System-wide analytics

---

## Technical Stack

| Component | Technology |
|-----------|------------|
| Frontend | React 18, Vite, TailwindCSS |
| Backend | Node.js, Express.js |
| Database | PostgreSQL 15 |
| Cache | Redis 7 |
| Video | Self-hosted Jitsi Meet |
| Email | MailHog (local) / Gmail (production) |
| Container | Docker, Docker Compose |
| CI/CD | GitHub Actions |

---

## Quick Start

### Prerequisites
- Docker and Docker Compose installed
- Git installed
- 4GB RAM minimum, 8GB recommended
- 10GB free disk space

### Local Deployment (All Services Run On-Premise)

This system runs 100% locally without cloud dependencies. All components including database, cache, email server, and video conferencing are self-hosted.

#### Step 1: Clone Repository
```bash
git clone https://github.com/susclassglobal-oss/susclasssrefine.git
cd susclasssrefine
```

#### Step 2: Configure Environment

Create `.env` file in the project root:

```env
# Database Configuration (Local PostgreSQL)
DATABASE_URL=postgresql://lms_admin:secure_password_here@postgres:5432/sustainable_classroom
POSTGRES_USER=lms_admin
POSTGRES_PASSWORD=secure_password_here
POSTGRES_DB=sustainable_classroom

# JWT Security (Generate Random Secret)
# Run: openssl rand -base64 32
JWT_SECRET=replace_with_random_32_character_string

# Admin Account Setup
ADMIN_EMAIL=admin@classroom.local
ADMIN_PASSWORD=Admin@2026

# Email Service (Local MailHog - No Internet Required)
# For local development, MailHog catches all emails at http://localhost:8025
MAILHOG_SMTP_PORT=1025
MAILHOG_UI_PORT=8025

# Optional: Gmail for Real Email Delivery
# Leave blank to use local MailHog
GMAIL_USER=
GMAIL_APP_PASSWORD=

# Redis Cache (Local)
REDIS_HOST=redis
REDIS_PORT=6379

# Jitsi Meet (Self-Hosted Video)
JITSI_DOMAIN=localhost:8443
ENABLE_LOCAL_JITSI=true

# Application Settings
NODE_ENV=production
PORT=5000
```

#### Step 3: Generate JWT Secret

Linux/Mac:
```bash
openssl rand -base64 32
```

Windows PowerShell:
```powershell
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | % {[char]$_})
```

Copy the generated string to `JWT_SECRET` in `.env` file.

#### Step 4: Deploy Services

Option A - Using Pre-Built Images (Recommended):
```bash
# Linux/Mac
./deploy.sh prod

# Windows
deploy.bat prod
```

Option B - Build Locally:
```bash
# Linux/Mac
./deploy.sh

# Windows
deploy.bat
```

The deployment script automatically:
1. Validates prerequisites (Docker, Git)
2. Creates environment configuration
3. Pulls or builds Docker images
4. Starts all services (database, cache, email, app, video)
5. Initializes database schema
6. Seeds default users
7. Runs health checks
8. Displays access URLs

#### Step 5: Verify Deployment

Check all services are running:
```bash
docker-compose ps
```

Expected services:
- lms-backend (Backend API)
- lms-frontend (React frontend)
- lms-database (PostgreSQL)
- lms-redis (Redis cache)
- lms-mailhog (Local email server)
- jitsi-meet (Video conferencing)

### Access Points

After successful deployment, access these URLs:

| Service | URL | Description |
|---------|-----|-------------|
| Application | http://localhost:5000 | Main LMS interface |
| Jitsi Meet | http://localhost:8443 | Self-hosted video conferencing |
| Email Viewer | http://localhost:8025 | Local email inbox (MailHog) |
| Database | localhost:5432 | PostgreSQL (internal access) |
| Redis | localhost:6379 | Cache server (internal access) |

All services run on your local machine. No external connections required.

### Default Credentials

Login credentials seeded during deployment:

| Role | Email | Password | Permissions |
|------|-------|----------|-------------|
| Admin | admin@classroom.local | Admin@2026 | Full system access |
| Teacher | teacher@classroom.local | password123 | Create modules, manage students |
| Student | student@classroom.local | student123 | View modules, submit work |

IMPORTANT: Change default passwords after first login in production deployments.

---

## Local Infrastructure Details

### Database (PostgreSQL 15)
- Runs in Docker container: `lms-database`
- Port: 5432 (internal network)
- Volume: `postgres_data` (persistent storage)
- User: `lms_admin`
- Database: `sustainable_classroom`
- Automatic schema initialization on first run

### Cache (Redis 7)
- Runs in Docker container: `lms-redis`
- Port: 6379 (internal network)
- Used for: Session management, API caching
- Cache TTL: 5 minutes default

### Email Server (MailHog)
- Runs in Docker container: `lms-mailhog`
- SMTP: Port 1025 (internal)
- Web UI: http://localhost:8025
- Catches all outbound emails locally
- No actual email delivery (perfect for testing)
- View OTP codes, notifications, test results

### Video Conferencing (Jitsi Meet)
- Self-hosted Jitsi Meet instance
- Port: 8443
- No external Jitsi servers required
- Privacy-focused local video calls
- Integrated into module live sessions

### JWT Authentication
- Stateless authentication using JSON Web Tokens
- Secret key: Must be generated randomly (32+ characters)
- Generation methods:
  - Linux/Mac: `openssl rand -base64 32`
  - Windows: PowerShell random string generator
  - Online: Use any secure random string generator
- Stored in `.env` as `JWT_SECRET`
- DO NOT use default or weak secrets in production

---

## Project Structure

```
susclasssrefine/
├── backend/                 # Node.js Express API
│   ├── server.js           # Main server
│   ├── notificationService.js
│   └── *.sql               # Database migrations
├── client/                  # React frontend
│   ├── src/
│   │   ├── components/     # UI components
│   │   └── pages/          # Page components
│   └── vite.config.js
├── .github/
│   └── workflows/          # GitHub Actions CI/CD
├── docker-compose.yml       # Development stack
├── docker-compose.prod.yml  # Production stack (pre-built images)
├── Dockerfile              # Multi-stage build
├── deploy.sh               # Linux/Mac deploy script
├── deploy.bat              # Windows deploy script
└── README.md
```

---

## Core Modules

### 1. Authentication
- JWT-based authentication
- Multi-factor authentication (MFA) with email OTP
- Role-based access control (Admin, Teacher, Student)
- Secure password hashing with bcrypt

### 2. Module Management
- Multi-step learning modules
- Step types: Video, Text, PDF, Coding, MCQ Test, Live Session
- Section-based access control
- Progress tracking per step

### 3. Coding Workbench
- Web-based code editor
- Multiple language support
- Test case validation
- Automatic scoring

### 4. Assessment System
- CSV-based MCQ upload
- Timed assessments
- Difficulty levels
- Automatic grading with analytics

### 5. Live Sessions
- Self-hosted Jitsi Meet integration
- Scheduled sessions in module steps
- Calendar view for upcoming sessions
- Optional: External Jitsi/YouTube URLs

### 6. Chat System
- Real-time faculty-student messaging
- Section-based chat rooms
- Message history
- Online status indicators

### 7. Notifications
- In-app notification system
- Email notifications via MailHog (local) or Gmail
- Module publish alerts
- Test assignment notifications

### 8. Analytics
- Student progress tracking
- Study time statistics
- Streak tracking
- Test performance analytics

---

## Offline Capability

The system operates 100% offline with zero internet dependency:

### Fully Local Services
- PostgreSQL database (all data stored locally)
- Redis cache (in-memory, local)
- Backend API (runs on host machine)
- React frontend (served from host)
- MailHog email server (catches emails locally)
- Jitsi Meet video server (self-hosted)
- File storage (local disk)

### Features Available Offline
- All core learning features
- Module creation and viewing
- Video playback (uploaded videos)
- PDF and text content
- Coding workbench with test validation
- MCQ assessments and grading
- Live video sessions via local Jitsi
- Real-time chat between users
- Email notifications (viewable in MailHog)
- Progress tracking and analytics
- User authentication (JWT)

### Optional Internet Features
- Gmail email delivery (if configured)
- External YouTube video URLs (if used in modules)
- Docker image pulls (only during deployment)

The system can run indefinitely without internet after initial deployment.

---

## Security

- JWT token authentication
- Password hashing with bcrypt
- SQL injection prevention via parameterized queries
- Role-based endpoint protection
- HTTPS support via nginx (production)
- Environment-based secrets management

---

## Performance

- In-memory caching with 5-minute TTL
- Redis cache integration
- PostgreSQL connection pooling (max 20)
- Optimized database queries
- Static asset caching

---

## Commands Reference

```bash
# Start services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down

# Restart services
docker-compose restart

# View service status
docker-compose ps

# Access database
docker exec -it lms-database psql -U lms_admin -d sustainable_classroom

# Full reset (removes data)
docker-compose down -v
docker-compose up -d
```

---

## Environment Configuration

Complete environment setup for local deployment. All values run on your local machine.

### Required Configuration

Create `.env` file with these essential settings:

```env
# ------------------------------------------
# DATABASE - Local PostgreSQL Container
# ------------------------------------------
DATABASE_URL=postgresql://lms_admin:your_secure_password@postgres:5432/sustainable_classroom
POSTGRES_USER=lms_admin
POSTGRES_PASSWORD=your_secure_password
POSTGRES_DB=sustainable_classroom

# ------------------------------------------
# JWT SECURITY - Generate Random Secret
# ------------------------------------------
# CRITICAL: Generate a random 32+ character string
# Method 1 (Linux/Mac): openssl rand -base64 32
# Method 2 (Windows PowerShell): -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | % {[char]$_})
# Method 3 (Online): Use random string generator
JWT_SECRET=REPLACE_THIS_WITH_RANDOM_STRING_32_CHARS_MINIMUM

# ------------------------------------------
# ADMIN ACCOUNT - Change After First Login
# ------------------------------------------
ADMIN_EMAIL=admin@classroom.local
ADMIN_PASSWORD=Admin@2026

# ------------------------------------------
# EMAIL - Local MailHog (No Internet)
# ------------------------------------------
# All emails caught locally at http://localhost:8025
MAILHOG_SMTP_PORT=1025
MAILHOG_UI_PORT=8025
EMAIL_FROM=noreply@classroom.local

# Optional: Real Gmail Delivery (Requires Internet)
# Leave blank to use local MailHog only
GMAIL_USER=
GMAIL_APP_PASSWORD=

# ------------------------------------------
# REDIS CACHE - Local Container
# ------------------------------------------
REDIS_HOST=redis
REDIS_PORT=6379
CACHE_TTL=300

# ------------------------------------------
# JITSI VIDEO - Self-Hosted Local Server
# ------------------------------------------
JITSI_DOMAIN=localhost:8443
ENABLE_LOCAL_JITSI=true

# ------------------------------------------
# APPLICATION SETTINGS
# ------------------------------------------
NODE_ENV=production
PORT=5000
FRONTEND_URL=http://localhost:5000
```

### Configuration Details

1. **Database Credentials**
   - Choose a secure password for `POSTGRES_PASSWORD`
   - Must match in both `DATABASE_URL` and `POSTGRES_PASSWORD` fields
   - Database runs in isolated Docker network

2. **JWT Secret Generation**
   - NEVER use default or example values
   - Must be random, unpredictable string
   - Minimum 32 characters recommended
   - Used to sign authentication tokens

3. **Email Setup**
   - Default: MailHog (local, no configuration needed)
   - View all emails at http://localhost:8025
   - No real emails sent (perfect for testing)
   - Optional: Configure Gmail for real delivery

4. **Jitsi Video**
   - Self-hosted on localhost
   - No external Jitsi account required
   - All video data stays on local network

See `.env.example` for additional optional configurations.

---

## Troubleshooting

### Services not starting
```bash
docker-compose logs backend
docker-compose logs postgres
```

### Port conflicts
```bash
# Check port usage
netstat -ano | findstr :5000

# Kill process
taskkill /PID <PID> /F
```

### Database connection issues
```bash
docker exec -it lms-database pg_isready -U lms_admin
```

---

## License

Developed for the Africa Sustainable Classroom Challenge.

---

## Support

- Repository: https://github.com/susclassglobal-oss/susclasssrefine
- Issues: https://github.com/susclassglobal-oss/susclasssrefine/issues
