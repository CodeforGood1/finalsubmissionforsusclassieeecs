-- ============================================================
-- IN-APP NOTIFICATIONS TABLE
-- ============================================================
-- Purpose: Store in-app notifications for students and teachers
-- Features:
--   - Notifications shown in the notification bell
--   - Track read/unread status
--   - Support for different notification types and actions
-- ============================================================

-- Create in_app_notifications table
CREATE TABLE IF NOT EXISTS in_app_notifications (
    id SERIAL PRIMARY KEY,
    recipient_id INTEGER NOT NULL,
    recipient_type TEXT NOT NULL, -- 'student', 'teacher', 'admin'
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL, -- 'module', 'test', 'submission', 'deadline', 'grade', 'announcement'
    action_url TEXT, -- URL to navigate when clicking notification
    metadata JSONB DEFAULT '{}'::jsonb, -- Additional data (module_id, test_id, etc.)
    is_read BOOLEAN DEFAULT false,
    read_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT chk_recipient_type CHECK (recipient_type IN ('student', 'teacher', 'admin')),
    CONSTRAINT chk_notification_type CHECK (type IN ('module', 'test', 'submission', 'deadline', 'grade', 'announcement', 'system'))
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_inapp_recipient ON in_app_notifications(recipient_id, recipient_type);
CREATE INDEX IF NOT EXISTS idx_inapp_unread ON in_app_notifications(recipient_id, recipient_type, is_read);
CREATE INDEX IF NOT EXISTS idx_inapp_created ON in_app_notifications(created_at DESC);

-- Add some sample notifications for testing (optional)
DO $$ 
DECLARE
    student_count INTEGER;
    teacher_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO student_count FROM students;
    SELECT COUNT(*) INTO teacher_count FROM teachers;
    
    IF student_count > 0 AND NOT EXISTS (SELECT 1 FROM in_app_notifications LIMIT 1) THEN
        -- Add welcome notification for first student
        INSERT INTO in_app_notifications (recipient_id, recipient_type, title, message, type, action_url)
        SELECT 
            id,
            'student',
            'Welcome to SUS Classroom!',
            'Start learning by clicking on your assigned modules.',
            'system',
            '/dashboard'
        FROM students
        LIMIT 1;
        
        RAISE NOTICE 'Added sample in-app notification for students';
    END IF;
    
    IF teacher_count > 0 AND NOT EXISTS (SELECT 1 FROM in_app_notifications WHERE recipient_type = 'teacher' LIMIT 1) THEN
        -- Add welcome notification for first teacher
        INSERT INTO in_app_notifications (recipient_id, recipient_type, title, message, type, action_url)
        SELECT 
            id,
            'teacher',
            'Welcome to SUS Classroom!',
            'Start creating content for your students.',
            'system',
            '/teacher-dashboard'
        FROM teachers
        LIMIT 1;
        
        RAISE NOTICE 'Added sample in-app notification for teachers';
    END IF;
END $$;

DO $$ BEGIN RAISE NOTICE 'In-app notifications table created successfully!'; END $$;
