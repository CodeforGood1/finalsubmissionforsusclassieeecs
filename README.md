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
| Monitoring | Prometheus + Grafana |
| Real-time | Socket.IO, WebSockets |
| Container | Docker, Docker Compose |
| CI/CD | GitHub Actions |
| Reverse Proxy | Nginx |

---

## Quick Start

See [deploy.md](deploy.md) for detailed deployment instructions.

### Prerequisites
- Docker Engine 20.10+ and Docker Compose v2.0+
- Git installed
- 4GB RAM minimum, 8GB recommended
- 20GB free disk space

### Quick Deploy

```bash
git clone https://github.com/susclassglobal-oss/susclasssrefine.git
cd susclasssrefine
cp .env.example .env
# Edit .env with your settings
docker-compose up -d --build
```

Access at: http://localhost

### Service Access URLs

| Service | URL | Purpose |
|---------|-----|----------|
| Main Application | http://localhost | LMS Interface |
| Backend API | http://localhost:5000 | REST API |
| MailHog UI | http://localhost:8025 | Email Testing |
| Jitsi Video | https://localhost:8443 | Video Conferencing |
| Grafana (Optional) | http://localhost:3001 | Monitoring Dashboards |
| Prometheus (Optional) | http://localhost:9090 | Metrics & Alerts |

### Default Credentials

| Service | Username/Email | Password |
|---------|----------------|----------|
| Admin Account | admin@classroom.local | ChangeThisPassword |
| Grafana | admin | Admin@2026 |

⚠️ **Change these credentials after first login!**

---

## Email Configuration

The system uses **MailHog** by default - a local email server for testing (no internet required).

**View all emails**: http://localhost:8025

For production Gmail setup, configure `GMAIL_USER` and `GMAIL_APP_PASSWORD` in `.env`.

---

## Production Deployment

For deploying to production environments with 1000+ concurrent users on a LAN network:

📋 See: [PRODUCTION-DEPLOYMENT.md](PRODUCTION-DEPLOYMENT.md)

Includes:
- E:\ drive installation (not C:\)
- Kubernetes deployment manifests
- Kong API Gateway configuration
- VArchitecture

### System Components
- **Frontend**: React 18 with Vite build system
- **Backend**: Node.js/Express REST API
- **Database**: PostgreSQL 15 with connection pooling
- **Cache**: Redis 7 for session and API caching
- **Video**: Self-hosted Jitsi Meet
- **Email**: MailHog (dev) / Gmail (prod)
- **Deployment**: Docker Compose with multi-stage builds
- **CI/CD**: GitHub Actions with automated clean builds

### Build System
The project uses **Vite** with automatic cache clearing to prevent build issues:
- `npm run build` - Clean build (clears cache automatically)
- `npm run build:fresh` - Full clean build with dependency reinstall
- Docker builds use `--no-cache` to ensure fresh builds every time

This prevents the build cache issues that can occur when changes don't appear in production builds.
- Database: `sustainable_classroom`

### Cache (Redis 7)
- Container: `lms-cache`
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
- Components: Web UI, Prosody (XMPP), JVB (Video Bridge), Jicofo (Focus)

### Monitoring Stack (Optional)
**Prometheus** - Metrics Collection
- Container: `lms-prometheus`
- Port: 9090
- Scrapes metrics from backend, database, Redis
- 30-day retention period
- Custom alerting rules

**Grafana** - Visualization Dashboards
- Container: `lms-grafana`
- Port: 3001
- Pre-configured LMS dashboard
- Real-time system metrics
- User analytics and performance graphs

**Node Exporter** - System Metrics
- CPU, memory, disk usage
- Network statistics

**Postgres Exporter** - Database Metrics
- Query performance
- Connection pool stats
- Table sizes and indexes

**To enable monitoring:**
```bash
docker-compose -f docker-compose.yml -f docker-compose.monitoring.yml up -d
```

### Real-time Communication
- **Socket.IO** for WebSocket connections
- Real-time chat between students and teachers
- Live notification delivery
- Automatic reconnection handling
- Room-based message routing by section

