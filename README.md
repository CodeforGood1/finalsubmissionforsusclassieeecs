# Sustainable Classroom LMS

A fully offline Learning Management System with integrated video conferencing, real-time notifications, and comprehensive student tracking.

## Features

- **Offline-First Architecture**: Fully functional without internet (except SMTP for email)
- **Local Jitsi Server**: Private video conferencing at `https://localhost:8443`
- **Real-time Notifications**: In-app and email notifications
- **Session Time Tracking**: Persistent timer with localStorage + server sync
- **MCQ Testing**: Create and grade tests with automatic scoring
- **Module Learning**: Video content, quizzes, live sessions
- **Role-Based Access**: Admin, Teacher, Student portals
- **Chat System**: Real-time messaging between teachers and students
- **PostgreSQL Database**: Persistent data storage
- **Redis Cache**: Session management and caching
- **Nginx Reverse Proxy**: SSL/TLS termination

## Tech Stack

### Frontend
- React 18 + Vite
- TailwindCSS
- React Router
- localStorage for offline persistence

### Backend
- Node.js + Express
- PostgreSQL 15
- Redis 7
- JWT Authentication
- Nodemailer for email

### Infrastructure
- Docker Compose (multi-container orchestration)
- Jitsi Meet (local video conferencing)
- Nginx (reverse proxy)
- MailDev (local email testing)

## Prerequisites

- **Docker Desktop** (Windows/Mac) or Docker + Docker Compose (Linux)
- **Node.js 18+** (for local development)
- **Git**

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/CodeforGood1/finalsubmissionforsusclassieeecs.git
cd finalsubmissionforsusclassieeecs
```

### 2. Environment Setup

Copy example environment files:

```bash
# Root .env (optional - uses defaults)
cp .env.example .env

# Backend .env (REQUIRED for email)
cp backend/.env.example backend/.env
```

Edit `backend/.env`:

```env
# Required for email notifications
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password  # Get from Google Account settings

# JWT Secret (change in production)
JWT_SECRET=your-secret-key-here

# Admin Credentials (change these!)
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=secure-password-here
```

### 3. Start All Services

```bash
docker-compose up -d
```

This starts:
- PostgreSQL (port 5432)
- Redis (port 6379)
- Backend API (port 5000)
- Nginx (ports 80, 443)
- Jitsi (port 8443)
- MailDev (port 8025)

### 4. Access the Application

- **Main App**: http://localhost
- **Jitsi**: https://localhost:8443
- **Email Preview**: http://localhost:8025
- **API Health**: http://localhost:5000/api/health

### 5. Default Credentials

After seeding, use these to login:

**Teachers:**
- Email: `a@b.com` | Password: `password123`

**Students:**
- Email: `a@b.com` | Password: `password123`

**Admin:**
- Email: Set in `backend/.env` (ADMIN_EMAIL)
- Password: Set in `backend/.env` (ADMIN_PASSWORD)

## Development

### Frontend Development

```bash
cd client
npm install
npm run dev  # Starts dev server on port 5173
```

### Backend Development

```bash
cd backend
npm install
npm run dev  # Starts with nodemon
```

### Database Seeding

```bash
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
