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

### One-Command Deployment

Linux/Mac:
```bash
git clone https://github.com/susclassglobal-oss/susclasssrefine.git
cd susclasssrefine
./deploy.sh          # Local build (dev mode)
./deploy.sh prod     # Pre-built images (production)
```

Windows:
```cmd
git clone https://github.com/susclassglobal-oss/susclasssrefine.git
cd susclasssrefine
deploy.bat           # Local build (dev mode)
deploy.bat prod      # Pre-built images (production)
```

The deployment script will:
1. Verify prerequisites
2. Create environment configuration
3. Pull pre-built images from GitHub Container Registry
4. Start all services
5. Run health checks
6. Display access information

### Access Points

| Service | URL |
|---------|-----|
| Application | http://localhost:5000 |
| Jitsi Meet | http://localhost:8443 |
| Email Viewer | http://localhost:8025 |

### Default Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@classroom.local | Admin@2026 |
| Teacher | teacher@classroom.local | password123 |
| Student | student@classroom.local | student123 |

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

The system operates fully offline with these services:
- All core learning features
- Coding workbench and assessments
- Local video playback
- Internal Jitsi for live sessions
- MailHog for email testing
- Chat functionality

Internet required only for:
- Gmail email delivery (optional)
- External YouTube video URLs (optional)

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

Key environment variables in .env:

```env
# Database
DATABASE_URL=postgresql://lms_admin:password@postgres:5432/sustainable_classroom

# Security
JWT_SECRET=your-secret-key

# Admin
ADMIN_EMAIL=admin@classroom.local
ADMIN_PASSWORD=Admin@2026

# Email (Gmail - optional)
GMAIL_USER=your-email@gmail.com
GMAIL_APP_PASSWORD=your-app-password
```

See .env.example for complete configuration options.

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
