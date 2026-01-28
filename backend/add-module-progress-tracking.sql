-- ============================================================
-- MODULE PROGRESS TRACKING SYSTEM
-- Run this in your Neon PostgreSQL console
-- ============================================================

-- 1. Create module_progress table to track student completion
-- ============================================================
CREATE TABLE IF NOT EXISTS module_progress (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    module_id INTEGER NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
    is_completed BOOLEAN DEFAULT FALSE,
    completed_at TIMESTAMP,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_accessed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id, module_id)
);

CREATE INDEX IF NOT EXISTS idx_module_progress_student ON module_progress(student_id);
CREATE INDEX IF NOT EXISTS idx_module_progress_module ON module_progress(module_id);
CREATE INDEX IF NOT EXISTS idx_module_progress_completed ON module_progress(is_completed);

SELECT '[OK] Created module_progress table' as status;

-- 2. Create view for student module progress
-- ============================================================
CREATE OR REPLACE VIEW v_student_module_progress AS
SELECT 
    s.id as student_id,
    s.name as student_name,
    s.reg_no,
    s.class_dept,
    s.section,
    COUNT(DISTINCT m.id) as total_modules,
    COUNT(DISTINCT CASE WHEN mp.is_completed = TRUE THEN m.id END) as completed_modules,
    COUNT(DISTINCT CASE WHEN mp.is_completed = FALSE OR mp.id IS NULL THEN m.id END) as pending_modules,
    CASE 
        WHEN COUNT(DISTINCT m.id) > 0 
        THEN ROUND((COUNT(DISTINCT CASE WHEN mp.is_completed = TRUE THEN m.id END)::NUMERIC / COUNT(DISTINCT m.id)::NUMERIC) * 100, 2)
        ELSE 0 
    END as completion_percentage
FROM students s
LEFT JOIN modules m ON LOWER(m.section) = LOWER(s.class_dept || ' ' || s.section)
LEFT JOIN module_progress mp ON m.id = mp.module_id AND mp.student_id = s.id
GROUP BY s.id, s.name, s.reg_no, s.class_dept, s.section;

SELECT '[OK] Created v_student_module_progress view' as status;

-- 3. Create view for module statistics
-- ============================================================
CREATE OR REPLACE VIEW v_module_statistics AS
SELECT 
    m.id as module_id,
    m.topic_title,
    m.section,
    m.teacher_name,
    m.step_count,
    m.created_at,
    COUNT(DISTINCT s.id) as total_students,
    COUNT(DISTINCT CASE WHEN mp.is_completed = TRUE THEN s.id END) as completed_count,
    COUNT(DISTINCT CASE WHEN mp.is_completed = FALSE THEN s.id END) as in_progress_count,
    COUNT(DISTINCT CASE WHEN mp.id IS NULL THEN s.id END) as not_started_count,
    CASE 
        WHEN COUNT(DISTINCT s.id) > 0 
        THEN ROUND((COUNT(DISTINCT CASE WHEN mp.is_completed = TRUE THEN s.id END)::NUMERIC / COUNT(DISTINCT s.id)::NUMERIC) * 100, 2)
        ELSE 0 
    END as completion_rate
FROM modules m
LEFT JOIN students s ON LOWER(m.section) = LOWER(s.class_dept || ' ' || s.section)
LEFT JOIN module_progress mp ON m.id = mp.module_id AND mp.student_id = s.id
GROUP BY m.id, m.topic_title, m.section, m.teacher_name, m.step_count, m.created_at;

SELECT '[OK] Created v_module_statistics view' as status;

-- 4. Create function to mark module as complete
-- ============================================================
CREATE OR REPLACE FUNCTION mark_module_complete(p_student_id INTEGER, p_module_id INTEGER)
RETURNS BOOLEAN AS $$
BEGIN
    INSERT INTO module_progress (student_id, module_id, is_completed, completed_at, last_accessed)
    VALUES (p_student_id, p_module_id, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT (student_id, module_id) 
    DO UPDATE SET 
        is_completed = TRUE,
        completed_at = CURRENT_TIMESTAMP,
        last_accessed = CURRENT_TIMESTAMP;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

SELECT '[OK] Created mark_module_complete function' as status;

-- 5. Create function to track module access
-- ============================================================
CREATE OR REPLACE FUNCTION track_module_access(p_student_id INTEGER, p_module_id INTEGER)
RETURNS BOOLEAN AS $$
BEGIN
    INSERT INTO module_progress (student_id, module_id, is_completed, last_accessed)
    VALUES (p_student_id, p_module_id, FALSE, CURRENT_TIMESTAMP)
    ON CONFLICT (student_id, module_id) 
    DO UPDATE SET last_accessed = CURRENT_TIMESTAMP;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

SELECT '[OK] Created track_module_access function' as status;

-- 6. Verification
-- ============================================================
SELECT 
    'Module progress tracking setup complete!' as message,
    (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'module_progress') as tables_created,
    (SELECT COUNT(*) FROM information_schema.views WHERE table_name IN ('v_student_module_progress', 'v_module_statistics')) as views_created,
    (SELECT COUNT(*) FROM information_schema.routines WHERE routine_name IN ('mark_module_complete', 'track_module_access')) as functions_created;
