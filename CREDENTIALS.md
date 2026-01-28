# 🔐 Sustainable Classroom LMS - Access Credentials & Endpoints

## Quick Reference Card

| Service | URL | Username | Password |
|---------|-----|----------|----------|
| **Admin Panel** | http://localhost | admin@classroom.local | Admin@2026 |
| **Teacher Login** | http://localhost | (any teacher email) | Test123 |
| **Student Login** | http://localhost | (any student email) | Test123 |
| **Grafana Monitoring** | http://localhost:3001 | admin | Admin@2026 |
| **Prometheus Metrics** | http://localhost:9090 | - | - |
| **MailHog (Emails)** | http://localhost:8025 | - | - |
| **Jitsi Video** | https://localhost:8443 | - | - |

---

## 🎯 Production Endpoints

### Main Application
- **Frontend**: http://localhost
- **API Base**: http://localhost/api
- **Health Check**: http://localhost/api/health
- **Detailed Health**: http://localhost/api/health/detailed
- **Prometheus Metrics**: http://localhost/api/metrics

### Monitoring Stack
- **Grafana Dashboards**: http://localhost:3001
  - Login: `admin` / `Admin@2026`
  - Import dashboard: `monitoring/grafana-dashboard.json`
- **Prometheus**: http://localhost:9090
  - Metrics explorer, targets, alerts
- **Node Exporter**: http://localhost:9100/metrics
- **Postgres Exporter**: http://localhost:9187/metrics

### Development Tools
- **MailHog (Email Testing)**: http://localhost:8025
  - SMTP: localhost:1025
- **PostgreSQL**: localhost:5432
  - DB: `sustainable_classroom`
  - User: `lms_admin`
  - Password: `SecureLocalDB2026`
- **Redis**: localhost:6379

---

## 👤 Test Accounts

### Admin Account
```
Email: admin@classroom.local
Password: Admin@2026
```
**Access to**: All admin features, system monitoring, user management

### Test Teacher
```
Email: susclass.global+teach1@gmail.com
Password: Test123
ID: 13
```
**Access to**: Module creation, student management, grade tracking

### Test Student
```
Email: student552486120@test.com
Password: Test123
ID: 2
Section: CSE A
```
**Access to**: Learning modules, tests, chat, video calls

---

## 🚀 Starting the Platform

### Basic Stack (Required)
```powershell
cd E:\susclassroom\refine
docker compose up -d
```

### With Monitoring (Optional)
```powershell
cd E:\susclassroom\refine
docker-compose -f docker-compose.yml -f docker-compose.monitoring.yml up -d
```

### Check Status
```powershell
docker ps
docker compose logs -f backend
```

---

## 🔧 Configuration Files

### Environment Variables
- **Development**: `backend/.env`
- **Production Override**: Set in `docker-compose.yml`

### Important Settings
```env
# Admin Credentials (MUST match docker-compose defaults)
ADMIN_EMAIL=admin@classroom.local
ADMIN_PASSWORD=Admin@2026

# Database
DATABASE_URL=postgresql://lms_admin:SecureLocalDB2026@postgres:5432/sustainable_classroom

# JWT Secret
JWT_SECRET=LocalDevSecret2026ClassroomChallenge

# Email (MailHog for development)
SMTP_HOST=mailhog
SMTP_PORT=1025
```

---

## 📊 System Monitoring

### View System Status (Admin Only)
```powershell
$token = (Invoke-RestMethod -Method POST -Uri "http://localhost/api/admin/login" `
  -ContentType "application/json" `
  -Body '{"email":"admin@classroom.local","password":"Admin@2026"}').token

Invoke-RestMethod -Uri "http://localhost/api/admin/system-status" `
  -Headers @{Authorization="Bearer $token"} | ConvertTo-Json -Depth 5
```

### View Prometheus Metrics
```powershell
Invoke-RestMethod -Uri "http://localhost/api/metrics"
```

---

## 🗄️ Database Access

### Connect to PostgreSQL
```powershell
docker exec -it lms-database psql -U lms_admin -d sustainable_classroom
```

### Common Queries
```sql
-- List all students
SELECT id, name, email, section FROM students;

-- List all teachers
SELECT id, name, email, dept FROM teachers;

-- Check teacher allocations
SELECT * FROM teacher_allocations;

-- View chat messages
SELECT * FROM chat_messages ORDER BY created_at DESC LIMIT 10;
```

---

## 🔒 Security Notes

### ⚠️ Important for Production Deployment

1. **Change Default Passwords**
   ```env
   ADMIN_PASSWORD=<your-secure-password>
   DB_PASSWORD=<your-db-password>
   JWT_SECRET=<generate-32-char-random-string>
   ```

2. **Enable SSL/TLS**
   - Configure nginx with SSL certificates
   - Set `DB_SSL=true` for database connections

3. **Configure Firewall**
   - Only expose port 80/443 externally
   - Block direct database/Redis access

4. **Regular Backups**
   ```powershell
   .\scripts\backup.ps1
   ```
   Or schedule with Task Scheduler (see backup.ps1 comments)

---

## 🛠️ Troubleshooting

### Login Returns 401 Unauthorized

**Problem**: Using wrong credentials
**Solution**: Use `admin@classroom.local` / `Admin@2026` (not admin@gmail.com / Admin@123)

### Grafana/Prometheus Not Loading

**Problem**: Monitoring stack not started
**Solution**: 
```powershell
docker-compose -f docker-compose.yml -f docker-compose.monitoring.yml up -d
```

### Container Not Starting

**Check logs**:
```powershell
docker logs lms-backend
docker logs lms-database
docker compose ps
```

**Rebuild if needed**:
```powershell
docker compose down
docker compose build --no-cache
docker compose up -d
```

### Database Connection Error

**Check database is healthy**:
```powershell
docker exec lms-database pg_isready -U lms_admin
```

**Restart database**:
```powershell
docker compose restart postgres
```

---

## 📦 Backup & Restore

### Manual Backup
```powershell
.\scripts\backup.ps1
```

Backup location: `E:\classroom-backups\`

### Restore from Backup
```powershell
# Find backup file
$backupFile = "E:\classroom-backups\database\sustainable_classroom_20260129-143000.sql.gz"

# Decompress if needed (or use uncompressed .sql file)
# Then restore:
Get-Content $backupFile | docker exec -i lms-database psql -U lms_admin -d sustainable_classroom
```

---

## 🌐 Versions & Updates

### Current Version
**v2.3.0** - Production Monitoring & Teacher Allocation Fix

### Version History
- `v2.3.0` - Prometheus metrics, Grafana dashboard, backup script
- `v2.2.6` - Chat discovery fix, section matching
- `v2.2.5` - Rate limiting improvements
- `v2.2.0` - Multi-section support

### Check for Updates
```powershell
git pull origin main
docker compose build --no-cache
docker compose up -d
```

---

## 📧 Support

For issues or questions:
- GitHub: https://github.com/susclassglobal-oss/susclasssrefine
- Email: susclass.global@gmail.com

---

**Last Updated**: January 29, 2026  
**Maintained by**: Sustainable Classroom Team
