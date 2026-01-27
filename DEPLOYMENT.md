# Deployment Guide - Sustainable Classroom LMS

This guide covers deployment scenarios for the Sustainable Classroom LMS.

---

## 📦 Deployment Options

1. **Docker Compose (Recommended)** - Full stack with database
2. **Single Docker Container** - Backend + Frontend only
3. **Manual Deployment** - Traditional VPS/server setup
4. **Cloud Platform** - Render, Railway, Heroku, etc.

---

## 🐳 Docker Compose Deployment (Recommended)

### Prerequisites
- Docker Engine 20.10+
- Docker Compose v2.0+
- 2GB RAM minimum
- 10GB disk space

### Step 1: Clone & Configure
```bash
git clone https://github.com/susclassglobal-oss/susclasssrefine.git
cd susclasssrefine

# Create environment file
cat > .env << 'EOF'
DB_PASSWORD=SecurePassword2026
JWT_SECRET=YourVeryLongRandomSecretKey32Characters
ADMIN_EMAIL=admin@school.local
ADMIN_PASSWORD=Admin@2026
GMAIL_USER=your-email@gmail.com
GMAIL_APP_PASSWORD=your-16-char-app-password
EOF
```

### Step 2: Start Services
```bash
# Start all services (database, cache, mail, app)
docker-compose up -d

# View logs
docker-compose logs -f backend

# Check status
docker-compose ps
```

### Step 3: Verify
```bash
# Health check
curl http://localhost:5000/api/health

# Test login
curl -X POST http://localhost:5000/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@school.local","password":"Admin@2026","role":"admin"}'
```

### Step 4: Access Application
- Application: http://localhost:5000
- MailHog (dev): http://localhost:8025
- PostgreSQL: localhost:5432

---

## 🏢 Production Deployment

### Environment Variables (Critical)
```env
NODE_ENV=production
PORT=5000

# Database
DATABASE_URL=postgresql://lms_admin:password@postgres:5432/sustainable_classroom
DB_SSL=true  # Enable for production databases

# Security
JWT_SECRET=<GENERATE_64_CHAR_RANDOM_STRING>
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_PASSWORD=<STRONG_PASSWORD>

# Email (Gmail)
GMAIL_USER=notifications@yourdomain.com
GMAIL_APP_PASSWORD=<16_CHAR_APP_PASSWORD>

# Or SMTP
SMTP_HOST=smtp.yourdomain.com
SMTP_PORT=587
SMTP_SECURE=true
SMTP_USER=smtp-user
SMTP_PASSWORD=smtp-password
EMAIL_FROM_NAME=School LMS
EMAIL_FROM_ADDRESS=noreply@yourdomain.com

# URLs
FRONTEND_URL=https://yourdomain.com
```

### SSL/TLS Setup (Nginx)
```nginx
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## 🔨 Build Custom Docker Image

### Build
```bash
# Build image
docker build -t susclass-lms:v1.0.0 .

# Tag for registry
docker tag susclass-lms:v1.0.0 yourregistry/susclass-lms:v1.0.0

# Push to registry
docker push yourregistry/susclass-lms:v1.0.0
```

### Run Custom Image
```bash
docker run -d \
  --name lms-app \
  -p 5000:5000 \
  -e DATABASE_URL=postgresql://user:pass@host:5432/db \
  -e JWT_SECRET=your-secret \
  -e GMAIL_USER=user@gmail.com \
  -e GMAIL_APP_PASSWORD=pass \
  -e ADMIN_EMAIL=admin@school.local \
  -e ADMIN_PASSWORD=Admin@2026 \
  -v $(pwd)/uploads:/app/backend/uploads \
  --restart unless-stopped \
  susclass-lms:v1.0.0
```

---

## 🖥️ Manual Deployment (VPS)

### Prerequisites
- Ubuntu 20.04+ / CentOS 8+
- Node.js 18+
- PostgreSQL 15+
- Nginx (optional)

### Step 1: Install Dependencies
```bash
# Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# PostgreSQL 15
sudo apt-get install -y postgresql-15 postgresql-client-15

# PM2 (process manager)
sudo npm install -g pm2
```

### Step 2: Setup Database
```bash
# Switch to postgres user
sudo -u postgres psql

# Create database and user
CREATE DATABASE sustainable_classroom;
CREATE USER lms_admin WITH PASSWORD 'SecurePassword2026';
GRANT ALL PRIVILEGES ON DATABASE sustainable_classroom TO lms_admin;
\q

