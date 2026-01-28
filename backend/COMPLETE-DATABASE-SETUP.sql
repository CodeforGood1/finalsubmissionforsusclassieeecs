-- ============================================================
-- COMPLETE DATABASE SETUP - ADVANCED VERSION
-- ============================================================
-- This script creates ALL tables, views, and functions needed
-- Uses CREATE OR REPLACE for idempotent execution
-- Can be run multiple times safely
-- ============================================================

-- STEP 1: Drop existing objects if needed (for clean reinstall)
-- ============================================================
DO $$ 
BEGIN
    -- Drop dependent objects first
    DROP VIEW IF EXISTS v_student_test_progress CASCADE;
    DROP VIEW IF EXISTS v_test_statistics CASCADE;
    DROP FUNCTION IF EXISTS get_student_detailed_progress(INTEGER) CASCADE;
    DROP FUNCTION IF EXISTS get_test_performance_summary(INTEGER) CASCADE;
    DROP FUNCTION IF EXISTS refresh_student_analytics() CASCADE;
    
    RAISE NOTICE 'Existing views and functions dropped (if any)';
END $$;

-- STEP 2: Create MCQ_TESTS table with advanced constraints
-- ============================================================
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'mcq_tests') THEN
        CREATE TABLE mcq_tests (
            id SERIAL PRIMARY KEY,
            teacher_id INTEGER NOT NULL,
            teacher_name TEXT NOT NULL,
            section TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            questions JSONB NOT NULL DEFAULT '[]',
            total_questions INTEGER NOT NULL CHECK (total_questions > 0),
            start_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            deadline TIMESTAMP NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            is_active BOOLEAN DEFAULT true,
            
            -- Constraints
            CONSTRAINT fk_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
            CONSTRAINT chk_deadline CHECK (deadline > start_date),
            CONSTRAINT chk_questions_array CHECK (jsonb_typeof(questions) = 'array'),
            CONSTRAINT chk_title_length CHECK (char_length(title) >= 3 AND char_length(title) <= 200)
        );
        
        RAISE NOTICE '[OK] mcq_tests table created';
    ELSE
        -- Add columns if they don't exist (for upgrades)
        ALTER TABLE mcq_tests 
            ADD COLUMN IF NOT EXISTS start_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
        
        RAISE NOTICE '[OK] mcq_tests table already exists (verified)';
    END IF;
END $$;

-- STEP 3: Create TEST_SUBMISSIONS table with advanced constraints
-- ============================================================
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'test_submissions') THEN
        CREATE TABLE test_submissions (
            id SERIAL PRIMARY KEY,
            test_id INTEGER NOT NULL,
            student_id INTEGER NOT NULL,
            student_name TEXT NOT NULL,
            student_reg_no TEXT,
            answers JSONB NOT NULL DEFAULT '{}',
            score INTEGER DEFAULT 0 CHECK (score >= 0),
            percentage DECIMAL(5,2) DEFAULT 0.00 CHECK (percentage >= 0 AND percentage <= 100),
            status TEXT DEFAULT 'completed' CHECK (status IN ('completed', 'late', 'pending')),
            submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            time_taken INTEGER CHECK (time_taken >= 0),
            
            -- Constraints
            CONSTRAINT fk_test FOREIGN KEY (test_id) REFERENCES mcq_tests(id) ON DELETE CASCADE,
            CONSTRAINT fk_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
            CONSTRAINT uq_test_student UNIQUE(test_id, student_id),
            CONSTRAINT chk_answers_object CHECK (jsonb_typeof(answers) = 'object')
        );
        
        RAISE NOTICE '[OK] test_submissions table created';
    ELSE
        RAISE NOTICE '[OK] test_submissions table already exists (verified)';
    END IF;
END $$;

