# 📧 Google Email Setup - Complete Guide

## 🎯 WHERE TO PUT YOUR GOOGLE APP PASSWORD

### Option 1: Docker Production (RECOMMENDED)

**File:** `docker-compose.yml`  
**Lines:** 70-90 (backend service)

```yaml
backend:
  environment:
    # REPLACE THESE LINES:
    SMTP_HOST: mailhog          # ❌ Delete
    SMTP_PORT: 1025             # ❌ Delete
    SMTP_SECURE: "false"        # ❌ Delete
    EMAIL_FROM_NAME: Sustainable Classroom
    EMAIL_FROM_ADDRESS: noreply@classroom.local  # ❌ Delete
    
    # WITH THESE LINES:
    EMAIL_SERVICE: gmail        # ✅ Add
    SMTP_HOST: smtp.gmail.com   # ✅ Add
    SMTP_PORT: 587              # ✅ Add
    SMTP_SECURE: "true"         # ✅ Add
    SMTP_USER: susclass.global@gmail.com  # ✅ Your Gmail
    SMTP_PASSWORD: abcdefghijklmnop       # ✅ YOUR 16-DIGIT APP PASSWORD (no spaces!)
    EMAIL_FROM_NAME: Sustainable Classroom
    EMAIL_FROM_ADDRESS: susclass.global@gmail.com  # ✅ Your Gmail
```

**After editing, restart:**
```powershell
docker-compose down
docker-compose up -d
```

---

### Option 2: Local Development

**File:** `backend/.env`  
**Location:** `e:\susclassroom\refine\backend\.env`

**Add/Replace these lines (lines 18-27):**
```env
# Email Configuration
EMAIL_SERVICE=gmail
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=true
SMTP_USER=susclass.global@gmail.com
SMTP_PASSWORD=abcdefghijklmnop
EMAIL_FROM_NAME=Sustainable Classroom
EMAIL_FROM_ADDRESS=susclass.global@gmail.com
```

---

## 🔐 How to Get Google App Password

### Step 1: Enable 2-Factor Authentication
1. Go to: https://myaccount.google.com/security
2. Scroll to "2-Step Verification"
3. Click **Get Started**
4. Follow instructions (phone verification required)

### Step 2: Generate App Password
1. Go to: https://myaccount.google.com/apppasswords
2. In "Select app" dropdown: Choose **Mail**
3. In "Select device" dropdown: Choose **Other (Custom name)**
4. Type: `Sustainable Classroom`
5. Click **Generate**
6. **COPY THE 16-DIGIT PASSWORD** 
   - Example shown: `abcd efgh ijkl mnop`
   - **Remove spaces:** `abcdefghijklmnop`

### Step 3: Apply Password
Paste the 16-digit code (NO SPACES) into:
- `docker-compose.yml` line ~85: `SMTP_PASSWORD: abcdefghijklmnop`
- OR `backend/.env` line ~23: `SMTP_PASSWORD=abcdefghijklmnop`

---

## ✅ Verify It Works

### 1. Check Logs
```powershell
docker logs lms-backend | Select-String "EMAIL"
```

**Expected output:**
```
[EMAIL] Using Gmail SMTP
[EMAIL] SMTP Configuration:
  Host: smtp.gmail.com
  Port: 587
  Secure: true
  User: susclass.global@gmail.com
```

### 2. Test Email Sending
Register a new user or trigger password reset - email should arrive in inbox!

---

## 🚫 Common Mistakes

| ❌ Wrong | ✅ Correct |
|---------|-----------|
| `abcd efgh ijkl mnop` (with spaces) | `abcdefghijklmnop` (no spaces) |
| Using regular Gmail password | Use 16-digit App Password |
| 2FA not enabled | Must enable 2FA first |
| Wrong email in SMTP_USER | Must match your Gmail |
| Forgetting to restart Docker | Run `docker-compose up -d` |

---

## 📁 File Consolidation

**ONLY ONE .env FILE NEEDED:** `backend/.env`

Delete these if they exist:
- `e:\susclassroom\refine\.env` (root - not needed)
- `e:\susclassroom\refine\client\.env` (client - not needed)

Keep these:
- `backend/.env` (actual config - **NOT in Git**)
- `backend/.env.example` (template - safe for Git)
- `.env.example` (root template - safe for Git)

---

## 🔒 Security Notes

- **Never commit `.env` files to Git!**
- `.gitignore` already excludes `.env` files
- Only commit `.env.example` (template with fake passwords)
- App passwords can be revoked anytime at: https://myaccount.google.com/apppasswords

---

## 📞 Troubleshooting

### "Invalid credentials" error
- Verify 2FA is enabled
- Regenerate app password
- Check for typos in email/password

### Emails not sending
```powershell
# Check backend logs
docker logs lms-backend --tail 50
```

### Still using MailHog?
Check docker-compose.yml - if you see `SMTP_HOST: mailhog`, you haven't applied Gmail settings yet!

---

**Your exact configuration:**
- Email: `susclass.global@gmail.com`
- App Password: Get from https://myaccount.google.com/apppasswords
- Files to edit: `docker-compose.yml` (lines 70-90)
