# Fix: Missing in_app_notifications Table

## Problem
Error: `relation "in_app_notifications" does not exist`

This error occurs when the in-app notifications table is missing from the database.

## Solution

Run the following SQL script in your PostgreSQL database (Neon SQL Editor):

```sql
-- Create in_app_notifications table
CREATE TABLE IF NOT EXISTS in_app_notifications (
    id SERIAL PRIMARY KEY,
    recipient_id INTEGER NOT NULL,
    recipient_type TEXT NOT NULL, -- 'student', 'teacher', 'admin'
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL, -- 'module', 'test', 'submission', 'deadline', 'grade', 'announcement', 'system'
    action_url TEXT, -- URL to navigate when clicking notification
    metadata JSONB DEFAULT '{}'::jsonb, -- Additional data (module_id, test_id, etc.)
    is_read BOOLEAN DEFAULT false,
    read_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT chk_recipient_type CHECK (recipient_type IN ('student', 'teacher', 'admin')),
    CONSTRAINT chk_notification_type CHECK (type IN ('module', 'test', 'submission', 'deadline', 'grade', 'announcement', 'system'))
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_inapp_recipient ON in_app_notifications(recipient_id, recipient_type);
CREATE INDEX IF NOT EXISTS idx_inapp_unread ON in_app_notifications(recipient_id, recipient_type, is_read);
CREATE INDEX IF NOT EXISTS idx_inapp_created ON in_app_notifications(created_at DESC);
```

## Quick Fix

**Option 1: Run the standalone script**
```bash
psql $DATABASE_URL -f backend/add-inapp-notifications-table.sql
```

**Option 2: Fresh setup (WARNING: Drops all data)**
```bash
psql $DATABASE_URL -f backend/FRESH-COMPLETE-DATABASE.sql
```

**Option 3: Manual SQL in Neon Console**
1. Log into your Neon console
2. Open SQL Editor
3. Copy and paste the SQL above
4. Click "Run"

## Verification

After running the script, verify the table exists:

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_name = 'in_app_notifications';
```

You should see the table listed. Then restart your backend server:

```bash
cd backend
npm start
```

The error should be gone!
