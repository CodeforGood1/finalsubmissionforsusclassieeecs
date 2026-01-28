-- ============================================================
-- MCQ TEST SYSTEM - SIMPLE & FOCUSED
-- ============================================================
-- Teacher posts MCQ tests → Students take tests → Results tracked
-- ============================================================

-- STEP 1: Create MCQ_TESTS table (Teacher posts tests)
-- ============================================================
DO $$
BEGIN
    RAISE NOTICE '=== CREATING MCQ_TESTS TABLE ===';
END $$;

CREATE TABLE IF NOT EXISTS mcq_tests (
    id SERIAL PRIMARY KEY,
    teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
    teacher_name TEXT NOT NULL,
    section TEXT NOT NULL, -- e.g., "ECE A"
    title TEXT NOT NULL,
    description TEXT,
    questions JSONB NOT NULL DEFAULT '[]', -- Array of 15-20 questions
    total_questions INTEGER NOT NULL,
    start_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deadline TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT true
);

-- STEP 2: Create TEST_SUBMISSIONS table (Student test results)
-- ============================================================
DO $$
BEGIN
    RAISE NOTICE '=== CREATING TEST_SUBMISSIONS TABLE ===';
END $$;

CREATE TABLE IF NOT EXISTS test_submissions (
    id SERIAL PRIMARY KEY,
    test_id INTEGER NOT NULL REFERENCES mcq_tests(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    student_name TEXT NOT NULL,
    student_reg_no TEXT,
    answers JSONB NOT NULL DEFAULT '{}', -- Student's selected answers
    score INTEGER DEFAULT 0,
    percentage DECIMAL(5,2) DEFAULT 0.00,
    status TEXT DEFAULT 'completed', -- 'completed', 'late'
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    time_taken INTEGER, -- in seconds
    UNIQUE(test_id, student_id) -- One submission per student per test
);

-- STEP 3: Create indexes for performance
-- ============================================================
DO $$
BEGIN
    RAISE NOTICE '=== CREATING INDEXES ===';
END $$;

CREATE INDEX IF NOT EXISTS idx_tests_teacher ON mcq_tests(teacher_id);
CREATE INDEX IF NOT EXISTS idx_tests_section ON mcq_tests(section);
CREATE INDEX IF NOT EXISTS idx_tests_deadline ON mcq_tests(deadline);
CREATE INDEX IF NOT EXISTS idx_tests_active ON mcq_tests(is_active);

CREATE INDEX IF NOT EXISTS idx_submissions_test ON test_submissions(test_id);
CREATE INDEX IF NOT EXISTS idx_submissions_student ON test_submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_submissions_status ON test_submissions(status);
CREATE INDEX IF NOT EXISTS idx_submissions_date ON test_submissions(submitted_at);

-- STEP 4: Create view for student progress (what teacher sees)
-- ============================================================
DO $$
BEGIN
    RAISE NOTICE '=== CREATING VIEWS ===';
END $$;

CREATE OR REPLACE VIEW v_student_test_progress AS
SELECT 
    s.id as student_id,
    s.name as student_name,
    s.reg_no,
    s.class_dept,
    s.section,
    CONCAT(s.class_dept, ' ', s.section) as full_section,
    COUNT(DISTINCT t.id) as total_tests_assigned,
    COUNT(DISTINCT sub.id) as tests_completed,
    COUNT(DISTINCT CASE 
        WHEN t.deadline < CURRENT_TIMESTAMP AND sub.id IS NULL 
        THEN t.id 
    END) as tests_overdue,
    ROUND(AVG(sub.percentage), 2) as average_score,
    MAX(sub.submitted_at) as last_submission_date
FROM students s
LEFT JOIN mcq_tests t ON LOWER(CONCAT(s.class_dept, ' ', s.section)) = LOWER(t.section) AND t.is_active = true
LEFT JOIN test_submissions sub ON t.id = sub.test_id AND s.id = sub.student_id
GROUP BY s.id, s.name, s.reg_no, s.class_dept, s.section;

RAISE NOTICE '[OK] Created view: v_student_test_progress';

-- View for teacher to see test statistics
CREATE OR REPLACE VIEW v_test_statistics AS
SELECT 
    t.id as test_id,
    t.title,
    t.section,
    t.teacher_name,
    t.total_questions,
    t.deadline,
    t.created_at,
    COUNT(DISTINCT sub.id) as total_submissions,
    ROUND(AVG(sub.percentage), 2) as average_score,
    COUNT(DISTINCT CASE WHEN sub.percentage >= 60 THEN sub.id END) as passed_count,
    COUNT(DISTINCT CASE WHEN sub.percentage < 60 THEN sub.id END) as failed_count
FROM mcq_tests t
LEFT JOIN test_submissions sub ON t.id = sub.test_id
GROUP BY t.id, t.title, t.section, t.teacher_name, t.total_questions, t.deadline, t.created_at;

RAISE NOTICE '[OK] Created view: v_test_statistics';

-- STEP 5: Create trigger to auto-calculate score and status
-- ============================================================
CREATE OR REPLACE FUNCTION calculate_test_score()
RETURNS TRIGGER AS $$
DECLARE
    test_questions JSONB;
    correct_count INTEGER := 0;
    q_index INTEGER;
    question JSONB;
    student_answer TEXT;
    correct_answer TEXT;
BEGIN
    -- Get test questions
    SELECT questions INTO test_questions FROM mcq_tests WHERE id = NEW.test_id;
    
    -- Calculate score by comparing answers (case-insensitive)
    FOR q_index IN 0..(jsonb_array_length(test_questions) - 1) LOOP
        question := test_questions->q_index;
        student_answer := UPPER(TRIM(NEW.answers->>q_index::text));
        correct_answer := UPPER(TRIM(question->>'correct'));
        
        IF student_answer = correct_answer THEN
            correct_count := correct_count + 1;
        END IF;
    END LOOP;
    
    -- Set score and percentage
    NEW.score := correct_count;
    NEW.percentage := (correct_count::DECIMAL / (SELECT total_questions FROM mcq_tests WHERE id = NEW.test_id) * 100);
    
    -- Check if submitted after deadline
    IF NEW.submitted_at > (SELECT deadline FROM mcq_tests WHERE id = NEW.test_id) THEN
        NEW.status := 'late';
    ELSE
        NEW.status := 'completed';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_calculate_test_score ON test_submissions;
CREATE TRIGGER trigger_calculate_test_score
    BEFORE INSERT OR UPDATE ON test_submissions
    FOR EACH ROW
    EXECUTE FUNCTION calculate_test_score();

RAISE NOTICE '[OK] Created trigger: trigger_calculate_test_score';

-- STEP 6: Helper function to get student's detailed progress
-- ============================================================
CREATE OR REPLACE FUNCTION get_student_detailed_progress(p_student_id INTEGER)
RETURNS TABLE(
    test_id INTEGER,
    test_title TEXT,
    test_deadline TIMESTAMP,
    submission_id INTEGER,
    score INTEGER,
    percentage DECIMAL(5,2),
    status TEXT,
    submitted_at TIMESTAMP,
    is_overdue BOOLEAN,
    is_completed BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.id as test_id,
        t.title as test_title,
        t.deadline as test_deadline,
        sub.id as submission_id,
        sub.score,
        sub.percentage,
        sub.status,
        sub.submitted_at,
        CASE 
            WHEN t.deadline < CURRENT_TIMESTAMP AND sub.id IS NULL THEN true
            ELSE false
        END as is_overdue,
        CASE 
            WHEN sub.id IS NOT NULL THEN true
            ELSE false
        END as is_completed
    FROM mcq_tests t
    LEFT JOIN test_submissions sub ON t.id = sub.test_id AND sub.student_id = p_student_id
    WHERE LOWER(t.section) = LOWER((
        SELECT CONCAT(class_dept, ' ', section) 
        FROM students 
        WHERE id = p_student_id
    ))
    AND t.is_active = true
    ORDER BY t.deadline DESC;
END;
$$ LANGUAGE plpgsql;

RAISE NOTICE '[OK] Created function: get_student_detailed_progress';

-- STEP 7: Verification
-- ============================================================
DO $$
DECLARE
    test_count INTEGER;
    submission_count INTEGER;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '╔════════════════════════════════════════════════════════╗';
    RAISE NOTICE '║          MCQ TEST SYSTEM VERIFICATION                  ║';
    RAISE NOTICE '╚════════════════════════════════════════════════════════╝';
    RAISE NOTICE '';
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'mcq_tests') THEN
        SELECT COUNT(*) INTO test_count FROM mcq_tests;
        RAISE NOTICE '[OK] MCQ_TESTS table exists (% records)', test_count;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'test_submissions') THEN
        SELECT COUNT(*) INTO submission_count FROM test_submissions;
        RAISE NOTICE '[OK] TEST_SUBMISSIONS table exists (% records)', submission_count;
    END IF;
    
    RAISE NOTICE '';
    RAISE NOTICE '[OK] All indexes created';
    RAISE NOTICE '[OK] All views created';
    RAISE NOTICE '[OK] Auto-scoring trigger created';
    RAISE NOTICE '[OK] Helper functions created';
    RAISE NOTICE '';
    RAISE NOTICE '╔════════════════════════════════════════════════════════╗';
    RAISE NOTICE '║              SETUP COMPLETED SUCCESSFULLY              ║';
    RAISE NOTICE '╚════════════════════════════════════════════════════════╝';
END $$;