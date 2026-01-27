-- Create the missing get_student_detailed_progress function
-- Run this in your Neon PostgreSQL console

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

-- Verify it was created
SELECT 'Function created successfully!' as status;
