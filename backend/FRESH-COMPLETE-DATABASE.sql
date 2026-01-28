-- ============================================================
-- SUSTAINABLE CLASSROOM - COMPLETE DATABASE SETUP
-- ============================================================
-- Fresh installation script - Drops and recreates everything
-- Run this ONCE in Neon PostgreSQL SQL Editor
-- ============================================================

-- ============================================================
-- PART 1: CLEANUP - Drop all existing objects
-- ============================================================
DO $$ 
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '╔════════════════════════════════════════════════════════╗';
    RAISE NOTICE '║          STARTING FRESH DATABASE SETUP                 ║';
    RAISE NOTICE '╚════════════════════════════════════════════════════════╝';
    RAISE NOTICE '';
    RAISE NOTICE 'Step 1: Cleaning up existing objects...';
END $$;

-- Drop materialized views
DROP MATERIALIZED VIEW IF EXISTS mv_student_performance_analytics CASCADE;

-- Drop views
DROP VIEW IF EXISTS v_student_test_progress CASCADE;
DROP VIEW IF EXISTS v_test_statistics CASCADE;
DROP VIEW IF EXISTS v_teachers_with_stats CASCADE;
DROP VIEW IF EXISTS v_students_with_section CASCADE;
DROP VIEW IF EXISTS v_modules_detailed CASCADE;

