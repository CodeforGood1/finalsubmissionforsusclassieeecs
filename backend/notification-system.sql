-- ============================================================
-- NOTIFICATION SYSTEM DATABASE SCHEMA
-- ============================================================
-- Purpose: Email and SMS notification system for LMS events
-- Features:
--   - User notification preferences (subscribe/unsubscribe by event type)
--   - Notification history/logs with delivery status
--   - Support for email and SMS channels
--   - Event-driven notifications for modules, tests, submissions, etc.
-- ============================================================

DO $$ 
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Creating Notification System Tables...';
    RAISE NOTICE '========================================';
END $$;

-- ============================================================
-- TABLE 1: NOTIFICATION_EVENTS (Event Types Catalog)
-- ============================================================
-- Defines all notification event types in the system
CREATE TABLE IF NOT EXISTS notification_events (
    id SERIAL PRIMARY KEY,
    event_code TEXT UNIQUE NOT NULL,
    event_name TEXT NOT NULL,
    description TEXT,
    default_enabled BOOLEAN DEFAULT true,
    recipient_role TEXT NOT NULL, -- 'student', 'teacher', 'both'
    category TEXT NOT NULL, -- 'module', 'test', 'submission', 'deadline', 'grade', 'system'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT chk_event_code CHECK (event_code ~* '^[A-Z0-9_]+$'),
    CONSTRAINT chk_recipient_role CHECK (recipient_role IN ('student', 'teacher', 'both', 'admin')),
    CONSTRAINT chk_category CHECK (category IN ('module', 'test', 'submission', 'deadline', 'grade', 'system', 'announcement'))
);

-- ============================================================
-- TABLE 2: NOTIFICATION_PREFERENCES (User Subscriptions)
-- ============================================================
-- User preferences for each notification event type
CREATE TABLE IF NOT EXISTS notification_preferences (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    user_type TEXT NOT NULL, -- 'student', 'teacher', 'admin'
    event_code TEXT NOT NULL,
    email_enabled BOOLEAN DEFAULT true,
    sms_enabled BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT uq_user_event UNIQUE(user_id, user_type, event_code),
    CONSTRAINT chk_user_type CHECK (user_type IN ('student', 'teacher', 'admin'))
);

-- ============================================================
-- TABLE 3: NOTIFICATION_LOGS (Delivery History)
-- ============================================================
-- Record of all notifications sent
CREATE TABLE IF NOT EXISTS notification_logs (
    id SERIAL PRIMARY KEY,
    event_code TEXT NOT NULL,
    recipient_id INTEGER NOT NULL,
    recipient_type TEXT NOT NULL, -- 'student', 'teacher', 'admin'
    recipient_email TEXT NOT NULL,
    recipient_phone TEXT,
    channel TEXT NOT NULL, -- 'email', 'sms', 'both'
    status TEXT DEFAULT 'pending', -- 'pending', 'sent', 'failed', 'bounced'
    subject TEXT,
    message TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb, -- Store test_id, module_id, etc.
    error_message TEXT,
    sent_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT chk_channel CHECK (channel IN ('email', 'sms', 'both')),
    CONSTRAINT chk_status CHECK (status IN ('pending', 'sent', 'failed', 'bounced', 'queued')),
    CONSTRAINT chk_recipient_type CHECK (recipient_type IN ('student', 'teacher', 'admin'))
);

-- ============================================================
-- TABLE 4: NOTIFICATION_QUEUE (Async Processing)
-- ============================================================
-- Queue for batch notification processing
CREATE TABLE IF NOT EXISTS notification_queue (
    id SERIAL PRIMARY KEY,
    event_code TEXT NOT NULL,
    recipients JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of {id, type, email, phone}
    subject TEXT,
    message TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    priority INTEGER DEFAULT 5, -- 1=highest, 10=lowest
    status TEXT DEFAULT 'queued',
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    scheduled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT chk_priority CHECK (priority BETWEEN 1 AND 10),
    CONSTRAINT chk_status_queue CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
    CONSTRAINT chk_retry CHECK (retry_count >= 0 AND retry_count <= max_retries)
);

-- ============================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================

-- Notification Preferences indexes
CREATE INDEX IF NOT EXISTS idx_notif_pref_user ON notification_preferences(user_id, user_type);
CREATE INDEX IF NOT EXISTS idx_notif_pref_event ON notification_preferences(event_code);