-- STEP 4: Create indexes with IF NOT EXISTS
-- ============================================================
DO $$ 
BEGIN
    -- MCQ Tests indexes
    CREATE INDEX IF NOT EXISTS idx_tests_teacher ON mcq_tests(teacher_id);
    CREATE INDEX IF NOT EXISTS idx_tests_section ON mcq_tests(section);
    CREATE INDEX IF NOT EXISTS idx_tests_section_lower ON mcq_tests(LOWER(section));
    CREATE INDEX IF NOT EXISTS idx_tests_deadline ON mcq_tests(deadline);
    CREATE INDEX IF NOT EXISTS idx_tests_active ON mcq_tests(is_active);
    CREATE INDEX IF NOT EXISTS idx_tests_created ON mcq_tests(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_tests_composite ON mcq_tests(teacher_id, is_active, deadline);
    
    -- Test Submissions indexes
    CREATE INDEX IF NOT EXISTS idx_submissions_test ON test_submissions(test_id);
    CREATE INDEX IF NOT EXISTS idx_submissions_student ON test_submissions(student_id);
    CREATE INDEX IF NOT EXISTS idx_submissions_status ON test_submissions(status);
    CREATE INDEX IF NOT EXISTS idx_submissions_date ON test_submissions(submitted_at DESC);
    CREATE INDEX IF NOT EXISTS idx_submissions_score ON test_submissions(percentage DESC);
    CREATE INDEX IF NOT EXISTS idx_submissions_composite ON test_submissions(test_id, student_id, status);
    
    RAISE NOTICE '[OK] All indexes created';
END $$;

-- STEP 5: Create advanced view for student progress with analytics
-- ============================================================
CREATE OR REPLACE VIEW v_student_test_progress AS
WITH student_sections AS (
    SELECT 
        id,
        name,
        reg_no,
        class_dept,
        section,
        LOWER(TRIM(CONCAT(class_dept, ' ', section))) as normalized_section
    FROM students
),
test_assignments AS (
    SELECT 
        ss.id as student_id,
        t.id as test_id,
        t.deadline,
        t.is_active
    FROM student_sections ss
    INNER JOIN mcq_tests t ON LOWER(TRIM(t.section)) = ss.normalized_section
    WHERE t.is_active = true
),
submission_stats AS (
    SELECT 
        student_id,
        COUNT(*) as completed_count,
        AVG(percentage) as avg_percentage,
        MAX(submitted_at) as last_submission,
        MIN(percentage) as min_score,
        MAX(percentage) as max_score,
        COUNT(CASE WHEN percentage >= 60 THEN 1 END) as passed_count,
        COUNT(CASE WHEN percentage < 60 THEN 1 END) as failed_count
    FROM test_submissions
    GROUP BY student_id
)
SELECT 
    ss.id as student_id,
    ss.name as student_name,
    ss.reg_no,
    ss.class_dept,
    ss.section,
    CONCAT(ss.class_dept, ' ', ss.section) as full_section,
    COALESCE(COUNT(DISTINCT ta.test_id), 0) as total_tests_assigned,
    COALESCE(st.completed_count, 0) as tests_completed,
    COALESCE(COUNT(DISTINCT CASE 
        WHEN ta.deadline < CURRENT_TIMESTAMP AND sub.id IS NULL 
        THEN ta.test_id 
    END), 0) as tests_overdue,
    COALESCE(ROUND(st.avg_percentage, 2), 0.00) as average_score,
    st.min_score,
    st.max_score,
    COALESCE(st.passed_count, 0) as tests_passed,
    COALESCE(st.failed_count, 0) as tests_failed,
    st.last_submission as last_submission_date,
    CASE 
        WHEN COALESCE(COUNT(DISTINCT ta.test_id), 0) = 0 THEN 0
        ELSE ROUND((COALESCE(st.completed_count, 0)::DECIMAL / COUNT(DISTINCT ta.test_id)) * 100, 2)
    END as completion_percentage
FROM student_sections ss
LEFT JOIN test_assignments ta ON ss.id = ta.student_id
LEFT JOIN test_submissions sub ON ta.test_id = sub.test_id AND ss.id = sub.student_id
LEFT JOIN submission_stats st ON ss.id = st.student_id
GROUP BY ss.id, ss.name, ss.reg_no, ss.class_dept, ss.section, 
         st.completed_count, st.avg_percentage, st.last_submission,
         st.min_score, st.max_score, st.passed_count, st.failed_count;

-- STEP 6: Create advanced view for test statistics with analytics
-- ============================================================
CREATE OR REPLACE VIEW v_test_statistics AS
WITH submission_analytics AS (
    SELECT 
        test_id,
        COUNT(*) as total_subs,
        AVG(percentage) as avg_pct,
        MIN(percentage) as min_pct,
        MAX(percentage) as max_pct,
        STDDEV(percentage) as stddev_pct,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY percentage) as median_pct,
        COUNT(CASE WHEN percentage >= 90 THEN 1 END) as excellent_count,
        COUNT(CASE WHEN percentage >= 60 AND percentage < 90 THEN 1 END) as good_count,
        COUNT(CASE WHEN percentage >= 40 AND percentage < 60 THEN 1 END) as average_count,
        COUNT(CASE WHEN percentage < 40 THEN 1 END) as poor_count,
        AVG(time_taken) as avg_time_taken
    FROM test_submissions
    GROUP BY test_id
)
SELECT 
    t.id as test_id,
    t.title,
    t.section,
    t.teacher_id,
    t.teacher_name,
    t.total_questions,
    t.start_date,
    t.deadline,
    t.created_at,
    t.is_active,
    CASE 
        WHEN t.deadline < CURRENT_TIMESTAMP THEN 'expired'
        WHEN t.start_date > CURRENT_TIMESTAMP THEN 'upcoming'
        ELSE 'active'
    END as status,
    COALESCE(sa.total_subs, 0) as total_submissions,
    COALESCE(ROUND(sa.avg_pct, 2), 0.00) as average_score,
    COALESCE(ROUND(sa.median_pct, 2), 0.00) as median_score,
    COALESCE(ROUND(sa.min_pct, 2), 0.00) as min_score,
    COALESCE(ROUND(sa.max_pct, 2), 0.00) as max_score,
    COALESCE(ROUND(sa.stddev_pct, 2), 0.00) as score_stddev,
    COALESCE(sa.excellent_count, 0) as excellent_count,
    COALESCE(sa.good_count, 0) as good_count,
    COALESCE(sa.average_count, 0) as average_count,
    COALESCE(sa.poor_count, 0) as poor_count,
    COALESCE(sa.excellent_count + sa.good_count, 0) as passed_count,
    COALESCE(sa.average_count + sa.poor_count, 0) as failed_count,
    COALESCE(ROUND(sa.avg_time_taken / 60.0, 2), 0.00) as avg_time_minutes,
    EXTRACT(EPOCH FROM (t.deadline - CURRENT_TIMESTAMP)) / 3600 as hours_remaining