# Import schema
cd /path/to/project/backend
psql -U lms_admin -d sustainable_classroom -f FRESH-COMPLETE-DATABASE.sql
psql -U lms_admin -d sustainable_classroom -f add-module-progress-tracking.sql
psql -U lms_admin -d sustainable_classroom -f add-coding-submissions.sql
psql -U lms_admin -d sustainable_classroom -f add-inapp-notifications-table.sql
```

### Step 3: Deploy Application
```bash
# Clone repository
cd /opt
git clone https://github.com/susclassglobal-oss/susclasssrefine.git
cd susclasssrefine

# Install backend dependencies
cd backend
npm install --production
cp .env.example .env
# Edit .env with production values

# Build frontend
cd ../client
npm install
npm run build

# Copy built frontend to backend
cp -r dist/* ../backend/public/

# Start with PM2
cd ../backend
pm2 start server.js --name lms-backend
pm2 save
pm2 startup
```

### Step 4: Configure Nginx
```bash
sudo nano /etc/nginx/sites-available/lms

# Add configuration (see SSL/TLS section above)

sudo ln -s /etc/nginx/sites-available/lms /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## ☁️ Cloud Platform Deployment

### Render.com
1. Connect GitHub repository
2. Create Web Service
3. Build Command: 
   ```bash
   cd client && npm install && npm run build && cd ../backend && npm install
   ```
4. Start Command: `cd backend && node server.js`
5. Add environment variables from production list
6. Create PostgreSQL database (managed)
7. Deploy

### Railway
1. New Project → Deploy from GitHub
2. Add PostgreSQL plugin
3. Set environment variables
4. Deploy automatically on push

### Heroku
```bash
# Install Heroku CLI
heroku create susclass-lms

# Add PostgreSQL addon
heroku addons:create heroku-postgresql:mini

# Set environment variables
heroku config:set JWT_SECRET=your-secret
heroku config:set GMAIL_USER=user@gmail.com
# ... etc

# Deploy
git push heroku main

# Run migrations
heroku run bash
cd backend
psql $DATABASE_URL < FRESH-COMPLETE-DATABASE.sql
```

---

## 🔄 Updates & Maintenance

### Update Application
```bash
# With Docker Compose
cd susclasssrefine
git pull
docker-compose down
docker-compose build
docker-compose up -d

# Manual deployment
cd /opt/susclasssrefine
git pull
cd backend && npm install
cd ../client && npm install && npm run build
pm2 restart lms-backend
```

### Database Backup
```bash
# Backup
docker exec lms-database pg_dump -U lms_admin sustainable_classroom > backup.sql

# Or manual
pg_dump -U lms_admin -h localhost sustainable_classroom > backup.sql

# Restore
psql -U lms_admin -d sustainable_classroom < backup.sql
```

### Monitor Logs
```bash
# Docker
docker-compose logs -f backend

# PM2
pm2 logs lms-backend

# Nginx
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log
```

---

## 🔍 Troubleshooting

### Database Connection Issues
```bash
# Check database is running
docker-compose ps postgres
# or
sudo systemctl status postgresql

# Test connection
docker exec -it lms-database psql -U lms_admin -d sustainable_classroom
# or
psql -U lms_admin -h localhost -d sustainable_classroom

# Check environment variables
docker-compose exec backend env | grep DATABASE_URL
```

### Port Already in Use
```bash
# Find process using port 5000
sudo lsof -i :5000
# or on Windows
netstat -ano | findstr :5000

# Kill process
kill -9 <PID>
```

### Permission Issues
```bash
# Fix uploads directory
sudo chown -R node:node /app/backend/uploads
# or for manual deployment
sudo chown -R $USER:$USER /opt/susclasssrefine/backend/uploads
```

---

## 📊 Performance Tuning

### PostgreSQL Optimization
```sql
-- Edit postgresql.conf
shared_buffers = 256MB
effective_cache_size = 1GB
maintenance_work_mem = 64MB
max_connections = 100
```

### Redis Integration (Optional)
```javascript
// In server.js, replace in-memory cache with Redis
const redis = require('redis');
const client = redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});
```

### Nginx Caching
```nginx
# Add to nginx config
location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}
```

---

## 🔐 Security Checklist

- [ ] Change default admin password
- [ ] Use strong JWT_SECRET (64+ characters)
- [ ] Enable HTTPS/SSL in production
- [ ] Set DB_SSL=true for external databases
- [ ] Configure firewall (allow only 80, 443, 22)
- [ ] Keep .env files out of version control
- [ ] Regularly update dependencies (`npm audit`)
- [ ] Enable database backups
- [ ] Use environment-specific secrets
- [ ] Implement rate limiting (nginx/app level)

---

## 📞 Support

For deployment issues:
- GitHub Issues: https://github.com/susclassglobal-oss/susclasssrefine/issues
- Email: susclass.global@gmail.com