-- Notification Logs indexes
CREATE INDEX IF NOT EXISTS idx_notif_logs_recipient ON notification_logs(recipient_id, recipient_type);
CREATE INDEX IF NOT EXISTS idx_notif_logs_event ON notification_logs(event_code);
CREATE INDEX IF NOT EXISTS idx_notif_logs_status ON notification_logs(status);
CREATE INDEX IF NOT EXISTS idx_notif_logs_created ON notification_logs(created_at DESC);

-- Notification Queue indexes
CREATE INDEX IF NOT EXISTS idx_notif_queue_status ON notification_queue(status) WHERE status IN ('queued', 'processing');
CREATE INDEX IF NOT EXISTS idx_notif_queue_priority ON notification_queue(priority, scheduled_at);

-- ============================================================
-- SEED NOTIFICATION EVENTS
-- ============================================================

INSERT INTO notification_events (event_code, event_name, description, recipient_role, category, default_enabled) VALUES

-- STUDENT NOTIFICATIONS
('MODULE_PUBLISHED', 'New Module Available', 'Notifies students when a new learning module is published to their section', 'student', 'module', true),
('MODULE_UPDATED', 'Module Content Updated', 'Notifies students when a module they are studying is updated', 'student', 'module', true),
('TEST_ASSIGNED', 'New Test Assigned', 'Notifies students when a new test is assigned to their section', 'student', 'test', true),
('TEST_DEADLINE_24H', 'Test Deadline in 24 Hours', 'Reminds students that a test deadline is approaching within 24 hours', 'student', 'deadline', true),
('TEST_DEADLINE_1H', 'Test Deadline in 1 Hour', 'Final reminder that test deadline is within 1 hour', 'student', 'deadline', true),
('GRADE_POSTED', 'Test Grade Posted', 'Notifies students when their test has been graded', 'student', 'grade', true),
('LOW_PERFORMANCE_ALERT', 'Performance Alert', 'Notifies students when their test score is below 50%', 'student', 'grade', true),
('CODING_FEEDBACK', 'Coding Submission Feedback', 'Notifies students when teacher provides feedback on coding submission', 'student', 'submission', true),

-- TEACHER NOTIFICATIONS
('TEST_SUBMITTED', 'Student Submitted Test', 'Notifies teachers when a student submits a test', 'teacher', 'submission', true),
('MODULE_COMPLETION', 'Student Completed Module', 'Notifies teachers when a student completes a module', 'teacher', 'module', false),
('ALL_STUDENTS_COMPLETED', 'All Students Completed Module', 'Notifies teachers when all students in section complete a module', 'teacher', 'module', true),
('DEADLINE_REVIEW_REMINDER', 'Test Review Reminder', 'Reminds teachers to review test submissions before deadline', 'teacher', 'deadline', true),
('LOW_CLASS_PERFORMANCE', 'Low Class Performance Alert', 'Alerts teachers when average class score on test is below 60%', 'teacher', 'grade', true),
('NO_SUBMISSIONS_ALERT', 'No Test Submissions', 'Alerts teachers when no students have submitted a test 24h before deadline', 'teacher', 'test', true),
('CODING_SUBMISSION', 'New Coding Submission', 'Notifies teachers when a student submits a coding problem', 'teacher', 'submission', true),

-- SYSTEM NOTIFICATIONS (BOTH)
('SYSTEM_ANNOUNCEMENT', 'System Announcement', 'Important system-wide announcements', 'both', 'system', true),
('SECTION_CHANGE', 'Section Assignment Changed', 'Notifies when student is moved to different section', 'both', 'system', true),
('ACCOUNT_CREATED', 'Account Created Successfully', 'Welcome email when new account is created', 'both', 'system', true),
('PASSWORD_RESET', 'Password Reset Request', 'Password reset confirmation', 'both', 'system', true)

ON CONFLICT (event_code) DO NOTHING;

DO $$ 
BEGIN
    RAISE NOTICE '✓ Seeded % notification event types', (SELECT COUNT(*) FROM notification_events);
END $$;

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Function to automatically create default preferences for new users
CREATE OR REPLACE FUNCTION create_default_notification_preferences()
RETURNS TRIGGER AS $$
DECLARE
    user_role TEXT;