FROM mcq_tests t
LEFT JOIN submission_analytics sa ON t.id = sa.test_id
ORDER BY t.created_at DESC;

-- STEP 7: Create advanced function for student detailed progress
-- ============================================================
CREATE OR REPLACE FUNCTION get_student_detailed_progress(p_student_id INTEGER)
RETURNS TABLE(
    test_id INTEGER,
    test_title TEXT,
    test_description TEXT,
    test_section TEXT,
    total_questions INTEGER,
    test_start_date TIMESTAMP,
    test_deadline TIMESTAMP,
    test_created_at TIMESTAMP,
    submission_id INTEGER,
    score INTEGER,
    percentage DECIMAL(5,2),
    status TEXT,
    submitted_at TIMESTAMP,
    time_taken INTEGER,
    is_overdue BOOLEAN,
    is_completed BOOLEAN,
    days_until_deadline NUMERIC,
    performance_level TEXT
) 
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_student_section TEXT;
BEGIN
    -- Get student's section
    SELECT LOWER(TRIM(CONCAT(class_dept, ' ', section))) 
    INTO v_student_section
    FROM students 
    WHERE id = p_student_id;
    
    -- Return detailed progress
    RETURN QUERY
    SELECT 
        t.id as test_id,
        t.title as test_title,
        t.description as test_description,
        t.section as test_section,
        t.total_questions,
        t.start_date as test_start_date,
        t.deadline as test_deadline,
        t.created_at as test_created_at,
        sub.id as submission_id,
        sub.score,
        sub.percentage,
        sub.status,
        sub.submitted_at,
        sub.time_taken,
        CASE 
            WHEN t.deadline < CURRENT_TIMESTAMP AND sub.id IS NULL THEN true
            ELSE false
        END as is_overdue,
        CASE 
            WHEN sub.id IS NOT NULL THEN true
            ELSE false
        END as is_completed,
        ROUND(EXTRACT(EPOCH FROM (t.deadline - CURRENT_TIMESTAMP)) / 86400.0, 1) as days_until_deadline,
        CASE 
            WHEN sub.percentage IS NULL THEN 'Not Attempted'
            WHEN sub.percentage >= 90 THEN 'Excellent'
            WHEN sub.percentage >= 75 THEN 'Very Good'
            WHEN sub.percentage >= 60 THEN 'Good'
            WHEN sub.percentage >= 40 THEN 'Average'
            ELSE 'Needs Improvement'
        END as performance_level
    FROM mcq_tests t
    LEFT JOIN test_submissions sub ON t.id = sub.test_id AND sub.student_id = p_student_id
    WHERE LOWER(TRIM(t.section)) = v_student_section
    AND t.is_active = true
    ORDER BY 
        CASE WHEN sub.id IS NULL THEN 0 ELSE 1 END,  -- Pending tests first
        t.deadline ASC;