### Reverse Proxy (Nginx)
- Container: `lms-proxy`
- Handles SSL/TLS termination
- Routes traffic to backend and static files
- Compression and caching
- Security headers

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
│   ├── server.js           # Main server (4200+ lines)
│   ├── notificationService.js
│   ├── localStorageService.js
│   ├── localEmailService.js
│   ├── *.sql               # Database migrations
│   ├── public/             # Static files (built frontend)
│   └── uploads/            # User-uploaded files
├── client/                  # React frontend
│   ├── src/
│   │   ├── components/     # UI components (Chat, etc.)
│   │   ├── pages/          # Page components (Dashboard, etc.)
│   │   └── config/         # API configuration
│   ├── vite.config.js      # Vite build config
│   └── package.json        # With clean build scripts
├── monitoring/
│   ├── prometheus.yml      # Metrics collection config
│   └── grafana-dashboard.json
├── nginx/                   # Reverse proxy config
├── .github/
│   └── workflows/          # GitHub Actions CI/CD
│       └── build.yml       # Clean builds with no cache
├── docker-compose.yml       # Main services stack
├── docker-compose.monitoring.yml  # Optional monitoring
├── Dockerfile              # Multi-stage build
├── README.md               # This file
├── deploy.md               # Deployment guide
└── .env.example            # Environment template
```

---

## Container Architecture

### Core Services (docker-compose.yml)

**lms-backend** (Backend + Frontend)
- Image: Built from Dockerfile (Node.js 20 Alpine)
- Port: 5000
- Serves React SPA and REST API
- Multi-stage build: frontend build → backend runtime
- Health check: HTTP GET /api/health
- Restart: unless-stopped

**lms-database** (PostgreSQL 15)
- Image: postgres:15-alpine
- Port: 5432
- Volume: postgres_data (persistent)
- Init scripts: 5 SQL migrations
- Health check: pg_isready
- Restart: unless-stopped

**lms-cache** (Redis 7)
- Image: redis:7-alpine
- Port: 6379
- Volume: redis_data (AOF persistence)
- Health check: redis-cli ping
- Restart: unless-stopped

**lms-mailserver** (MailHog)
- Image: mailhog/mailhog:latest
- Ports: 1025 (SMTP), 8025 (Web UI)
- No persistence needed
- Catches all outbound emails
- Restart: unless-stopped

**lms-proxy** (Nginx)
- Image: nginx:alpine
- Ports: 80, 443
- Routes traffic to backend
- SSL/TLS termination
- Restart: unless-stopped

**Jitsi Meet Stack** (4 containers)
- **lms-jitsi-web**: Web interface (port 8443)
- **lms-jitsi-prosody**: XMPP server (internal)
- **lms-jitsi-jicofo**: Focus component (internal)
- **lms-jitsi-jvb**: Video bridge (port 10000/UDP)

### Monitoring Services (docker-compose.monitoring.yml)

**lms-prometheus** - Metrics collection (port 9090)  
**lms-grafana** - Dashboards (port 3001)  
**lms-node-exporter** - System metrics (port 9100)  
**lms-postgres-exporter** - DB metrics (port 9187)

### Network Configuration
- **lms-network**: Bridge network for all containers
- Internal DNS: Containers resolve by service name
- Isolated: No external access except exposed ports

### Volume Persistence
- **postgres_data**: Database files
- **redis_data**: Cache snapshots
- **prometheus_data**: Metrics history
- **grafana_data**: Dashboards and config

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

#### MCQ CSV Upload Format

Teachers can upload MCQ questions via CSV file. The expected format:

```csv
Question,Option A,Option B,Option C,Option D,Correct Answer
What is the capital of France?,London,Berlin,Paris,Madrid,C
Which planet is known as the Red Planet?,Venus,Mars,Jupiter,Saturn,B
What is 2 + 2?,3,4,5,6,B
```

**CSV Format Rules:**
- First row is the header (optional, auto-detected)
- 6 columns: Question, Option A, Option B, Option C, Option D, Correct Answer
- Correct Answer must be A, B, C, or D (case-insensitive)
- Use quotes for text containing commas: `"What is 1,000 + 1,000?"`
- Minimum 5 questions required per test
- Sample file: [sample-mcq-questions.csv](sample-mcq-questions.csv)

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

The system operates **100% offline** with zero internet dependency:

### Fully Local Services
- **PostgreSQL database** - All data stored locally with automatic backups
- **Redis cache** - In-memory caching for performance
- **Backend API** - Node.js/Express running on local server
- **React frontend** - Served from local backend
- **MailHog email server** - Catches all emails locally (http://localhost:8025)
- **Jitsi Meet video server** - Self-hosted video conferencing (4 containers)
- **Nginx reverse proxy** - Handles routing and SSL
- **File storage** - Local disk storage for videos, PDFs, uploads
- **Prometheus + Grafana** - Local monitoring and analytics

### Features Available Offline
✅ All core learning features  
✅ Module creation and viewing  
✅ Video playback (uploaded videos)  
✅ PDF and text content  
✅ Coding workbench with test validation  
✅ MCQ assessments and grading  
✅ Live video sessions via local Jitsi  
✅ Real-time chat between users (Socket.IO)  
✅ Email notifications (viewable in MailHog)  
✅ Progress tracking and analytics  
✅ User authentication (JWT)  
✅ System monitoring (Prometheus/Grafana)  

### Optional Internet Features
- Gmail email delivery (if configured)
- External YouTube video URLs (if used in modules)
- Docker image pulls (only during initial deployment)

**The system runs indefinitely without internet after initial deployment.**

---

## Production Features

### Performance Optimization
- **Connection Pooling**: PostgreSQL max 20 connections
- **Redis Caching**: 5-minute TTL for API responses
- **Compression**: Gzip/Brotli for static assets
- **Static Asset Caching**: Browser cache headers
- **Database Indexing**: Optimized queries on user_id, module_id, section
- **Lazy Loading**: Frontend components and routes

### Scalability
- **Containerized Architecture**: Easy horizontal scaling
- **Stateless Backend**: JWT-based auth enables load balancing
- **Microservices Ready**: Separate services for database, cache, video
- **Volume Persistence**: Data survives container restarts
- **Health Checks**: Automatic container restart on failure

### Monitoring & Observability
- **Prometheus**: Metrics collection with 30-day retention
- **Grafana**: Real-time dashboards for system health
- **Node Exporter**: CPU, memory, disk metrics
- **Postgres Exporter**: Database performance metrics
- **Custom Metrics**: API response times, user activity, error rates
- **Alerting**: Configurable alerts for critical issues

### Security
- **JWT Authentication**: Secure token-based auth
- **Password Hashing**: bcrypt with salt rounds
- **SQL Injection Prevention**: Parameterized queries
- **CORS Protection**: Configured allowed origins
- **Helmet.js**: Security headers (CSP, XSS protection)
- **Rate Limiting**: Prevent brute force attacks
- **Environment Variables**: Secrets management
- **HTTPS Support**: SSL/TLS via Nginx (production)

### High Availability Features
- **Docker Health Checks**: Auto-restart unhealthy containers
- **Redis Persistence**: AOF (Append-Only File) mode
- **Database Backups**: Automated pg_dump scripts
- **Volume Mounts**: Persistent data storage
- **Graceful Shutdown**: Proper signal handling
- **Multi-container Stack**: Isolated service failures

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

### Basic Operations
```bash
# Start all services
docker-compose up -d --build

# Start with monitoring
docker-compose -f docker-compose.yml -f docker-compose.monitoring.yml up -d

# Clean rebuild (prevents cache issues)
docker-compose down
cd client && npm run build:fresh && cd ..
docker-compose build --no-cache backend
docker-compose up -d

# View logs
docker-compose logs -f backend
docker-compose logs -f postgres

# Stop services
docker-compose down

# Stop and remove volumes (data loss!)
docker-compose down -v

# View service status
docker-compose ps
```

### Database Operations
```bash
# Access database
docker exec -it lms-database psql -U lms_admin -d sustainable_classroom

# Backup database
docker exec lms-database pg_dump -U lms_admin sustainable_classroom > backup-$(date +%Y%m%d).sql

# Restore database
cat backup.sql | docker exec -i lms-database psql -U lms_admin -d sustainable_classroom
```

### Monitoring Commands
```bash
# View Prometheus metrics
curl http://localhost:9090/metrics

# Check system resources
docker stats

# View container health
docker inspect lms-backend | grep -A 10 Health
```

For detailed deployment steps, see [deploy.md](deploy.md).

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
