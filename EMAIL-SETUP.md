# Email Configuration Guide

## Overview

The Sustainable Classroom LMS supports two email modes:

1. **Local MailHog (Default)** - No internet required, perfect for offline deployments
2. **Gmail SMTP (Optional)** - For real email delivery to external addresses

## Option 1: Local MailHog (Recommended for LAN deployments)

### What is MailHog?

MailHog is a local SMTP server that captures all emails sent by the application. Perfect for:
- Offline/on-premise deployments
- Testing without sending real emails
- LAN networks without internet access
- Viewing all system emails in one place

### Configuration

MailHog is **already configured by default** in `docker-compose.yml`. No additional setup needed!

```env
# .env (Default configuration)
SMTP_HOST=mailhog
SMTP_PORT=1025
SMTP_SECURE=false
EMAIL_FROM_NAME=Sustainable Classroom
EMAIL_FROM_ADDRESS=noreply@classroom.local
```

### Viewing Emails

1. Start the application:
   ```powershell
   docker-compose up -d
   ```

2. Open MailHog web interface:
   ```
   http://localhost:8025
   ```

3. All emails sent by the system will appear here, including:
   - OTP codes for login
   - Module completion notifications
   - Student-teacher communications
   - System alerts

### How It Works

```
Application → Local SMTP (MailHog) → Web UI (port 8025)
              ↑
              No internet required
```

## Option 2: Gmail SMTP (For real email delivery)

### Prerequisites

1. Google account with 2-Factor Authentication enabled
2. Gmail App Password (not your regular password)
3. Internet connection

### Step 1: Enable 2-Factor Authentication

1. Go to: https://myaccount.google.com/security
2. Enable "2-Step Verification"
3. Follow the setup wizard

### Step 2: Generate App Password

1. Go to: https://myaccount.google.com/apppasswords
2. Select "Mail" from the app dropdown
3. Select "Other" from the device dropdown
4. Enter "Sustainable Classroom"
5. Click "Generate"
6. **Copy the 16-character password** (e.g., `abcd efgh ijkl mnop`)

### Step 3: Configure Application

Edit your `.env` file:

```env
# Comment out or remove MailHog settings
# SMTP_HOST=mailhog
# SMTP_PORT=1025

# Add Gmail settings
EMAIL_SERVICE=gmail
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=abcdefghijklmnop  # 16-char app password (no spaces)
SMTP_SECURE=false
EMAIL_FROM_NAME=Sustainable Classroom
EMAIL_FROM_ADDRESS=your-email@gmail.com
```

### Step 4: Restart Application

```powershell
docker-compose restart backend
```

### Verify Configuration

Check backend logs to confirm Gmail is being used:

```powershell
docker logs lms-backend | Select-String "EMAIL"
```

You should see:
```
[EMAIL] Using Gmail SMTP
```

## Switching Between Modes

### Switch to MailHog (Local)

```env
SMTP_HOST=mailhog
SMTP_PORT=1025
SMTP_SECURE=false
EMAIL_FROM_ADDRESS=noreply@classroom.local
```

```powershell
docker-compose restart backend
```

### Switch to Gmail (Internet)

```env
EMAIL_SERVICE=gmail
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
EMAIL_FROM_ADDRESS=your-email@gmail.com
```

```powershell
docker-compose restart backend
```

## Troubleshooting

### MailHog emails not appearing

1. Check MailHog is running:
   ```powershell
   docker ps | Select-String mailhog
   ```

2. Access web UI:
   ```
   http://localhost:8025
   ```

3. Check backend logs:
   ```powershell
   docker logs lms-backend --tail 50
   ```

### Gmail authentication fails

**Error: "Invalid login: 535-5.7.8 Username and Password not accepted"**

**Solutions:**

1. **Verify App Password:**
   - Must be 16 characters
   - Remove spaces: `abcd efgh ijkl mnop` → `abcdefghijklmnop`
   - NOT your regular Gmail password

2. **Verify 2FA is enabled:**
   - Go to: https://myaccount.google.com/security
   - "2-Step Verification" must show "On"

3. **Check Less Secure Apps:**
   - Google may have disabled app passwords
   - Try generating a new app password
   - Use a different Gmail account

4. **Firewall/Network:**
   - Port 587 must be open for outbound SMTP
   - Some networks block SMTP ports

### Emails delayed or not sending

1. **Check SMTP settings:**
   ```powershell
   docker exec lms-backend printenv | Select-String SMTP
   ```

2. **Test SMTP connection:**
   ```powershell
   docker exec -it lms-backend sh
   telnet smtp.gmail.com 587
   ```

3. **Review email queue:**
   ```powershell
   docker exec lms-backend cat backend/data/email-queue.json
   ```

## Environment Variables Reference

| Variable | MailHog (Default) | Gmail (Optional) |
|----------|------------------|------------------|
| `SMTP_HOST` | `mailhog` | `smtp.gmail.com` |
| `SMTP_PORT` | `1025` | `587` |
| `SMTP_SECURE` | `false` | `false` |
| `SMTP_USER` | *(not needed)* | `your-email@gmail.com` |
| `SMTP_PASSWORD` | *(not needed)* | `your-app-password` |
| `EMAIL_SERVICE` | *(not set)* | `gmail` |
| `EMAIL_FROM_ADDRESS` | `noreply@classroom.local` | `your-email@gmail.com` |

## Security Best Practices

### DO:
- ✅ Use `.env.example` template when cloning repo
- ✅ Generate new app passwords for each deployment
- ✅ Store app passwords in Kubernetes Secrets (production)
- ✅ Use MailHog for LAN-only deployments
- ✅ Restrict MailHog web UI access (port 8025)

### DON'T:
- ❌ Commit `.env` file to Git (it's in .gitignore)
- ❌ Share app passwords in documentation
- ❌ Use your main Gmail password
- ❌ Leave default passwords in production
- ❌ Expose MailHog publicly (localhost only)

## Production Deployment

For production deployments with 1000+ users:

### Use Kubernetes Secrets

```powershell
# Store SMTP credentials securely
kubectl create secret generic email-secrets \
  --from-literal=smtp-user=your-email@gmail.com \
  --from-literal=smtp-password=your-app-password

# Reference in deployment
env:
  - name: SMTP_USER
    valueFrom:
      secretKeyRef:
        name: email-secrets
        key: smtp-user
```

### Use MailHog for LAN deployments

- No internet dependency
- All emails visible to admins
- No email quota limits
- No security concerns with external SMTP

See [PRODUCTION-DEPLOYMENT.md](PRODUCTION-DEPLOYMENT.md) for complete production setup guide.

## Quick Start

### For Development/Testing (Offline)

1. Copy `.env.example` to `.env`:
   ```powershell
   cp .env.example .env
   ```

2. Start application:
   ```powershell
   docker-compose up -d
   ```

3. View emails at: http://localhost:8025

**Done!** No email configuration needed.

### For Production (Real Emails)

1. Follow Gmail setup above
2. Update `.env` with Gmail credentials
3. Restart backend:
   ```powershell
   docker-compose restart backend
   ```

4. Test email by creating a user account

## Support

If emails still aren't working:

1. Check logs: `docker logs lms-backend`
2. Verify configuration: `docker exec lms-backend printenv | Select-String SMTP`
3. Review [PRODUCTION-DEPLOYMENT.md](PRODUCTION-DEPLOYMENT.md)
4. Test with MailHog first to isolate SMTP issues
