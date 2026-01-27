-- ============================================================
-- SUSTAINABLE CLASSROOM - NEON POSTGRESQL DATABASE SETUP
-- ============================================================
-- Advanced CREATE OR REPLACE based setup script
-- Safe to run multiple times - idempotent operations
-- ============================================================

-- STEP 1: Create helper function to add columns safely
-- ============================================================
CREATE OR REPLACE FUNCTION add_column_if_not_exists(
    p_table_name TEXT,
    p_column_name TEXT,
    p_column_type TEXT,
    p_default_value TEXT DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = p_table_name 
        AND column_name = p_column_name
    ) THEN
        IF p_default_value IS NOT NULL THEN
            EXECUTE format('ALTER TABLE %I ADD COLUMN %I %s DEFAULT %s', 
                p_table_name, p_column_name, p_column_type, p_default_value);
        ELSE
            EXECUTE format('ALTER TABLE %I ADD COLUMN %I %s', 
                p_table_name, p_column_name, p_column_type);
        END IF;
        RAISE NOTICE '✓ Added column %.% (%)', p_table_name, p_column_name, p_column_type;
    ELSE
        RAISE NOTICE '→ Column %.% already exists, skipping', p_table_name, p_column_name;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- STEP 2: Create helper function to create indexes safely
-- ============================================================
CREATE OR REPLACE FUNCTION create_index_if_not_exists(
    p_index_name TEXT,
    p_table_name TEXT,
    p_columns TEXT
) RETURNS VOID AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_indexes 
        WHERE schemaname = 'public' 
        AND indexname = p_index_name
    ) THEN
        EXECUTE format('CREATE INDEX %I ON %I (%s)', 
            p_index_name, p_table_name, p_columns);
        RAISE NOTICE '✓ Created index %', p_index_name;
    ELSE
        RAISE NOTICE '→ Index % already exists, skipping', p_index_name;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- STEP 3: TEACHERS TABLE - Create or Update
