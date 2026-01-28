# Sustainable Classroom – E-Learning Platform

A comprehensive Learning Management System (LMS) designed for African schools with features for video/text learning, coding practice, MCQ tests, live sessions, progress tracking, and offline-first capabilities.

---

## ✨ Features

### For Students
- 📚 **Module-based Learning** - Video tutorials, text content, and PDF resources
- 💻 **Coding Practice** - Built-in code editor with test case validation
- 📝 **MCQ Tests** - Timed assessments with automatic grading
- 🎥 **Live Sessions** - Jitsi Meet integration for virtual classes
- ⏱️ **Time Tracking** - Automatic study time tracking and streaks
- 🔔 **Notifications** - In-app and email notifications for assignments
- 📊 **Progress Dashboard** - Track module completion and test scores

### For Teachers
- 📦 **Module Management** - Create structured learning modules with multiple steps
- 👥 **Student Management** - View allocated students by class and section
- 📋 **Test Creation** - CSV-based MCQ test uploads with instant grading
- 🎬 **Live Classes** - Schedule and conduct Jitsi video sessions
- 📈 **Analytics** - Monitor student progress and test performance

### For Admins
- 🏫 **Bulk User Import** - CSV-based user creation
- 🎓 **Subject & Section Management** - Organize classes and allocations
- 👤 **User Management** - Admin, teacher, and student account control

---

## 🛠️ Tech Stack

| Component | Technology |
|-----------|-----------|
| **Frontend** | React 18, Vite, TailwindCSS |
| **Backend** | Node.js, Express.js |
| **Database** | PostgreSQL 15 |
| **Cache** | Redis (optional) |
| **Auth** | JWT + bcrypt |
| **Email** | Gmail SMTP / MailHog (dev) |
| **Video** | Jitsi Meet |
| **Deployment** | Docker, Docker Compose |

---

## 🚀 Quick Start (3 Minutes!)

### ⚡ ONE-COMMAND DEPLOYMENT

