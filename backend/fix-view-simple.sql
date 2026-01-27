-- Simple fix: Drop and recreate the view with student_email field
-- Run this in Neon SQL Editor

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
