# 📧 Email Configuration - File Locations

## Quick Reference: Where to Change Email Settings

### For Docker Deployment (Recommended)

**Primary File**: `docker-compose.yml` (lines 70-90)

```
e:\susclassroom\refine\docker-compose.yml
```

**Current Default (MailHog - No Internet)**:
```yaml
environment:
  SMTP_HOST: mailhog
  SMTP_PORT: 1025
  SMTP_SECURE: "false"
  EMAIL_FROM_NAME: Sustainable Classroom
  EMAIL_FROM_ADDRESS: noreply@classroom.local
```

**To Use Gmail (Real Email Delivery)**:
```yaml
environment:
  EMAIL_SERVICE: gmail
  SMTP_HOST: smtp.gmail.com
  SMTP_PORT: 587
  SMTP_USER: your-email@gmail.com
  SMTP_PASSWORD: your-16-char-app-password
  EMAIL_FROM_NAME: Sustainable Classroom
  EMAIL_FROM_ADDRESS: your-email@gmail.com
```

After changing, run:
```powershell
docker-compose up -d --force-recreate backend
```

---

### For Local Development (Without Docker)

**Primary File**: `backend/.env`

```
e:\susclassroom\refine\backend\.env
```

**Template File** (copy this): `backend/.env.example`

```
e:\susclassroom\refine\backend\.env.example
```

---

## File-by-File Reference

| File | Location | Purpose |
|------|----------|---------|
| `docker-compose.yml` | `e:\susclassroom\refine\docker-compose.yml` | **Docker email settings** (lines 70-90) |
| `.env` | `e:\susclassroom\refine\.env` | Root environment file (optional) |
| `backend/.env` | `e:\susclassroom\refine\backend\.env` | Backend-specific settings |
| `.env.example` | `e:\susclassroom\refine\.env.example` | Template (safe for Git) |

---

## Step-by-Step: Switch to Gmail

### Step 1: Open docker-compose.yml

```powershell
notepad e:\susclassroom\refine\docker-compose.yml
```

### Step 2: Find the backend environment section (around line 70)

Look for:
```yaml
backend:
  ...
  environment:
    SMTP_HOST: mailhog
    SMTP_PORT: 1025
```

### Step 3: Replace with Gmail settings

```yaml
    EMAIL_SERVICE: gmail
    SMTP_HOST: smtp.gmail.com
    SMTP_PORT: 587
    SMTP_USER: your-email@gmail.com
    SMTP_PASSWORD: your-16-char-app-password
    EMAIL_FROM_NAME: Sustainable Classroom
    EMAIL_FROM_ADDRESS: your-email@gmail.com
```

### Step 4: Get Gmail App Password

1. Enable 2FA: https://myaccount.google.com/security
2. Generate app password: https://myaccount.google.com/apppasswords
3. Select "Mail" → Copy the 16-character password

### Step 5: Restart Backend

```powershell
cd e:\susclassroom\refine
docker-compose up -d --force-recreate backend
```

### Step 6: Verify

```powershell
docker logs lms-backend | Select-String "EMAIL"
```

Should show: `[EMAIL] Using Gmail SMTP`

---

## View Emails (MailHog)

If using MailHog (default), view all emails at:

**URL**: http://localhost:8025

---

## Environment Variables Reference

| Variable | MailHog (Default) | Gmail |
|----------|-------------------|-------|
| `SMTP_HOST` | `mailhog` | `smtp.gmail.com` |
| `SMTP_PORT` | `1025` | `587` |
| `SMTP_USER` | *(empty)* | `your-email@gmail.com` |
| `SMTP_PASSWORD` | *(empty)* | `your-app-password` |
| `EMAIL_SERVICE` | *(empty)* | `gmail` |
| `EMAIL_FROM_ADDRESS` | `noreply@classroom.local` | `your-email@gmail.com` |

---

## Files That Should NOT Be in Git

These files contain secrets and are excluded via `.gitignore`:

- `.env` (any location)
- `.env.local`
- `.env.*.local`
- `backend/.env`

**Safe to commit**: `.env.example` (template with no real passwords)