BEGIN
    -- Determine user role based on table
    IF TG_TABLE_NAME = 'students' THEN
        user_role := 'student';
    ELSIF TG_TABLE_NAME = 'teachers' THEN
        user_role := 'teacher';
    ELSE
        user_role := 'admin';
    END IF;
    
    -- Insert default preferences for all applicable events
    INSERT INTO notification_preferences (user_id, user_type, event_code, email_enabled, sms_enabled)
    SELECT 
        NEW.id,
        user_role,
        ne.event_code,
        ne.default_enabled,
        false -- SMS disabled by default
    FROM notification_events ne
    WHERE ne.recipient_role IN (user_role, 'both')
    ON CONFLICT (user_id, user_type, event_code) DO NOTHING;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach triggers to student and teacher tables
DROP TRIGGER IF EXISTS trg_student_notif_prefs ON students;
CREATE TRIGGER trg_student_notif_prefs
    AFTER INSERT ON students
    FOR EACH ROW
    EXECUTE FUNCTION create_default_notification_preferences();

DROP TRIGGER IF EXISTS trg_teacher_notif_prefs ON teachers;
CREATE TRIGGER trg_teacher_notif_prefs
    AFTER INSERT ON teachers
    FOR EACH ROW
    EXECUTE FUNCTION create_default_notification_preferences();

DO $$ 
BEGIN
    RAISE NOTICE '✓ Created triggers for auto-generating notification preferences';
END $$;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_notification_preferences_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notif_pref_updated ON notification_preferences;
CREATE TRIGGER trg_notif_pref_updated
    BEFORE UPDATE ON notification_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_notification_preferences_timestamp();

-- ============================================================
-- VIEWS FOR EASY QUERYING
-- ============================================================

-- View: User Notification Settings
CREATE OR REPLACE VIEW v_user_notification_settings AS
SELECT 
    np.id,
    np.user_id,
    np.user_type,
    CASE 
        WHEN np.user_type = 'student' THEN s.name
        WHEN np.user_type = 'teacher' THEN t.name
        ELSE 'Admin'
    END as user_name,
    CASE 
        WHEN np.user_type = 'student' THEN s.email
        WHEN np.user_type = 'teacher' THEN t.email
        ELSE NULL
    END as user_email,
    ne.event_code,
    ne.event_name,
    ne.category,
    np.email_enabled,
    np.sms_enabled,
    np.updated_at
FROM notification_preferences np
JOIN notification_events ne ON np.event_code = ne.event_code
LEFT JOIN students s ON np.user_id = s.id AND np.user_type = 'student'
LEFT JOIN teachers t ON np.user_id = t.id AND np.user_type = 'teacher'
ORDER BY np.user_type, np.user_id, ne.category;

-- View: Recent Notifications
CREATE OR REPLACE VIEW v_recent_notifications AS
SELECT 
    nl.id,
    nl.event_code,
    ne.event_name,
    ne.category,
    nl.recipient_id,
    nl.recipient_type,
    nl.recipient_email,
    nl.channel,
    nl.status,
    nl.subject,
    nl.message,
    nl.metadata,
    nl.sent_at,
    nl.created_at,
    CASE 
        WHEN nl.recipient_type = 'student' THEN s.name
        WHEN nl.recipient_type = 'teacher' THEN t.name
        ELSE 'Admin'
    END as recipient_name
FROM notification_logs nl
JOIN notification_events ne ON nl.event_code = ne.event_code
LEFT JOIN students s ON nl.recipient_id = s.id AND nl.recipient_type = 'student'
LEFT JOIN teachers t ON nl.recipient_id = t.id AND nl.recipient_type = 'teacher'
ORDER BY nl.created_at DESC;

-- View: Notification Statistics
CREATE OR REPLACE VIEW v_notification_stats AS
SELECT 
    event_code,
    channel,
    status,
    COUNT(*) as count,
    DATE(created_at) as date
FROM notification_logs
GROUP BY event_code, channel, status, DATE(created_at)
ORDER BY date DESC, event_code;

DO $$ 
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE '✅ NOTIFICATION SYSTEM SETUP COMPLETE';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Tables Created:';
    RAISE NOTICE '  • notification_events (% event types)', (SELECT COUNT(*) FROM notification_events);
    RAISE NOTICE '  • notification_preferences';
    RAISE NOTICE '  • notification_logs';
    RAISE NOTICE '  • notification_queue';
    RAISE NOTICE '';
    RAISE NOTICE 'Views Created:';
    RAISE NOTICE '  • v_user_notification_settings';
    RAISE NOTICE '  • v_recent_notifications';
    RAISE NOTICE '  • v_notification_stats';
    RAISE NOTICE '';
    RAISE NOTICE 'Ready for email/SMS notifications!';
    RAISE NOTICE '========================================';
END $$;