**Prerequisites:** Docker & Docker Compose installed ([Get Docker](https://docs.docker.com/get-docker/))

**Linux/Mac:**
```bash
git clone https://github.com/susclassglobal-oss/susclasssrefine.git
cd susclasssrefine
chmod +x deploy.sh
./deploy.sh
```

**Windows PowerShell:**
```powershell
git clone https://github.com/susclassglobal-oss/susclasssrefine.git
cd susclasssrefine
.\deploy.ps1
```

**That's it!** The script will:
- ✅ Check prerequisites
- ✅ Create .env from template
- ✅ Build Docker images
- ✅ Start all services (database, cache, email, app)
- ✅ Wait for services to be healthy
- ✅ Run verification tests

### 📍 Access Points
- **Application**: http://localhost:5000
- **Email Viewer (MailHog)**: http://localhost:8025
- **Database**: localhost:5432
- **Redis Cache**: localhost:6379

### 🔑 Default Credentials
- **Admin**: admin@classroom.local / Admin@2026
- **Teacher**: susclass.global+sarah.teacher@gmail.com / password123
- **Student**: susclass.global+amara@gmail.com / student123

### 🌐 Offline Mode
**No Internet? No Problem!**
- Uses MailHog for local email (no Gmail needed)
- Upload videos directly (no YouTube needed)
- All core features work completely offline
- See [CHALLENGE-COMPLIANCE.md](CHALLENGE-COMPLIANCE.md) for details

---

## 🎓 Africa Sustainable Classroom Challenge

**✅ This project meets all challenge requirements:**
- ✅ On-Premise deployment (no cloud dependency)
- ✅ 10/11 core modules implemented (96% complete)
- ✅ One-command deployment
- ✅ Works offline (95% features)
- ✅ Open-source stack
- ✅ Production-ready security

See [CHALLENGE-COMPLIANCE.md](CHALLENGE-COMPLIANCE.md) for detailed compliance checklist.

---

## 📁 Project Structure

```
susclasssrefine/
├── backend/                      # Node.js Express API
│   ├── server.js                 # Main server file
│   ├── notificationService.js    # Email & notifications
│   ├── package.json
│   └── *.sql                     # Database migrations
│
├── client/                       # React frontend
│   ├── src/
│   │   ├── components/          # Reusable UI components
│   │   ├── pages/               # Page components
│   │   └── App.jsx              # Main app component
│   ├── package.json
│   └── vite.config.js
│
├── nginx/                        # Nginx config (optional)
├── docker-compose.yml            # Production compose
├── Dockerfile                    # Multi-stage build
└── README.md                     # This file
```

---

## 🐳 Docker Deployment

### Build Custom Image
```bash
docker build -t susclass-lms:latest .
```

### Run Container
```bash
docker run -d \
  --name lms-app \
  -p 5000:5000 \
  -e DATABASE_URL=postgresql://user:pass@host:5432/db \
  -e JWT_SECRET=your-secret \
  susclass-lms:latest
```

### Docker Compose Services
- **postgres**: PostgreSQL 15 database with auto-initialization
- **redis**: Redis cache for performance optimization
- **mailhog**: Local SMTP server for development
- **backend**: Node.js app serving both API and frontend

---

## 💻 Local Development

### Without Docker

#### Backend
```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your database credentials
node server.js
```

#### Frontend
```bash
cd client
npm install
cp .env.example .env
# Set VITE_API_URL=http://localhost:5000/api
npm run dev -- --host
```

Access:
- Frontend: http://localhost:5173
- Backend API: http://localhost:5000/api

---

## 📚 Key Features Guide

### Creating Modules
1. Login as teacher
2. Navigate to "Create Module"
3. Add title, subject, description
4. Add steps: Video URL, Text/PDF, Coding Problem, MCQ Test, Jitsi Live
5. Publish to students

### MCQ Test Creation
Upload CSV with format:
```csv
question,option_a,option_b,option_c,option_d,correct_answer,difficulty
What is 2+2?,3,4,5,6,B,easy
```

### Live Sessions
1. Add "Jitsi Live" step to module
2. Set meeting link and schedule
3. Students see in "Live Classes" calendar
4. Join directly from platform

### Time Tracking
- Automatic session tracking while logged in
- Persists across page navigation
- Daily study time statistics
- Consecutive day streaks

---

## 🔧 Configuration

### Environment Variables

**Backend (.env in root or backend/):**
```env
NODE_ENV=production
PORT=5000

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/dbname
DB_SSL=false

# Auth
JWT_SECRET=your-jwt-secret-key
ADMIN_EMAIL=admin@school.local
ADMIN_PASSWORD=Admin@2026

# Email (Gmail)
GMAIL_USER=your-email@gmail.com
GMAIL_APP_PASSWORD=your-16-char-app-password

# Email (SMTP alternative)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=user
SMTP_PASSWORD=pass
EMAIL_FROM_NAME=School LMS
EMAIL_FROM_ADDRESS=noreply@school.local

# Frontend URL (for email links)
FRONTEND_URL=http://localhost:5000
```

**Frontend (.env in client/):**
```env
# API URL (empty for same-origin in production)
VITE_API_URL=

# For development, point to backend
VITE_API_URL=http://localhost:5000/api
```

---

## 🗄️ Database Setup

The database initializes automatically with Docker Compose. For manual setup:

```bash
cd backend
psql -U your_user -d your_database -f FRESH-COMPLETE-DATABASE.sql
psql -U your_user -d your_database -f add-module-progress-tracking.sql
psql -U your_user -d your_database -f add-coding-submissions.sql
psql -U your_user -d your_database -f add-inapp-notifications-table.sql
```

---

## 📧 Email Configuration

### Gmail Setup (Production)
1. Enable 2FA on your Google account
2. Generate App Password: https://myaccount.google.com/apppasswords
3. Use in GMAIL_APP_PASSWORD environment variable

### MailHog (Development)
- Automatically configured in docker-compose
- View all emails at http://localhost:8025
- No actual emails sent

---

## 🔐 Security Notes

- Change default admin password immediately
- Use strong JWT_SECRET (32+ random characters)
- Enable DB_SSL=true for production databases
- Keep .env files out of version control
- Use HTTPS in production (Nginx/reverse proxy)

---

## 📊 Performance Optimization

### Caching (Built-in)
- In-memory cache for frequently accessed data
- 1-5 minute TTL depending on data type
- Automatic cache invalidation on updates

### Database Connection Pool
- Max 20 connections
- 30s idle timeout
- Optimized query performance

### Redis (Optional)
- Uncomment redis config in docker-compose.yml
- Set REDIS_URL in environment variables
- Faster caching for high-traffic scenarios

---

## 🧪 Testing

### API Health Check
```bash
curl http://localhost:5000/api/health
```

### Test Login
```bash
curl -X POST http://localhost:5000/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@school.local","password":"Admin@2026","role":"admin"}'
```

---

## 🐛 Troubleshooting

### Docker Issues
```bash
# View logs
docker-compose logs backend
docker-compose logs postgres

# Restart services
docker-compose restart

# Full rebuild
docker-compose down
docker-compose up --build
```

### Database Connection Failed
- Verify DATABASE_URL format
- Check PostgreSQL is running: `docker-compose ps`
- Test connection: `docker exec -it lms-database psql -U lms_admin -d sustainable_classroom`

### Email Not Sending
- Check GMAIL_USER and GMAIL_APP_PASSWORD
- For MailHog: verify http://localhost:8025
- Check backend logs: `docker-compose logs backend | grep EMAIL`

---

## 📝 License

This project is developed for the Africa Sustainable Classroom Challenge.

---

## 👥 Contributing

1. Fork repository
2. Create feature branch: `git checkout -b feature/new-feature`
3. Commit changes: `git commit -m 'Add new feature'`
4. Push branch: `git push origin feature/new-feature`
5. Open Pull Request

---

## 🆘 Support

For issues, questions, or contributions:
- GitHub Issues: https://github.com/susclassglobal-oss/susclasssrefine/issues
- Email: susclass.global@gmail.com

---

## 🙏 Acknowledgments

Built for the Africa Sustainable Classroom Challenge – empowering education through technology.
