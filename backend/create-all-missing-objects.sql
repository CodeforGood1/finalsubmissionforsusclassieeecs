-- ============================================================
-- COMPLETE DATABASE OBJECTS SETUP
-- Run this entire script in your Neon PostgreSQL console
-- ============================================================

-- 1. CREATE v_teacher_students VIEW
-- ============================================================
DROP VIEW IF EXISTS v_teacher_students CASCADE;

CREATE VIEW v_teacher_students AS
SELECT 
    t.id as teacher_id,
    t.name as teacher_name,
    t.dept as teacher_dept,
    s.id as student_id,
    s.name as student_name,
    s.email as student_email,
    s.reg_no,
    s.class_dept,
    s.section,
    a.subject,
    a.allocated_at
FROM teachers t
INNER JOIN teacher_student_allocations a ON t.id = a.teacher_id
INNER JOIN students s ON a.student_id = s.id;

SELECT '✓ Created v_teacher_students view' as status;

-- 2. CREATE v_student_teachers VIEW
-- ============================================================
DROP VIEW IF EXISTS v_student_teachers CASCADE;

CREATE VIEW v_student_teachers AS
SELECT 
    s.id as student_id,
    s.name as student_name,
    s.reg_no,
    s.class_dept,
    s.section,
    t.id as teacher_id,
    t.name as teacher_name,
    t.dept as teacher_dept,
    a.subject,
    a.allocated_at
FROM students s
INNER JOIN teacher_student_allocations a ON s.id = a.student_id
INNER JOIN teachers t ON a.teacher_id = t.id;

SELECT '✓ Created v_student_teachers view' as status;

-- 3. CREATE v_test_statistics VIEW
-- ============================================================
DROP VIEW IF EXISTS v_test_statistics CASCADE;

CREATE VIEW v_test_statistics AS
SELECT 
    t.id as test_id,
    t.teacher_id,
    t.teacher_name,
    t.section,
    t.title,
    t.description,
    t.total_questions,
    t.start_date,
    t.deadline,
    t.is_active,
    t.created_at,
    COUNT(DISTINCT sub.id) as total_submissions,
    COALESCE(ROUND(AVG(sub.percentage), 2), 0) as average_score,
    COUNT(DISTINCT CASE WHEN sub.percentage >= 50 THEN sub.id END) as passed_count,
    COUNT(DISTINCT CASE WHEN sub.percentage < 50 THEN sub.id END) as failed_count
FROM mcq_tests t
LEFT JOIN test_submissions sub ON t.id = sub.test_id
GROUP BY t.id, t.teacher_id, t.teacher_name, t.section, t.title, 
         t.description, t.total_questions, t.start_date, t.deadline, 
         t.is_active, t.created_at;

SELECT '✓ Created v_test_statistics view' as status;

-- 4. CREATE v_student_test_progress VIEW
-- ============================================================
DROP VIEW IF EXISTS v_student_test_progress CASCADE;

CREATE VIEW v_student_test_progress AS
SELECT 
    s.id as student_id,
    s.name as student_name,
    s.reg_no,
    s.class_dept,
    s.section,
    COUNT(DISTINCT t.id) as total_tests_assigned,
    COUNT(DISTINCT sub.id) as tests_completed,
    COUNT(DISTINCT CASE 
        WHEN t.deadline < CURRENT_TIMESTAMP AND sub.id IS NULL 
        THEN t.id 
    END) as tests_overdue,
    COALESCE(ROUND(AVG(sub.percentage), 2), 0) as average_score
FROM students s
LEFT JOIN mcq_tests t ON LOWER(t.section) = LOWER(s.class_dept || ' ' || s.section)
    AND t.is_active = true
LEFT JOIN test_submissions sub ON t.id = sub.test_id AND sub.student_id = s.id
GROUP BY s.id, s.name, s.reg_no, s.class_dept, s.section;

SELECT '✓ Created v_student_test_progress view' as status;

-- 5. CREATE get_student_detailed_progress FUNCTION
-- ============================================================
DROP FUNCTION IF EXISTS get_student_detailed_progress(INTEGER) CASCADE;

CREATE OR REPLACE FUNCTION get_student_detailed_progress(p_student_id INTEGER)
RETURNS TABLE(
    test_id INTEGER,
    test_title VARCHAR,
    test_deadline TIMESTAMP,
    is_completed BOOLEAN,
    is_overdue BOOLEAN,
    score INTEGER,
    percentage NUMERIC,
    submitted_at TIMESTAMP
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.id as test_id,
        t.title as test_title,
        t.deadline as test_deadline,
        CASE WHEN sub.id IS NOT NULL THEN TRUE ELSE FALSE END as is_completed,
        CASE 
            WHEN sub.id IS NULL AND t.deadline < CURRENT_TIMESTAMP THEN TRUE 
            ELSE FALSE 
        END as is_overdue,
        sub.score,
        sub.percentage,
        sub.submitted_at
    FROM mcq_tests t
    LEFT JOIN test_submissions sub ON t.id = sub.test_id AND sub.student_id = p_student_id
    LEFT JOIN students s ON s.id = p_student_id
    WHERE LOWER(t.section) = LOWER(s.class_dept || ' ' || s.section)
    AND t.is_active = true
    ORDER BY t.deadline DESC;
END;
$$ LANGUAGE plpgsql;

SELECT '✓ Created get_student_detailed_progress function' as status;

-- 6. VERIFICATION
-- ============================================================
SELECT 
    'Database objects created successfully!' as message,
    (SELECT COUNT(*) FROM information_schema.views WHERE table_schema = 'public' 
     AND table_name IN ('v_teacher_students', 'v_student_teachers', 'v_test_statistics', 'v_student_test_progress')) as views_created,
    (SELECT COUNT(*) FROM information_schema.routines WHERE routine_schema = 'public' 
     AND routine_name = 'get_student_detailed_progress') as functions_created;

-- Test queries (optional - uncomment to test)
-- SELECT * FROM v_teacher_students LIMIT 5;
-- SELECT * FROM v_test_statistics LIMIT 5;
-- SELECT * FROM v_student_test_progress LIMIT 5;
