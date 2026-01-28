# 🚀 QUICK START GUIDE - 3 MINUTES TO RUNNING!

## For Complete Beginners

### Step 1: Install Docker (5 minutes, one-time)

**Windows:**
1. Download [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop)
2. Run installer, restart computer
3. Open Docker Desktop (wait for it to start)

**Mac:**
1. Download [Docker Desktop for Mac](https://www.docker.com/products/docker-desktop)
2. Drag to Applications folder
3. Open Docker Desktop from Applications

**Linux (Ubuntu/Debian):**
```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
# Log out and back in
```

### Step 2: Download the Project

**Option A: Using Git (Recommended)**
```bash
git clone https://github.com/susclassglobal-oss/susclasssrefine.git
cd susclasssrefine
```

**Option B: Download ZIP**
1. Go to https://github.com/susclassglobal-oss/susclasssrefine
2. Click green "Code" button → "Download ZIP"
3. Extract ZIP file
4. Open terminal/PowerShell in extracted folder

### Step 3: Deploy!

**Linux/Mac:**
```bash
chmod +x deploy.sh
./deploy.sh
```

**Windows PowerShell (Run as Administrator):**
```powershell
.\deploy.ps1
```

**Wait 2-3 minutes** for services to start (downloads Docker images first time)

### Step 4: Access the Application

Open your browser and go to:
- **Main Application:** http://localhost:5000

Login with:
- **Email:** admin@classroom.local
- **Password:** Admin@2026

### Step 5: Explore!

**As Admin, you can:**
1. Create teachers and students (bulk CSV upload)
2. Create subjects and sections
3. View all users and analytics

**As Teacher (switch user or login in incognito):**
- **Email:** susclass.global+sarah.teacher@gmail.com
- **Password:** password123

You can:
1. Create learning modules with videos, coding exercises, tests
2. View allocated students
3. Schedule live Jitsi sessions

**As Student:**
- **Email:** susclass.global+amara@gmail.com
- **Password:** student123

You can:
1. Access assigned modules
2. Complete coding exercises
3. Take MCQ tests
4. Track your progress and streaks

---

## 🎯 Testing Without Internet

**Turn off WiFi** and verify:
- ✅ Login works
- ✅ Create modules works
- ✅ Coding exercises work
- ✅ Tests work
- ✅ Email notifications appear in MailHog (http://localhost:8025)

**What needs internet:**
- ❌ Gmail email sending (use MailHog instead - already configured)
- ❌ External video URLs from YouTube (upload video files instead)
- ❌ External Jitsi links (use self-hosted Jitsi - optional)

---

## 📋 Quick Commands

```bash
# View logs
docker-compose logs -f

# Stop everything
docker-compose down

# Restart
docker-compose restart

# Check status
docker-compose ps

# Clean restart (wipes data!)
docker-compose down -v
docker-compose up -d
```

---

## 🐛 Troubleshooting

**Port 5000 already in use?**
```bash
# Windows
netstat -ano | findstr :5000
taskkill /PID <PID> /F

# Linux/Mac
sudo lsof -i :5000
sudo kill -9 <PID>
```

**Docker not starting?**
- Make sure Docker Desktop is running (Windows/Mac)
- Check Docker icon in system tray
- Restart Docker Desktop

**"Permission denied" on Linux?**
```bash
sudo chmod +x deploy.sh
./deploy.sh
```

**Services not starting?**
```bash
# View detailed logs
docker-compose logs backend
docker-compose logs postgres

# Full rebuild
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

**Database connection failed?**
```bash
# Check if database is running
docker exec -it lms-database psql -U lms_admin -d sustainable_classroom

# If it connects, database is fine. Check backend logs.
docker-compose logs backend
```

---

## 🎓 Next Steps

1. **Change Passwords:** Edit `.env` file and change default passwords
2. **Add Users:** Use admin panel to create teachers and students
3. **Create Content:** Teachers can create modules with learning materials
4. **Test Features:** Try coding exercises, MCQ tests, live sessions
5. **Check Analytics:** View student progress and performance

---

## 📚 More Resources

- **Full Documentation:** [README.md](README.md)
- **Production Deployment:** [DEPLOYMENT.md](DEPLOYMENT.md)
- **Challenge Compliance:** [CHALLENGE-COMPLIANCE.md](CHALLENGE-COMPLIANCE.md)
- **GitHub Issues:** https://github.com/susclassglobal-oss/susclasssrefine/issues

---

## ✅ Success Checklist

After deployment, verify:
- [ ] Can access http://localhost:5000
- [ ] Can login as admin
- [ ] Can see MailHog at http://localhost:8025
- [ ] Can create a teacher user
- [ ] Can create a student user
- [ ] Teacher can create a module
- [ ] Student can access the module
- [ ] Coding exercise works
- [ ] MCQ test works
- [ ] Email appears in MailHog

**All checked?** You're ready to use the system! 🎉

---

*For Africa Sustainable Classroom Challenge*  
*On-Premise Student Learning System*
