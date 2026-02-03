# Sustainable Classroom LMS

**A comprehensive, offline-first Learning Management System for educational institutions**

Built for the Africa Sustainable Classroom Challenge, this LMS provides a complete suite of features for managing students, courses, assessments, and real-time communication - all deployable on-premise for maximum accessibility in low-connectivity environments.

---

## ✅ Complete Feature Set

All features below are **fully implemented and production-ready**:

### 🔐 **Student Registration & Role-Based Authentication (with MFA)**
- Multi-factor authentication for enhanced security
- Role-based access control (Admin, Teacher, Student)
- JWT-based session management
- Password reset and account recovery

### 📊 **Student Progress Tracking (Analytics & Reporting)**
- Real-time session time tracking with localStorage persistence
- Module completion analytics
- Test performance metrics
- Coding problem-solving statistics
- Comprehensive student dashboards

### 📝 **Knowledge Testing (MCQ-based Assessments)**
- Create and manage multiple-choice question tests
- Auto-grading with instant feedback
- CSV bulk test upload
- Score tracking and analytics
- Timed assessments with secure submission

### 🔔 **Notifications (Internal Messaging + Email/SMS)**
- In-app notification system with real-time updates
- Email notifications (optional SMTP configuration)
- Event-based triggers (account creation, test submission, etc.)
- User preference management for notification types

### 👤 **Student Profile Management**
- Customizable student profiles
- Academic record tracking
- Attendance monitoring
- Performance history

### 💻 **Course Management: Coding Workbench (Secure Web IDE)**
- In-browser code editor with syntax highlighting
- Multiple programming language support
- Automated test case validation
- Real-time code execution
- Submission history tracking

### 📚 **Course Management: Text-Based Learning Content (Local CMS)**
- Rich text module creation and editing
- Structured course organization
- Progress tracking per module
- Searchable content library

### 🎥 **Course Management: Video-Based Learning Content (Internal Media Server)**
- Local video hosting and streaming
- Integrated video player
- Watch progress tracking
- Bandwidth-optimized delivery

### 💬 **Real-Time Communication**
- Teacher-Student chat system
- Video conferencing via self-hosted Jitsi server
- Live session scheduling and calendar
- Classroom announcements

---

## 🚀 Technology Stack

**Frontend:** React 18, Vite, TailwindCSS, React Router  
**Backend:** Node.js, Express.js, PostgreSQL 15, Redis 7  
**Infrastructure:** Docker Compose, Jitsi Meet, Nginx  
**Authentication:** JWT with bcrypt password hashing  
**Storage:** Local filesystem + PostgreSQL JSONB

---

## 📋 Prerequisites

- **Docker Desktop** (Windows/Mac) or **Docker + Docker Compose** (Linux)
- **4GB RAM minimum** (8GB recommended)
- **20GB disk space**
- **Git** for cloning the repository

---

## 🎯 Quick Start

### 1. Clone Repository

```bash
git clone https://github.com/codeforgood1/finalsubmissionforsusclassieeecs.git
cd finalsubmissionforsusclassieeecs
```

### 2. Start All Services

```bash
docker-compose up -d
```

This command starts:
- PostgreSQL database
- Redis cache
- Backend API server
- Nginx reverse proxy
- Jitsi video conferencing server (4 containers)

### 3. Access Application

**Main Application:** http://localhost  
**Admin Login:**  
- Email: `admin@classroom.local`  
- Password: `Admin@2026`

---

## 📖 Full Documentation

For detailed deployment instructions, configuration options, and troubleshooting, see **[DEPLOYMENT.md](DEPLOYMENT.md)**.

---

## 🔒 Security Features

- JWT-based authentication with secure token storage
- Password hashing with bcrypt (10 rounds)
- Role-based access control (RBAC)
- CORS protection
- Rate limiting on authentication endpoints
- SQL injection prevention via parameterized queries
- XSS protection with content security policies

---

## 🌍 Offline-First Design

This LMS is designed to operate **completely offline** with one optional exception:

- ✅ **Fully Offline:** Database, file storage, video streaming, Jitsi conferencing, chat, assessments
- 📧 **Optional Online:** Email notifications (requires SMTP configuration - can be disabled)