-- Drop functions
DROP FUNCTION IF EXISTS get_student_detailed_progress(INTEGER) CASCADE;
DROP FUNCTION IF EXISTS get_test_performance_summary(INTEGER) CASCADE;
DROP FUNCTION IF EXISTS refresh_student_analytics() CASCADE;
DROP FUNCTION IF EXISTS calculate_test_score() CASCADE;
DROP FUNCTION IF EXISTS update_test_timestamp() CASCADE;
DROP FUNCTION IF EXISTS add_column_if_not_exists(TEXT, TEXT, TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS create_index_if_not_exists(TEXT, TEXT, TEXT) CASCADE;

-- Drop tables (in correct order due to foreign keys)
DROP TABLE IF EXISTS in_app_notifications CASCADE;
DROP TABLE IF EXISTS teacher_student_allocations CASCADE;
DROP TABLE IF EXISTS test_submissions CASCADE;
DROP TABLE IF EXISTS mcq_tests CASCADE;
DROP TABLE IF EXISTS modules CASCADE;
DROP TABLE IF EXISTS students CASCADE;
DROP TABLE IF EXISTS teachers CASCADE;

DO $$ 
BEGIN
    RAISE NOTICE '[OK] Cleanup completed';
    RAISE NOTICE '';
END $$;

-- ============================================================
-- PART 2: CREATE CORE TABLES
-- ============================================================
DO $$ 
BEGIN
    RAISE NOTICE 'Step 2: Creating core tables...';
END $$;

-- Table 1: TEACHERS
CREATE TABLE teachers (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    staff_id TEXT,
    dept TEXT,
    media JSONB DEFAULT '{}'::jsonb,
    allocated_sections JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT chk_email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    CONSTRAINT chk_name_length CHECK (char_length(name) >= 2)
);

-- Table 2: STUDENTS
CREATE TABLE students (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    reg_no TEXT,
    class_dept TEXT,
    section TEXT,
    media JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT chk_email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    CONSTRAINT chk_name_length CHECK (char_length(name) >= 2)
);

-- Table 3: MODULES
CREATE TABLE modules (
    id SERIAL PRIMARY KEY,
    section TEXT NOT NULL,
    topic_title TEXT NOT NULL,
    teacher_id INTEGER NOT NULL,
    teacher_name TEXT NOT NULL,
    step_count INTEGER DEFAULT 0,
    steps JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_modules_teacher FOREIGN KEY (teacher_id) 
        REFERENCES teachers(id) ON DELETE CASCADE,
    CONSTRAINT chk_step_count CHECK (step_count >= 0),
    CONSTRAINT chk_steps_array CHECK (jsonb_typeof(steps) = 'array')
);

DO $$ 
BEGIN
    RAISE NOTICE '[OK] Core tables created (teachers, students, modules)';
END $$;

-- ============================================================
-- PART 3: CREATE MCQ TEST SYSTEM TABLES
-- ============================================================
DO $$ 
BEGIN
    RAISE NOTICE 'Step 3: Creating MCQ test system tables...';
END $$;

-- Table 4: MCQ_TESTS (Teacher creates tests)
CREATE TABLE mcq_tests (
    id SERIAL PRIMARY KEY,
    teacher_id INTEGER NOT NULL,
    teacher_name TEXT NOT NULL,
    section TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    questions JSONB NOT NULL DEFAULT '[]'::jsonb,
    total_questions INTEGER NOT NULL,
    start_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deadline TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    
    CONSTRAINT fk_tests_teacher FOREIGN KEY (teacher_id) 
        REFERENCES teachers(id) ON DELETE CASCADE,
    CONSTRAINT chk_total_questions CHECK (total_questions > 0 AND total_questions <= 100),
    CONSTRAINT chk_deadline CHECK (deadline > start_date),
    CONSTRAINT chk_questions_array CHECK (jsonb_typeof(questions) = 'array'),
    CONSTRAINT chk_title_length CHECK (char_length(title) >= 3 AND char_length(title) <= 200)
);

-- Table 5: TEST_SUBMISSIONS (Student test results)
CREATE TABLE test_submissions (
    id SERIAL PRIMARY KEY,
    test_id INTEGER NOT NULL,
    student_id INTEGER NOT NULL,
    student_name TEXT NOT NULL,
    student_reg_no TEXT,
    answers JSONB NOT NULL DEFAULT '{}'::jsonb,
    score INTEGER DEFAULT 0,
    percentage DECIMAL(5,2) DEFAULT 0.00,
    status TEXT DEFAULT 'completed',
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    time_taken INTEGER,
    
    CONSTRAINT fk_submissions_test FOREIGN KEY (test_id) 
        REFERENCES mcq_tests(id) ON DELETE CASCADE,
    CONSTRAINT fk_submissions_student FOREIGN KEY (student_id) 
        REFERENCES students(id) ON DELETE CASCADE,
    CONSTRAINT uq_test_student UNIQUE(test_id, student_id),
    CONSTRAINT chk_score CHECK (score >= 0),
    CONSTRAINT chk_percentage CHECK (percentage >= 0 AND percentage <= 100),
    CONSTRAINT chk_status CHECK (status IN ('completed', 'late', 'pending')),
    CONSTRAINT chk_answers_object CHECK (jsonb_typeof(answers) = 'object'),
    CONSTRAINT chk_time_taken CHECK (time_taken IS NULL OR time_taken >= 0)
);

DO $$ 
BEGIN
    RAISE NOTICE '[OK] MCQ test tables created (mcq_tests, test_submissions)';
END $$;

-- ============================================================
-- PART 4: CREATE INDEXES FOR PERFORMANCE
-- ============================================================
DO $$ 
BEGIN
    RAISE NOTICE 'Step 4: Creating performance indexes...';
END $$;

-- Teachers indexes
CREATE INDEX idx_teachers_email ON teachers(email);
CREATE INDEX idx_teachers_staff_id ON teachers(staff_id) WHERE staff_id IS NOT NULL;
CREATE INDEX idx_teachers_dept ON teachers(dept) WHERE dept IS NOT NULL;

-- Students indexes
CREATE INDEX idx_students_email ON students(email);
CREATE INDEX idx_students_reg_no ON students(reg_no) WHERE reg_no IS NOT NULL;
CREATE INDEX idx_students_section ON students(class_dept, section);
CREATE INDEX idx_students_class_dept ON students(class_dept) WHERE class_dept IS NOT NULL;

-- Modules indexes
CREATE INDEX idx_modules_section ON modules(section);
CREATE INDEX idx_modules_teacher ON modules(teacher_id);
CREATE INDEX idx_modules_created ON modules(created_at DESC);

-- MCQ Tests indexes
CREATE INDEX idx_tests_teacher ON mcq_tests(teacher_id);
CREATE INDEX idx_tests_section ON mcq_tests(section);
CREATE INDEX idx_tests_section_lower ON mcq_tests(LOWER(section));
CREATE INDEX idx_tests_deadline ON mcq_tests(deadline);
CREATE INDEX idx_tests_active ON mcq_tests(is_active) WHERE is_active = true;
CREATE INDEX idx_tests_created ON mcq_tests(created_at DESC);
CREATE INDEX idx_tests_composite ON mcq_tests(teacher_id, is_active, deadline);

-- Test Submissions indexes
CREATE INDEX idx_submissions_test ON test_submissions(test_id);
CREATE INDEX idx_submissions_student ON test_submissions(student_id);
CREATE INDEX idx_submissions_status ON test_submissions(status);
CREATE INDEX idx_submissions_date ON test_submissions(submitted_at DESC);
CREATE INDEX idx_submissions_score ON test_submissions(percentage DESC);
CREATE INDEX idx_submissions_composite ON test_submissions(test_id, student_id, status);

DO $$ 
BEGIN
    RAISE NOTICE '[OK] All indexes created (25+ indexes for optimal performance)';
END $$;

-- ============================================================
-- PART 5: CREATE VIEWS FOR DATA ACCESS
-- ============================================================
DO $$ 
BEGIN
    RAISE NOTICE 'Step 5: Creating views...';
END $$;

-- View 1: Teachers with statistics
CREATE VIEW v_teachers_with_stats AS
SELECT 
    t.id,
    t.name,
    t.email,
    t.staff_id,
    t.dept,
    t.allocated_sections,
    t.created_at,
    COUNT(DISTINCT m.id) as module_count,
    COUNT(DISTINCT mt.id) as test_count
FROM teachers t
LEFT JOIN modules m ON t.id = m.teacher_id
LEFT JOIN mcq_tests mt ON t.id = mt.teacher_id
GROUP BY t.id, t.name, t.email, t.staff_id, t.dept, t.allocated_sections, t.created_at;

-- View 2: Students with section info
CREATE VIEW v_students_with_section AS
SELECT 
    s.id,
    s.name,
    s.email,
    s.reg_no,
    s.class_dept,
    s.section,
    CONCAT(s.class_dept, ' ', s.section) as full_section,
    s.created_at
FROM students s;

-- View 3: Modules with details
CREATE VIEW v_modules_detailed AS
SELECT 
    m.id,
    m.section,
    m.topic_title,
    m.teacher_id,
    m.teacher_name,
    m.step_count,
    m.created_at,
    t.dept as teacher_dept,
    t.email as teacher_email
FROM modules m
LEFT JOIN teachers t ON m.teacher_id = t.id;

DO $$ 
BEGIN
    RAISE NOTICE '[OK] Basic views created';
END $$;

-- ============================================================
-- PART 6: CREATE ADVANCED MCQ VIEWS
-- ============================================================
DO $$ 
BEGIN
    RAISE NOTICE 'Step 6: Creating MCQ analytics views...';
END $$;

-- View 4: Student test progress (for teacher dashboard)
CREATE VIEW v_student_test_progress AS
WITH student_sections AS (
    SELECT 
        id, name, reg_no, class_dept, section,
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

DO $$ 
BEGIN
    RAISE NOTICE '[OK] Student progress view created';
END $$;

-- View 5: Test statistics (for teacher dashboard test list)
CREATE VIEW v_test_statistics AS
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

DO $$ 
BEGIN
    RAISE NOTICE '[OK] Test statistics view created';
END $$;

-- ============================================================
-- PART 7: CREATE FUNCTIONS
-- ============================================================
DO $$ 
BEGIN
    RAISE NOTICE 'Step 7: Creating functions...';
END $$;

-- Function 1: Get student detailed progress
CREATE FUNCTION get_student_detailed_progress(p_student_id INTEGER)
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
    SELECT LOWER(TRIM(CONCAT(class_dept, ' ', section))) 
    INTO v_student_section
    FROM students 
    WHERE id = p_student_id;
    
    RETURN QUERY
    SELECT 
        t.id,
        t.title,
        t.description,
        t.section,
        t.total_questions,
        t.start_date,
        t.deadline,
        t.created_at,
        sub.id,
        sub.score,
        sub.percentage,
        sub.status,
        sub.submitted_at,
        sub.time_taken,
        CASE 
            WHEN t.deadline < CURRENT_TIMESTAMP AND sub.id IS NULL THEN true
            ELSE false
        END,
        CASE 
            WHEN sub.id IS NOT NULL THEN true
            ELSE false
        END,
        ROUND(EXTRACT(EPOCH FROM (t.deadline - CURRENT_TIMESTAMP)) / 86400.0, 1),
        CASE 
            WHEN sub.percentage IS NULL THEN 'Not Attempted'
            WHEN sub.percentage >= 90 THEN 'Excellent'
            WHEN sub.percentage >= 75 THEN 'Very Good'
            WHEN sub.percentage >= 60 THEN 'Good'
            WHEN sub.percentage >= 40 THEN 'Average'
            ELSE 'Needs Improvement'
        END
    FROM mcq_tests t
    LEFT JOIN test_submissions sub ON t.id = sub.test_id AND sub.student_id = p_student_id
    WHERE LOWER(TRIM(t.section)) = v_student_section
    AND t.is_active = true
    ORDER BY 
        CASE WHEN sub.id IS NULL THEN 0 ELSE 1 END,
        t.deadline ASC;
END;
$$;

DO $$ 
BEGIN
    RAISE NOTICE '[OK] Function get_student_detailed_progress created';
END $$;

-- Function 2: Get test performance summary
CREATE FUNCTION get_test_performance_summary(p_test_id INTEGER)
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

DO $$ 
BEGIN
    RAISE NOTICE '[OK] Function get_test_performance_summary created';
END $$;

-- ============================================================
-- PART 8: CREATE TRIGGERS
-- ============================================================
DO $$ 
BEGIN
    RAISE NOTICE 'Step 8: Creating triggers...';
END $$;

-- Trigger function: Auto-update timestamps
CREATE FUNCTION update_test_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.created_at = COALESCE(NEW.created_at, CURRENT_TIMESTAMP);
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_test_timestamp
    BEFORE INSERT ON mcq_tests
    FOR EACH ROW
    EXECUTE FUNCTION update_test_timestamp();

DO $$ 
BEGIN
    RAISE NOTICE '[OK] Triggers created';
END $$;

-- ============================================================
-- PART 9: CREATE MATERIALIZED VIEW
-- ============================================================
DO $$ 
BEGIN
    RAISE NOTICE 'Step 9: Creating materialized views...';
END $$;

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

CREATE INDEX idx_mv_student_perf_category ON mv_student_performance_analytics(performance_category);
CREATE INDEX idx_mv_student_perf_avg ON mv_student_performance_analytics(overall_average DESC);
CREATE INDEX idx_mv_student_perf_section ON mv_student_performance_analytics(class_dept, section);

-- Function to refresh materialized view
CREATE FUNCTION refresh_student_analytics()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_student_performance_analytics;
    RAISE NOTICE 'Student performance analytics refreshed';
EXCEPTION
    WHEN OTHERS THEN
        REFRESH MATERIALIZED VIEW mv_student_performance_analytics;
        RAISE NOTICE 'Student performance analytics refreshed (non-concurrent)';
END;
$$;

DO $$ 
BEGIN
    RAISE NOTICE '[OK] Materialized view created';
END $$;

-- ============================================================
-- PART 10: GRANT PERMISSIONS (if using specific roles)
-- ============================================================
DO $$ 
BEGIN
    RAISE NOTICE 'Step 10: Setting permissions...';
    
    -- Grant permissions to public (adjust if you have specific roles)
    -- Uncomment and modify if needed:
    -- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO your_app_user;
    -- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO your_app_user;
    -- GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO your_app_user;
    
    RAISE NOTICE '[OK] Permissions configured (using default public access)';
END $$;

-- ============================================================
-- PART 11: VERIFICATION & SUMMARY
-- ============================================================
DO $$
DECLARE
    teacher_count INTEGER;
    student_count INTEGER;
    module_count INTEGER;
    test_count INTEGER;
    submission_count INTEGER;
    table_count INTEGER;
    view_count INTEGER;
    function_count INTEGER;
    index_count INTEGER;
BEGIN
    -- Count records
    SELECT COUNT(*) INTO teacher_count FROM teachers;
    SELECT COUNT(*) INTO student_count FROM students;
    SELECT COUNT(*) INTO module_count FROM modules;
    SELECT COUNT(*) INTO test_count FROM mcq_tests;
    SELECT COUNT(*) INTO submission_count FROM test_submissions;
    
    -- Count database objects
    SELECT COUNT(*) INTO table_count 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_type = 'BASE TABLE';
    
    SELECT COUNT(*) INTO view_count 
    FROM pg_views 
    WHERE schemaname = 'public';
    
    SELECT COUNT(*) INTO function_count 
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' 
    AND p.prokind = 'f';
    
    SELECT COUNT(*) INTO index_count 
    FROM pg_indexes 
    WHERE schemaname = 'public';
    
    -- Display summary
    RAISE NOTICE '';
    RAISE NOTICE '╔══════════════════════════════════════════════════════════════╗';
    RAISE NOTICE '║                                                              ║';
    RAISE NOTICE '║     [OK] DATABASE SETUP COMPLETED SUCCESSFULLY                  ║';
    RAISE NOTICE '║                                                              ║';
    RAISE NOTICE '╚══════════════════════════════════════════════════════════════╝';
    RAISE NOTICE '';
    RAISE NOTICE '[INFO] DATABASE STATISTICS:';
    RAISE NOTICE '  ├─ Teachers: %', teacher_count;
    RAISE NOTICE '  ├─ Students: %', student_count;
    RAISE NOTICE '  ├─ Modules: %', module_count;
    RAISE NOTICE '  ├─ MCQ Tests: %', test_count;
    RAISE NOTICE '  └─ Test Submissions: %', submission_count;
    RAISE NOTICE '';
    RAISE NOTICE '[INFO]  DATABASE OBJECTS:';
    RAISE NOTICE '  ├─ Tables: % (teachers, students, modules, mcq_tests, test_submissions)', table_count;
    RAISE NOTICE '  ├─ Views: % (regular + materialized)', view_count;
    RAISE NOTICE '  ├─ Functions: %', function_count;
    RAISE NOTICE '  ├─ Triggers: 1 (auto-timestamp)';
    RAISE NOTICE '  └─ Indexes: % (optimized for performance)', index_count;
    RAISE NOTICE '';
    RAISE NOTICE '[OK] FEATURES ENABLED:';
    RAISE NOTICE '  ├─ Teacher & Student authentication';
    RAISE NOTICE '  ├─ Module management system';
    RAISE NOTICE '  ├─ MCQ test creation & management';
    RAISE NOTICE '  ├─ Student test submissions';
    RAISE NOTICE '  ├─ Automatic score calculation (backend)';
    RAISE NOTICE '  ├─ Progress tracking & analytics';
    RAISE NOTICE '  ├─ Performance categorization';
    RAISE NOTICE '  └─ Advanced statistics & reporting';
    RAISE NOTICE '';
    RAISE NOTICE '[INFO] NEXT STEPS:';
    RAISE NOTICE '  1. Restart your backend server';
    RAISE NOTICE '  2. Create admin/teacher accounts';
    RAISE NOTICE '  3. Add students to sections';
    RAISE NOTICE '  4. Create MCQ tests';
    RAISE NOTICE '  5. Students take tests';
    RAISE NOTICE '  6. View results & analytics';
    RAISE NOTICE '';
    RAISE NOTICE '[TIP] USEFUL QUERIES:';
    RAISE NOTICE '  • SELECT * FROM v_test_statistics;';
    RAISE NOTICE '  • SELECT * FROM v_student_test_progress;';
    RAISE NOTICE '  • SELECT * FROM get_student_detailed_progress(1);';
    RAISE NOTICE '  • SELECT * FROM get_test_performance_summary(1);';
    RAISE NOTICE '  • SELECT * FROM mv_student_performance_analytics;';
    RAISE NOTICE '';
    RAISE NOTICE '╔══════════════════════════════════════════════════════════════╗';
    RAISE NOTICE '║              READY TO USE - HAPPY CODING!                    ║';
    RAISE NOTICE '╚══════════════════════════════════════════════════════════════╝';
    RAISE NOTICE '';
END $$;


-- ============================================================
-- PART 12: TEACHER-STUDENT ALLOCATION (Many-to-Many)
-- ============================================================
DO $$ 
BEGIN
    RAISE NOTICE 'Step 12: Creating teacher-student allocation table...';
END $$;

-- Table 6: TEACHER_STUDENT_ALLOCATIONS (Many-to-Many relationship)
CREATE TABLE IF NOT EXISTS teacher_student_allocations (
    id SERIAL PRIMARY KEY,
    teacher_id INTEGER NOT NULL,
    student_id INTEGER NOT NULL,
    subject TEXT,
    allocated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_allocation_teacher FOREIGN KEY (teacher_id) 
        REFERENCES teachers(id) ON DELETE CASCADE,
    CONSTRAINT fk_allocation_student FOREIGN KEY (student_id) 
        REFERENCES students(id) ON DELETE CASCADE,
    CONSTRAINT uq_teacher_student UNIQUE(teacher_id, student_id, subject)
);

-- Indexes for allocation table
CREATE INDEX idx_allocations_teacher ON teacher_student_allocations(teacher_id);
CREATE INDEX idx_allocations_student ON teacher_student_allocations(student_id);
CREATE INDEX idx_allocations_subject ON teacher_student_allocations(subject);

-- View: Teachers with their students
CREATE OR REPLACE VIEW v_teacher_students AS
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

-- View: Students with their teachers
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

DO $$ 
BEGIN
    RAISE NOTICE '[OK] Teacher-student allocation system created';
    RAISE NOTICE '[OK] Many-to-many relationship enabled';
END $$;

-- ============================================================
-- PART 13: IN-APP NOTIFICATIONS
-- ============================================================
DO $$ 
BEGIN
    RAISE NOTICE 'Step 13: Creating in-app notifications table...';
END $$;

-- Table 7: IN_APP_NOTIFICATIONS
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

-- Create indexes for faster notification queries
CREATE INDEX idx_inapp_recipient ON in_app_notifications(recipient_id, recipient_type);
CREATE INDEX idx_inapp_unread ON in_app_notifications(recipient_id, recipient_type, is_read);
CREATE INDEX idx_inapp_created ON in_app_notifications(created_at DESC);

DO $$ 
BEGIN
    RAISE NOTICE '[OK] In-app notifications table created';
    RAISE NOTICE '[OK] Notification indexes created for performance';
END $$;
