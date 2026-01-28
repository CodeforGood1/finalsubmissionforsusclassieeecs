# ✅ Deployment Complete - Quick Reference

## 🌐 Access Your Application

### Main Application
**URL**: http://localhost:5000

**Login Credentials**:
- Email: `admin@classroom.local`
- Password: `Admin@2026`

### Additional Services

| Service | URL | Purpose |
|---------|-----|---------|
| **Main App** | http://localhost:5000 | Student/Teacher/Admin portal |
| **MailHog** | http://localhost:8025 | View all system emails (OTPs, notifications) |
| **Jitsi Meet** | https://localhost:8443 | Video conferencing |
| **Nginx Proxy** | http://localhost or http://localhost:80 | Alternative access |

---

## 📧 Email Configuration

### Current Setup: MailHog (Local - No Internet)

✅ **Already configured and running!**

All emails are captured locally at: **http://localhost:8025**

This includes:
- Login OTP codes
- Module completion notifications
- Student-teacher communications
- System alerts

### Want Real Email Delivery?

See: [EMAIL-SETUP.md](EMAIL-SETUP.md) for Gmail configuration

---

## 🔧 Quick Commands

### Check Status
```powershell
docker-compose ps
```

### View Logs
```powershell
# All services
docker-compose logs -f

# Specific service
docker logs lms-backend -f
docker logs lms-database -f
docker logs lms-mailserver -f
```

### Restart Services
```powershell
# Restart all
docker-compose restart

# Restart specific service
docker-compose restart backend
```

### Stop Application
```powershell
docker-compose down
```

### Start Application
```powershell
docker-compose up -d
```

### Full Reset (⚠️ Deletes all data)
```powershell
docker-compose down -v
docker-compose up -d
```

---

## 🧪 Testing

### Run API Tests
```powershell
.\test-all-apis.ps1
```

This tests:
- ✅ 17 backend endpoints
- ✅ Admin/teacher/student authentication
- ✅ Module creation
- ✅ User registration
- ✅ Student-teacher allocation

---

## 📁 Important Files

| File | Purpose |
|------|---------|
| `.env` | Environment configuration (not in Git) |
| `.env.example` | Template for new deployments |
| `docker-compose.yml` | Service orchestration |
| `EMAIL-SETUP.md` | Email configuration guide |
| `PRODUCTION-DEPLOYMENT.md` | Large-scale deployment guide |
| `test-all-apis.ps1` | API testing script |

---

## 🔒 Security Checklist

Before deploying to production:

- [ ] Change admin password from default
- [ ] Generate new JWT_SECRET (use: `openssl rand -base64 32`)
- [ ] Update database password
- [ ] Review `.env` file (never commit to Git)
- [ ] Enable HTTPS with SSL certificates
- [ ] Configure firewall rules
- [ ] Set up automated backups

---

## 🚀 Production Deployment

For deployments with 1000+ concurrent users on LAN:

📋 **See**: [PRODUCTION-DEPLOYMENT.md](PRODUCTION-DEPLOYMENT.md)

Includes:
- ✅ E:\ drive installation (not C:\)
- ✅ Kubernetes deployment
- ✅ Kong API Gateway
- ✅ Varnish caching
- ✅ Harbor container registry
- ✅ Prometheus monitoring
- ✅ Automated backups

---

## 🐛 Troubleshooting

### Application won't start

1. Check Docker is running:
   ```powershell
   docker version
   ```

2. Check ports are available:
   ```powershell
   netstat -ano | findstr ":5000"
   netstat -ano | findstr ":5432"
   ```

3. View error logs:
   ```powershell
   docker-compose logs backend
   ```

### Can't login

1. Verify backend is healthy:
   ```powershell
   curl http://localhost:5000/api/health
   ```

2. Check admin credentials in `.env`:
   ```powershell
   cat .env | Select-String "ADMIN"
   ```

3. View login logs:
   ```powershell
   docker logs lms-backend | Select-String "Login"
   ```

### Emails not working

1. Check MailHog is running:
   ```powershell
   docker ps | Select-String mailhog
   ```

2. Access MailHog UI: http://localhost:8025

3. Check backend email config:
   ```powershell
   docker logs lms-backend | Select-String "EMAIL"
   ```

   Should show:
   ```
   [EMAIL] SMTP Host: mailhog
   [EMAIL] SMTP Port: 1025
   ```

### Database connection fails

1. Check database is healthy:
   ```powershell
   docker-compose ps postgres
   ```

2. Test database connection:
   ```powershell
   docker exec -it lms-database psql -U lms_admin -d sustainable_classroom -c "SELECT 1;"
   ```

3. Check database logs:
   ```powershell
   docker logs lms-database
   ```

---

## 📚 Documentation

| Document | Description |
|----------|-------------|
| [README.md](README.md) | Main documentation |
| [EMAIL-SETUP.md](EMAIL-SETUP.md) | Email configuration (MailHog vs Gmail) |
| [PRODUCTION-DEPLOYMENT.md](PRODUCTION-DEPLOYMENT.md) | Large-scale production deployment |
| [DEPLOYMENT-GUIDE.md](DEPLOYMENT-GUIDE.md) | Detailed deployment instructions |

---

## 🎯 Next Steps

1. **Login** to http://localhost:5000 with admin credentials
2. **Change default password** in Settings
3. **Create a test teacher** account
4. **Create a test student** account
5. **Test OTP email** at http://localhost:8025
6. **Create a sample module** as teacher
7. **View module** as student
8. **Start a video session** at https://localhost:8443

---

## 💡 Tips

- **View all emails**: http://localhost:8025 (MailHog)
- **OTP codes**: Check MailHog for login codes
- **Development mode**: Set `NODE_ENV=development` in `.env` to disable rate limiting
- **Production mode**: Set `NODE_ENV=production` for full security
- **Database backup**: 
  ```powershell
  docker exec lms-database pg_dump -U lms_admin sustainable_classroom > backup.sql
  ```

---

## 📞 Support

- Documentation: See files listed above
- Logs: `docker-compose logs -f`
- Health check: http://localhost:5000/api/health
- API tests: `.\test-all-apis.ps1`

---

**🎉 Your Sustainable Classroom LMS is ready!**

Access it now at: **http://localhost:5000**