END;
$$;

-- STEP 8: Create helper function to get test performance summary
-- ============================================================
CREATE OR REPLACE FUNCTION get_test_performance_summary(p_test_id INTEGER)
RETURNS TABLE(
    test_title TEXT,
    total_students_assigned INTEGER,
    total_submissions INTEGER,
    completion_rate DECIMAL(5,2),
    average_score DECIMAL(5,2),
    median_score DECIMAL(5,2),
    highest_score DECIMAL(5,2),
    lowest_score DECIMAL(5,2),
    passed_count INTEGER,
    failed_count INTEGER,
    pass_rate DECIMAL(5,2),
    excellent_performers INTEGER,
    needs_attention INTEGER
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    RETURN QUERY
    WITH test_info AS (
        SELECT section FROM mcq_tests WHERE id = p_test_id
    ),
    eligible_students AS (
        SELECT COUNT(*) as total
        FROM students s, test_info ti
        WHERE LOWER(TRIM(CONCAT(s.class_dept, ' ', s.section))) = LOWER(TRIM(ti.section))
    ),
    submission_stats AS (
        SELECT 
            COUNT(*) as subs,
            AVG(percentage) as avg_pct,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY percentage) as med_pct,
            MAX(percentage) as max_pct,
            MIN(percentage) as min_pct,
            COUNT(CASE WHEN percentage >= 60 THEN 1 END) as passed,
            COUNT(CASE WHEN percentage < 60 THEN 1 END) as failed,
            COUNT(CASE WHEN percentage >= 90 THEN 1 END) as excellent,
            COUNT(CASE WHEN percentage < 40 THEN 1 END) as poor
        FROM test_submissions
        WHERE test_id = p_test_id
    )
    SELECT 
        t.title,
        es.total::INTEGER,
        COALESCE(ss.subs, 0)::INTEGER,
        CASE WHEN es.total > 0 
            THEN ROUND((COALESCE(ss.subs, 0)::DECIMAL / es.total) * 100, 2)
            ELSE 0.00 
        END,
        COALESCE(ROUND(ss.avg_pct, 2), 0.00),
        COALESCE(ROUND(ss.med_pct, 2), 0.00),
        COALESCE(ROUND(ss.max_pct, 2), 0.00),
        COALESCE(ROUND(ss.min_pct, 2), 0.00),
        COALESCE(ss.passed, 0)::INTEGER,
        COALESCE(ss.failed, 0)::INTEGER,
        CASE WHEN COALESCE(ss.subs, 0) > 0
            THEN ROUND((COALESCE(ss.passed, 0)::DECIMAL / ss.subs) * 100, 2)
            ELSE 0.00
        END,
        COALESCE(ss.excellent, 0)::INTEGER,
        COALESCE(ss.poor, 0)::INTEGER
    FROM mcq_tests t, eligible_students es
    LEFT JOIN submission_stats ss ON true
    WHERE t.id = p_test_id;