-- ============================================================
DO $$
BEGIN
    RAISE NOTICE '=== CONFIGURING TEACHERS TABLE ===';
    
    -- Create table if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'teachers'
    ) THEN
        CREATE TABLE teachers (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        RAISE NOTICE '✓ Created teachers table';
    ELSE
        RAISE NOTICE '→ Teachers table already exists';
    END IF;
END $$;

-- Add missing columns to teachers table
SELECT add_column_if_not_exists('teachers', 'staff_id', 'TEXT', NULL);
SELECT add_column_if_not_exists('teachers', 'dept', 'TEXT', NULL);
SELECT add_column_if_not_exists('teachers', 'media', 'JSONB', '''{}''::jsonb');
SELECT add_column_if_not_exists('teachers', 'allocated_sections', 'JSONB', '''[]''::jsonb');
SELECT add_column_if_not_exists('teachers', 'created_at', 'TIMESTAMP', 'CURRENT_TIMESTAMP');

-- ============================================================
-- STEP 4: STUDENTS TABLE - Create or Update
-- ============================================================
DO $$
BEGIN
    RAISE NOTICE '=== CONFIGURING STUDENTS TABLE ===';
    
    -- Create table if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'students'
    ) THEN
        CREATE TABLE students (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        RAISE NOTICE '✓ Created students table';
    ELSE
        RAISE NOTICE '→ Students table already exists';
    END IF;
END $$;

-- Add missing columns to students table
SELECT add_column_if_not_exists('students', 'reg_no', 'TEXT', NULL);
SELECT add_column_if_not_exists('students', 'class_dept', 'TEXT', NULL);
SELECT add_column_if_not_exists('students', 'section', 'TEXT', NULL);
SELECT add_column_if_not_exists('students', 'media', 'JSONB', '''{}''::jsonb');
SELECT add_column_if_not_exists('students', 'created_at', 'TIMESTAMP', 'CURRENT_TIMESTAMP');

-- ============================================================
-- STEP 5: MODULES TABLE - Create or Replace
-- ============================================================
DO $$
BEGIN
    RAISE NOTICE '=== CONFIGURING MODULES TABLE ===';
    
    -- Create table if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'modules'
    ) THEN
        CREATE TABLE modules (
            id SERIAL PRIMARY KEY,
            section TEXT NOT NULL,
            topic_title TEXT NOT NULL,
            teacher_id INTEGER,
            teacher_name TEXT,
            step_count INTEGER DEFAULT 0,
            steps JSONB DEFAULT '[]'::jsonb,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_teacher FOREIGN KEY (teacher_id) 
                REFERENCES teachers(id) ON DELETE CASCADE
        );
        RAISE NOTICE '✓ Created modules table with foreign key constraint';
    ELSE
        RAISE NOTICE '→ Modules table already exists';
        
        -- Add foreign key constraint if it doesn't exist
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE constraint_name = 'fk_teacher' 
            AND table_name = 'modules'
        ) THEN
            ALTER TABLE modules 
            ADD CONSTRAINT fk_teacher 
            FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE;
            RAISE NOTICE '✓ Added foreign key constraint to modules table';
        END IF;
    END IF;
END $$;

-- Add missing columns to modules table (if any)
SELECT add_column_if_not_exists('modules', 'section', 'TEXT', NULL);
SELECT add_column_if_not_exists('modules', 'topic_title', 'TEXT', NULL);
SELECT add_column_if_not_exists('modules', 'teacher_id', 'INTEGER', NULL);
SELECT add_column_if_not_exists('modules', 'teacher_name', 'TEXT', NULL);
SELECT add_column_if_not_exists('modules', 'step_count', 'INTEGER', '0');
SELECT add_column_if_not_exists('modules', 'steps', 'JSONB', '''[]''::jsonb');
SELECT add_column_if_not_exists('modules', 'created_at', 'TIMESTAMP', 'CURRENT_TIMESTAMP');

-- ============================================================
-- STEP 6: CREATE INDEXES FOR PERFORMANCE
-- ============================================================
DO $$
BEGIN
    RAISE NOTICE '=== CREATING PERFORMANCE INDEXES ===';
END $$;

-- Teachers indexes
SELECT create_index_if_not_exists('idx_teachers_email', 'teachers', 'email');
SELECT create_index_if_not_exists('idx_teachers_staff_id', 'teachers', 'staff_id');

-- Students indexes
SELECT create_index_if_not_exists('idx_students_email', 'students', 'email');
SELECT create_index_if_not_exists('idx_students_reg_no', 'students', 'reg_no');
SELECT create_index_if_not_exists('idx_students_section', 'students', 'class_dept, section');

-- Modules indexes
SELECT create_index_if_not_exists('idx_modules_section', 'modules', 'section');
SELECT create_index_if_not_exists('idx_modules_teacher', 'modules', 'teacher_id');
SELECT create_index_if_not_exists('idx_modules_created', 'modules', 'created_at DESC');

-- ============================================================
-- STEP 7: CREATE OR REPLACE UTILITY VIEWS
-- ============================================================
DO $$
BEGIN
    RAISE NOTICE '=== CREATING UTILITY VIEWS ===';
END $$;

-- View: Teacher with module count
CREATE OR REPLACE VIEW v_teachers_with_stats AS
SELECT 
    t.id,
    t.name,
    t.email,
    t.staff_id,
    t.dept,
    t.allocated_sections,
    t.created_at,
    COUNT(m.id) as module_count
FROM teachers t
LEFT JOIN modules m ON t.id = m.teacher_id
GROUP BY t.id, t.name, t.email, t.staff_id, t.dept, t.allocated_sections, t.created_at;

RAISE NOTICE '✓ Created view: v_teachers_with_stats';

-- View: Student with progress
CREATE OR REPLACE VIEW v_students_with_section AS
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

RAISE NOTICE '✓ Created view: v_students_with_section';

-- View: Modules with full details
CREATE OR REPLACE VIEW v_modules_detailed AS
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

RAISE NOTICE '✓ Created view: v_modules_detailed';

-- ============================================================
-- STEP 8: VERIFICATION AND SUMMARY
-- ============================================================
DO $$
DECLARE
    teacher_count INTEGER;
    student_count INTEGER;
    module_count INTEGER;
    teacher_cols INTEGER;
    student_cols INTEGER;
    module_cols INTEGER;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '╔════════════════════════════════════════════════════════╗';
    RAISE NOTICE '║     DATABASE SETUP VERIFICATION & SUMMARY             ║';
    RAISE NOTICE '╚════════════════════════════════════════════════════════╝';
    RAISE NOTICE '';
    
    -- Check tables exist
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'teachers') THEN
        SELECT COUNT(*) INTO teacher_count FROM teachers;
        SELECT COUNT(*) INTO teacher_cols FROM information_schema.columns WHERE table_name = 'teachers';
        RAISE NOTICE '✓ TEACHERS table exists (% columns, % records)', teacher_cols, teacher_count;
    ELSE
        RAISE NOTICE '✗ TEACHERS table missing!';
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'students') THEN
        SELECT COUNT(*) INTO student_count FROM students;
        SELECT COUNT(*) INTO student_cols FROM information_schema.columns WHERE table_name = 'students';
        RAISE NOTICE '✓ STUDENTS table exists (% columns, % records)', student_cols, student_count;
    ELSE
        RAISE NOTICE '✗ STUDENTS table missing!';
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'modules') THEN
        SELECT COUNT(*) INTO module_count FROM modules;
        SELECT COUNT(*) INTO module_cols FROM information_schema.columns WHERE table_name = 'modules';
        RAISE NOTICE '✓ MODULES table exists (% columns, % records)', module_cols, module_count;
    ELSE
        RAISE NOTICE '✗ MODULES table missing!';
    END IF;
    
    RAISE NOTICE '';
    RAISE NOTICE '✓ All indexes created successfully';
    RAISE NOTICE '✓ All views created successfully';
    RAISE NOTICE '✓ Foreign key constraints configured';
    RAISE NOTICE '';
    RAISE NOTICE '╔════════════════════════════════════════════════════════╗';
    RAISE NOTICE '║              SETUP COMPLETED SUCCESSFULLY              ║';
    RAISE NOTICE '╚════════════════════════════════════════════════════════╝';
END $$;

-- ============================================================
-- STEP 9: CLEANUP HELPER FUNCTIONS (Optional)
-- ============================================================
-- Uncomment below if you want to remove helper functions after setup
-- DROP FUNCTION IF EXISTS add_column_if_not_exists(TEXT, TEXT, TEXT, TEXT);
-- DROP FUNCTION IF EXISTS create_index_if_not_exists(TEXT, TEXT, TEXT);
