-- ============================================================
-- V2.2.6 - MULTI-SECTION ALLOCATION FOR MODULES & TESTS
-- ============================================================
-- This migration adds support for allocating modules/tests to multiple sections
-- ============================================================

-- Add sections array column to modules (JSONB array of sections)
ALTER TABLE modules 
ADD COLUMN IF NOT EXISTS sections JSONB DEFAULT '[]'::jsonb;

-- Migrate existing single section to sections array
UPDATE modules 
SET sections = CASE 
  WHEN section IS NOT NULL AND section != '' 
  THEN jsonb_build_array(section)
  ELSE '[]'::jsonb
END
WHERE sections IS NULL OR sections = '[]'::jsonb;

-- Add sections array column to mcq_tests
ALTER TABLE mcq_tests 
ADD COLUMN IF NOT EXISTS sections JSONB DEFAULT '[]'::jsonb;

-- Migrate existing single section to sections array
UPDATE mcq_tests 
SET sections = CASE 
  WHEN section IS NOT NULL AND section != '' 
  THEN jsonb_build_array(section)
  ELSE '[]'::jsonb
END
WHERE sections IS NULL OR sections = '[]'::jsonb;

-- Create index for sections array lookup
CREATE INDEX IF NOT EXISTS idx_modules_sections ON modules USING GIN (sections);
CREATE INDEX IF NOT EXISTS idx_tests_sections ON mcq_tests USING GIN (sections);

-- ============================================================
-- STUDENT CODING SUBMISSIONS TABLE
-- ============================================================
-- Track individual coding problem submissions with test case results

CREATE TABLE IF NOT EXISTS student_submissions (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL,
    student_email TEXT NOT NULL,
    module_id INTEGER NOT NULL,
    problem_step_index INTEGER DEFAULT 0,
    submitted_code TEXT NOT NULL,
    language TEXT NOT NULL,
    test_cases_passed INTEGER DEFAULT 0,
    total_test_cases INTEGER DEFAULT 0,
    score DECIMAL(5,2) DEFAULT 0.00,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_coding_student FOREIGN KEY (student_id) 
        REFERENCES students(id) ON DELETE CASCADE,
    CONSTRAINT fk_coding_module FOREIGN KEY (module_id) 
        REFERENCES modules(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_coding_submissions_student ON student_submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_coding_submissions_module ON student_submissions(module_id);
CREATE INDEX IF NOT EXISTS idx_coding_submissions_student_module ON student_submissions(student_id, module_id);

-- ============================================================
-- VIEW: Student coding progress across all problems in a module
-- ============================================================
DROP VIEW IF EXISTS v_student_coding_progress;
CREATE VIEW v_student_coding_progress AS
SELECT 
    ss.student_id,
    s.name as student_name,
    s.email as student_email,
    s.class_dept,
    s.section,
    ss.module_id,
    m.topic_title as module_title,
    COUNT(DISTINCT ss.id) as problems_attempted,
    SUM(ss.test_cases_passed) as total_test_cases_passed,
    SUM(ss.total_test_cases) as total_test_cases,
    CASE 
        WHEN SUM(ss.total_test_cases) > 0 
        THEN ROUND((SUM(ss.test_cases_passed)::DECIMAL / SUM(ss.total_test_cases)) * 100, 2)
        ELSE 0
    END as coding_completion_percentage
FROM student_submissions ss
JOIN students s ON ss.student_id = s.id
JOIN modules m ON ss.module_id = m.id
GROUP BY ss.student_id, s.name, s.email, s.class_dept, s.section, ss.module_id, m.topic_title;

-- ============================================================
-- FIX: Chat discovery normalization function
-- ============================================================
CREATE OR REPLACE FUNCTION normalize_section(input_section TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    RETURN UPPER(TRIM(REGEXP_REPLACE(input_section, '\s+', ' ', 'g')));
END;
$$;

-- Create index for normalized section matching
CREATE INDEX IF NOT EXISTS idx_students_section_normalized 
ON students (UPPER(TRIM(REGEXP_REPLACE(class_dept || ' ' || section, '\s+', ' ', 'g'))));

CREATE INDEX IF NOT EXISTS idx_modules_section_normalized 
ON modules (UPPER(TRIM(REGEXP_REPLACE(section, '\s+', ' ', 'g'))));

CREATE INDEX IF NOT EXISTS idx_tests_section_normalized 
ON mcq_tests (UPPER(TRIM(REGEXP_REPLACE(section, '\s+', ' ', 'g'))));

DO $$ 
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '╔══════════════════════════════════════════════════════════════╗';
    RAISE NOTICE '║     V2.2.6 MIGRATION COMPLETED SUCCESSFULLY                  ║';
    RAISE NOTICE '╠══════════════════════════════════════════════════════════════╣';
    RAISE NOTICE '║  ✓ Added sections JSONB array to modules                     ║';
    RAISE NOTICE '║  ✓ Added sections JSONB array to mcq_tests                   ║';
    RAISE NOTICE '║  ✓ Migrated existing section data to arrays                  ║';
    RAISE NOTICE '║  ✓ Created GIN indexes for array lookup                      ║';
    RAISE NOTICE '║  ✓ Created student_submissions table                         ║';
    RAISE NOTICE '║  ✓ Created v_student_coding_progress view                    ║';
    RAISE NOTICE '║  ✓ Added normalize_section function                          ║';
    RAISE NOTICE '╚══════════════════════════════════════════════════════════════╝';
    RAISE NOTICE '';
END $$;