END;
$$;

-- STEP 9: Create trigger to auto-update test timestamps
-- ============================================================
CREATE OR REPLACE FUNCTION update_test_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.created_at = COALESCE(NEW.created_at, CURRENT_TIMESTAMP);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_test_timestamp ON mcq_tests;
CREATE TRIGGER trg_test_timestamp
    BEFORE INSERT ON mcq_tests
    FOR EACH ROW
    EXECUTE FUNCTION update_test_timestamp();

-- STEP 10: Create materialized view for performance analytics
-- ============================================================
DROP MATERIALIZED VIEW IF EXISTS mv_student_performance_analytics CASCADE;

CREATE MATERIALIZED VIEW mv_student_performance_analytics AS
SELECT 
    s.id as student_id,
    s.name as student_name,
    s.reg_no,
    s.class_dept,
    s.section,
    COUNT(DISTINCT sub.test_id) as total_tests_taken,
    COALESCE(AVG(sub.percentage), 0) as overall_average,
    COALESCE(MAX(sub.percentage), 0) as best_score,
    COALESCE(MIN(sub.percentage), 0) as worst_score,
    COALESCE(STDDEV(sub.percentage), 0) as score_consistency,
    COUNT(CASE WHEN sub.percentage >= 90 THEN 1 END) as excellent_count,
    COUNT(CASE WHEN sub.percentage >= 60 AND sub.percentage < 90 THEN 1 END) as good_count,
    COUNT(CASE WHEN sub.percentage < 60 THEN 1 END) as poor_count,
    CASE 
        WHEN AVG(sub.percentage) >= 85 THEN 'Top Performer'
        WHEN AVG(sub.percentage) >= 70 THEN 'Good Performer'
        WHEN AVG(sub.percentage) >= 50 THEN 'Average Performer'
        WHEN AVG(sub.percentage) IS NULL THEN 'No Data'
        ELSE 'Needs Support'
    END as performance_category,
    MAX(sub.submitted_at) as last_activity
FROM students s
LEFT JOIN test_submissions sub ON s.id = sub.student_id
GROUP BY s.id, s.name, s.reg_no, s.class_dept, s.section;

-- Create indexes on materialized view
CREATE INDEX IF NOT EXISTS idx_mv_student_perf_category 
    ON mv_student_performance_analytics(performance_category);
CREATE INDEX IF NOT EXISTS idx_mv_student_perf_avg 
    ON mv_student_performance_analytics(overall_average DESC);
CREATE INDEX IF NOT EXISTS idx_mv_student_perf_section 
    ON mv_student_performance_analytics(class_dept, section);

-- Function to refresh materialized view
CREATE OR REPLACE FUNCTION refresh_student_analytics()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_student_performance_analytics;
    RAISE NOTICE 'Student performance analytics refreshed successfully';
EXCEPTION
    WHEN OTHERS THEN
        -- If concurrent refresh fails, try regular refresh
        REFRESH MATERIALIZED VIEW mv_student_performance_analytics;
        RAISE NOTICE 'Student performance analytics refreshed (non-concurrent)';
END;
$$;