Students and teachers can access all features without internet connectivity. Email notifications are the only feature requiring external connectivity, and the system gracefully handles offline mode by queuing emails for later delivery.

---

## � Technical Implementation

### Architecture Overview

**Multi-Container Docker Setup:**
- PostgreSQL 15 (primary data store)
- Redis 7 (session cache)
- Node.js/Express backend API
- React 18/Vite frontend (SPA)
- Nginx reverse proxy
- Jitsi Meet stack (4 containers: web, prosody, jicofo, jvb)

### Key Technical Features

**Database Schema:**
- Role-based tables: `admins`, `teachers`, `students`
- Content management: `modules`, `mcq_tests`, `coding_problems`
- Progress tracking: `test_submissions`, `student_submissions`, `module_completion`
- Notifications: `in_app_notifications`, `notification_preferences`
- Views for analytics: `v_teacher_students`, `v_student_coding_progress`

**Authentication & Security:**
- JWT tokens with 24-hour expiry
- bcrypt password hashing (10 rounds)
- Role-based middleware (`adminOnly`, `teacherOnly`, `studentOnly`)
- CORS protection with origin whitelisting
- SQL injection prevention via parameterized queries
- XSS protection with CSP headers

**Real-Time Features:**
- localStorage for timer persistence (syncs every 30s)
- Polling-based notifications (5-second intervals)
- WebSocket-ready architecture for future enhancements

**Offline Capabilities:**
- localStorage session persistence
- Email queuing system for offline scenarios
- Graceful degradation when SMTP unavailable
- Local file storage (no cloud dependencies)

**Video Conferencing:**
- Self-hosted Jitsi Meet at `https://localhost:8443`
- No external API calls or cloud services
- Peer-to-peer video streaming
- Recording capability (local storage)

**Data Normalization:**
- Case-insensitive class/section handling (e.g., "ECE A" = "ece a")
- Email format validation with regex
- Automatic timezone handling
- JSON validation for complex fields

### API Endpoints

**Authentication:**
- `POST /api/auth/login` - User login (all roles)
- `POST /api/auth/logout` - Session termination
- `POST /api/auth/send-otp` - MFA email delivery
- `POST /api/auth/verify-otp` - OTP validation

**Admin Operations:**
- `POST /api/admin/register-teacher` - Teacher account creation
- `POST /api/admin/register-student` - Student registration with auto-notification
- `PUT /api/admin/teacher/:id` - Update teacher details
- `PUT /api/admin/student/:id` - Update student details

**Teacher Operations:**
- `POST /api/teacher/test/create` - MCQ test creation (multi-section)
- `POST /api/teacher/module/create` - Learning module creation
- `GET /api/teacher/tests/:section` - Section test listing
- `GET /api/teacher/students/:section` - Student roster

**Student Operations:**
- `GET /api/student/tests` - Available tests listing
- `POST /api/student/test/submit` - Test submission with auto-grading
- `GET /api/student/modules` - Course modules access
- `POST /api/student/update-time` - Session time tracking

**Notifications:**
- `GET /api/notifications` - In-app notifications (paginated)
- `POST /api/notifications/mark-read` - Mark notification as read
- `PUT /api/notifications/preferences` - Update notification settings

### Deployment

**Docker Compose Services:**
```yaml
services:
  postgres:      # Port 5432 - Primary database
  redis:         # Port 6379 - Session cache
  backend:       # Port 5000 - API server
  nginx:         # Ports 80/443 - Reverse proxy
  jitsi-web:     # Port 8443 - Video conferencing UI
  jitsi-prosody: # XMPP server
  jitsi-jicofo:  # Conference focus
  jitsi-jvb:     # Video bridge
  mailhog:       # Port 8025 - Email testing
```

**Environment Variables:**
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - Token signing key
- `ADMIN_EMAIL` / `ADMIN_PASSWORD` - Default admin credentials
- `SMTP_*` - Optional email configuration
- `JITSI_SERVER_URL` - Local Jitsi instance URL

**Build Process:**
1. Frontend: `npm run build` (Vite production build)
2. Deploy: Copy `client/dist` → `backend/public`
3. Backend: Docker multi-stage build with bcrypt compilation
4. Database: Auto-migration on container start

### Performance Optimizations

