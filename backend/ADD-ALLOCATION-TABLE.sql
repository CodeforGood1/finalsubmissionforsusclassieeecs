-- ============================================================
-- ADD ALLOCATION TABLE TO EXISTING DATABASE
-- ============================================================
-- Run this if you don't want to recreate the entire database
-- This adds the many-to-many allocation system
-- ============================================================

-- Create allocation table
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

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_allocations_teacher ON teacher_student_allocations(teacher_id);
CREATE INDEX IF NOT EXISTS idx_allocations_student ON teacher_student_allocations(student_id);
CREATE INDEX IF NOT EXISTS idx_allocations_subject ON teacher_student_allocations(subject);

-- Create view: Teachers with their students
CREATE OR REPLACE VIEW v_teacher_students AS
SELECT 
    t.id as teacher_id,
    t.name as teacher_name,
    t.dept as teacher_dept,
    s.id as student_id,
    s.name as student_name,
    s.reg_no,
    s.class_dept,
    s.section,
    a.subject,
    a.allocated_at
FROM teachers t
INNER JOIN teacher_student_allocations a ON t.id = a.teacher_id
INNER JOIN students s ON a.student_id = s.id;

-- Create view: Students with their teachers
CREATE OR REPLACE VIEW v_student_teachers AS
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

-- Verify
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '✓ teacher_student_allocations table created';
    RAISE NOTICE '✓ Indexes created';
    RAISE NOTICE '✓ Views created (v_teacher_students, v_student_teachers)';
    RAISE NOTICE '';
    RAISE NOTICE 'Allocation system is ready!';
    RAISE NOTICE 'You can now allocate teachers to students in admin dashboard.';
    RAISE NOTICE '';
END $$;