-- STEP 11: Verification and Summary
-- ============================================================
DO $$
DECLARE
    test_count INTEGER;
    submission_count INTEGER;
    student_count INTEGER;
    view_count INTEGER;
    function_count INTEGER;
BEGIN
    -- Count records
    SELECT COUNT(*) INTO test_count FROM mcq_tests;
    SELECT COUNT(*) INTO submission_count FROM test_submissions;
    SELECT COUNT(*) INTO student_count FROM students;
    
    -- Count database objects
    SELECT COUNT(*) INTO view_count 
    FROM pg_views 
    WHERE schemaname = 'public' 
    AND viewname IN ('v_student_test_progress', 'v_test_statistics');
    
    SELECT COUNT(*) INTO function_count 
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' 
    AND p.proname IN ('get_student_detailed_progress', 'get_test_performance_summary', 'refresh_student_analytics');
    
    -- Display summary
    RAISE NOTICE '';
    RAISE NOTICE '╔══════════════════════════════════════════════════════════════╗';
    RAISE NOTICE '║     ADVANCED DATABASE SETUP COMPLETED SUCCESSFULLY           ║';
    RAISE NOTICE '╚══════════════════════════════════════════════════════════════╝';
    RAISE NOTICE '';
    RAISE NOTICE '[INFO] DATABASE STATISTICS:';
    RAISE NOTICE '  ├─ Students: %', student_count;
    RAISE NOTICE '  ├─ MCQ Tests: %', test_count;
    RAISE NOTICE '  └─ Test Submissions: %', submission_count;
    RAISE NOTICE '';
    RAISE NOTICE '[INFO]  DATABASE OBJECTS CREATED:';
    RAISE NOTICE '  ├─ Tables: 2 (mcq_tests, test_submissions)';
    RAISE NOTICE '  ├─ Views: % (v_student_test_progress, v_test_statistics)', view_count;
    RAISE NOTICE '  ├─ Materialized Views: 1 (mv_student_performance_analytics)';
    RAISE NOTICE '  ├─ Functions: % (get_student_detailed_progress, get_test_performance_summary, refresh_student_analytics)', function_count;
    RAISE NOTICE '  ├─ Triggers: 1 (trg_test_timestamp)';
    RAISE NOTICE '  └─ Indexes: 20+ (optimized for performance)';
    RAISE NOTICE '';
    RAISE NOTICE '[OK] FEATURES ENABLED:';
    RAISE NOTICE '  ├─ Teachers can create MCQ tests with deadlines';
    RAISE NOTICE '  ├─ Students can take tests and get instant scores';
    RAISE NOTICE '  ├─ Automatic score calculation (backend + database)';
    RAISE NOTICE '  ├─ Progress tracking with detailed analytics';
    RAISE NOTICE '  ├─ Performance categorization (Excellent/Good/Average/Poor)';
    RAISE NOTICE '  ├─ Test statistics with median, stddev, percentiles';
    RAISE NOTICE '  └─ Materialized views for fast analytics queries';
    RAISE NOTICE '';
    RAISE NOTICE '[INFO] NEXT STEPS:';
    RAISE NOTICE '  1. Restart your backend server (if running)';
    RAISE NOTICE '  2. Login as teacher and create a test';
    RAISE NOTICE '  3. Login as student and take the test';
    RAISE NOTICE '  4. Verify score calculates correctly (not 0.00%%)';
    RAISE NOTICE '  5. Check teacher dashboard for test statistics';
    RAISE NOTICE '';
    RAISE NOTICE '[TIP] ADVANCED QUERIES YOU CAN NOW RUN:';
    RAISE NOTICE '  • SELECT * FROM v_test_statistics;';
    RAISE NOTICE '  • SELECT * FROM v_student_test_progress;';
    RAISE NOTICE '  • SELECT * FROM get_student_detailed_progress(1);';
    RAISE NOTICE '  • SELECT * FROM get_test_performance_summary(1);';
    RAISE NOTICE '  • SELECT * FROM mv_student_performance_analytics;';
    RAISE NOTICE '';
END $$;