- **Caching:** Redis for session data, in-memory cache for teacher allocations
- **Indexing:** Database indexes on email, reg_no, sections, timestamps
- **Pagination:** All list endpoints support limit/offset
- **Connection pooling:** PostgreSQL pool with 20 max connections
- **Compression:** Gzip enabled on Nginx for static assets
- **CDN-free:** All assets served locally (no external dependencies)

### Security Considerations

- Database credentials isolated in `.env` (gitignored)
- JWT secrets must be rotated in production
- HTTPS enforced for Jitsi (self-signed certs acceptable for local)
- File upload validation (size limits, type checking)
- Rate limiting on auth endpoints (100 req/15min)
- SQL injection protected via parameterized queries
- XSS protection with Content Security Policy headers

---

## 📞 Support & Community

- **Issues:** Report bugs or request features via GitHub Issues
- **Documentation:** See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed setup
- **License:** MIT License - free for educational use

---

## 🏆 Built For

**Africa Sustainable Classroom Challenge - Finals**  
Empowering education through accessible technologybash
docker exec -it lms-backend node /app/backend/seed.js
```

## Building for Production

### 1. Build Frontend

```bash
cd client
npm run build
```

### 2. Copy to Backend

```bash
cp -r client/dist/* backend/public/
```

### 3. Rebuild Backend Container

```bash
docker-compose build --no-cache backend
docker-compose up -d backend
```

## Architecture

```
┌─────────────────┐
│   Nginx (443)   │  SSL/TLS Termination
└────────┬────────┘
         │
    ┌────▼────┐
    │ Backend │  Express API (5000)
    └────┬────┘
         │
    ┌────▼────────────────┐
    │  PostgreSQL (5432)  │  Main Database
    └─────────────────────┘
    
    ┌─────────────────┐
    │  Redis (6379)   │  Session Cache
    └─────────────────┘
    
    ┌──────────────────────┐
    │  Jitsi (8443)        │  Video Conferencing
    │  ├─ prosody          │
    │  ├─ jicofo           │
    │  ├─ jvb              │
    │  └─ web              │
    └──────────────────────┘
```

## Configuration

### Jitsi Server

Jitsi runs locally at `https://localhost:8443`. Configuration in `docker-compose.yml`:

```yaml
jitsi-web:
  image: jitsi/web:stable-8719
  ports:
    - "8443:443"
```

### Database

PostgreSQL configuration:
- Database: `sustainable_classroom`
- User: `lms_admin`
- Password: Set via `DB_PASSWORD` env var (default: `SecureLocalDB2026`)

### Email (SMTP)

For email notifications, configure Gmail App Password:

1. Enable 2FA on your Google account
2. Generate App Password: https://myaccount.google.com/apppasswords
3. Add to `backend/.env`:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=16-char-app-password
```

## Common Issues

### Jitsi Not Loading

```bash
# Restart Jitsi containers
docker-compose restart jitsi-prosody jitsi-jicofo jitsi-jvb jitsi-web
```

### Database Connection Error

```bash
# Check database is running
docker ps | grep postgres

# View logs
docker logs lms-database
```

### Timer Not Persisting

Timer saves to localStorage every second and syncs to server every 30 seconds. If it resets:
1. Check browser localStorage is enabled
2. Verify `/api/student/update-time` endpoint works
3. Check server logs: `docker logs lms-backend`

## Security Notes

⚠️ **IMPORTANT FOR PRODUCTION:**

1. Change all default passwords in `.env`
2. Use strong JWT_SECRET
3. Enable HTTPS (certificates in `nginx/ssl/`)
4. Update CORS origins in `server.js`
5. Never commit `.env` files to Git

## Folder Structure

```
.
├── backend/          # Node.js API
│   ├── public/       # Frontend build output
│   ├── server.js     # Main server
│   ├── seed.js       # Database seeder
│   └── .env.example  # Environment template
├── client/           # React frontend
│   ├── src/
│   └── dist/         # Build output (gitignored)
├── nginx/            # Nginx configs
├── docker-compose.yml
├── .gitignore
└── README.md
```

## License

Educational project for sustainable classroom management.

## Support

For issues or questions, open an issue on GitHub.

---

**Built with ❤️ for CodeforGood**
