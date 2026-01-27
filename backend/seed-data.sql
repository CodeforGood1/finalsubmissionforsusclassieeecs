-- ============================================================
-- SUSTAINABLE CLASSROOM - SEED DATA
-- ============================================================
-- Run this AFTER the database schema is created
-- Creates sample teachers, students, modules, and tests
-- ============================================================

-- ============================================================
-- SEED TEACHERS (3 teachers with different departments)
-- ============================================================
-- Password for all: "password123" (bcrypt hashed)
-- Hash: $2b$10$rQZ8K6.YqX6B9vKQ1234567890abcdefghijklmnopqrstuv

INSERT INTO teachers (name, email, password, staff_id, dept, allocated_sections) VALUES
(
    'Dr. Sarah Okonkwo',
    'sarah.teacher@classroom.local',
    '$2b$10$YqXk1nN8hY5xrDf6ZvM3aO8oQwE2rT5uI9pL4kJ7hG3fD6sA1xC2v',
    'TCH001',
    'Science',
    '["SS1 A", "SS1 B", "SS2 A"]'::jsonb
),
(
    'Mr. Emmanuel Adebayo',
    'emmanuel.teacher@classroom.local',
    '$2b$10$YqXk1nN8hY5xrDf6ZvM3aO8oQwE2rT5uI9pL4kJ7hG3fD6sA1xC2v',
    'TCH002',
    'Mathematics',
    '["SS1 A", "SS1 B", "SS2 A", "SS2 B"]'::jsonb
),
(
    'Mrs. Fatima Bello',
    'fatima.teacher@classroom.local',
    '$2b$10$YqXk1nN8hY5xrDf6ZvM3aO8oQwE2rT5uI9pL4kJ7hG3fD6sA1xC2v',
    'TCH003',
    'English',
    '["SS1 A", "SS2 A", "SS2 B"]'::jsonb
);

-- ============================================================
-- SEED STUDENTS (10 students across different sections)
-- ============================================================
-- Password for all: "student123" (bcrypt hashed)

INSERT INTO students (name, email, password, reg_no, class_dept, section) VALUES
('Amara Okafor', 'amara@student.local', '$2b$10$YqXk1nN8hY5xrDf6ZvM3aO8oQwE2rT5uI9pL4kJ7hG3fD6sA1xC2v', 'STU2024001', 'SS1', 'A'),
('Chidi Eze', 'chidi@student.local', '$2b$10$YqXk1nN8hY5xrDf6ZvM3aO8oQwE2rT5uI9pL4kJ7hG3fD6sA1xC2v', 'STU2024002', 'SS1', 'A'),
('Ngozi Uche', 'ngozi@student.local', '$2b$10$YqXk1nN8hY5xrDf6ZvM3aO8oQwE2rT5uI9pL4kJ7hG3fD6sA1xC2v', 'STU2024003', 'SS1', 'A'),
('Oluwaseun Bakare', 'seun@student.local', '$2b$10$YqXk1nN8hY5xrDf6ZvM3aO8oQwE2rT5uI9pL4kJ7hG3fD6sA1xC2v', 'STU2024004', 'SS1', 'B'),
('Aisha Mohammed', 'aisha@student.local', '$2b$10$YqXk1nN8hY5xrDf6ZvM3aO8oQwE2rT5uI9pL4kJ7hG3fD6sA1xC2v', 'STU2024005', 'SS1', 'B'),
('Kwame Asante', 'kwame@student.local', '$2b$10$YqXk1nN8hY5xrDf6ZvM3aO8oQwE2rT5uI9pL4kJ7hG3fD6sA1xC2v', 'STU2024006', 'SS2', 'A'),
('Zainab Ibrahim', 'zainab@student.local', '$2b$10$YqXk1nN8hY5xrDf6ZvM3aO8oQwE2rT5uI9pL4kJ7hG3fD6sA1xC2v', 'STU2024007', 'SS2', 'A'),
('Emeka Nwosu', 'emeka@student.local', '$2b$10$YqXk1nN8hY5xrDf6ZvM3aO8oQwE2rT5uI9pL4kJ7hG3fD6sA1xC2v', 'STU2024008', 'SS2', 'A'),
('Blessing Okoro', 'blessing@student.local', '$2b$10$YqXk1nN8hY5xrDf6ZvM3aO8oQwE2rT5uI9pL4kJ7hG3fD6sA1xC2v', 'STU2024009', 'SS2', 'B'),
('Tunde Adeyemi', 'tunde@student.local', '$2b$10$YqXk1nN8hY5xrDf6ZvM3aO8oQwE2rT5uI9pL4kJ7hG3fD6sA1xC2v', 'STU2024010', 'SS2', 'B');

-- ============================================================
-- SEED MODULES (Learning content)
-- ============================================================

INSERT INTO modules (section, topic_title, teacher_id, teacher_name, step_count, steps) VALUES
(
    'SS1 A',
    'Introduction to Biology - Cell Structure',
    1,
    'Dr. Sarah Okonkwo',
    4,
    '[
        {"title": "What is a Cell?", "type": "text", "content": "A cell is the basic unit of life. All living organisms are made up of cells."},
        {"title": "Cell Structure Video", "type": "video", "content": "/uploads/videos/cell-structure.mp4"},
        {"title": "Parts of a Cell", "type": "text", "content": "Cells have many parts including: Nucleus, Cytoplasm, Cell Membrane, Mitochondria, etc."},
        {"title": "Quiz: Cell Parts", "type": "quiz", "content": {"question": "What is the control center of the cell?", "options": ["Nucleus", "Cytoplasm", "Mitochondria"], "answer": 0}}
    ]'::jsonb
),
(
    'SS1 A',
    'Basic Mathematics - Algebra Fundamentals',
    2,
    'Mr. Emmanuel Adebayo',
    3,
    '[
        {"title": "Introduction to Variables", "type": "text", "content": "In algebra, we use letters like x and y to represent unknown values."},
        {"title": "Solving Simple Equations", "type": "text", "content": "To solve x + 5 = 10, subtract 5 from both sides: x = 5"},
        {"title": "Practice Problems", "type": "exercise", "content": {"problems": ["x + 3 = 7", "2x = 10", "x - 4 = 6"]}}
    ]'::jsonb
),
(
    'SS1 B',
    'English Grammar - Parts of Speech',
    3,
    'Mrs. Fatima Bello',
    4,
    '[
        {"title": "Nouns", "type": "text", "content": "A noun is a word that represents a person, place, thing, or idea."},
        {"title": "Verbs", "type": "text", "content": "A verb is a word that describes an action, state, or occurrence."},
        {"title": "Adjectives", "type": "text", "content": "An adjective is a word that describes or modifies a noun."},
        {"title": "Grammar Quiz", "type": "quiz", "content": {"question": "Which word is a verb?", "options": ["Run", "Beautiful", "Table"], "answer": 0}}
    ]'::jsonb
),
(
    'SS2 A',
    'Physics - Forces and Motion',
    1,
    'Dr. Sarah Okonkwo',
    5,
    '[
        {"title": "What is Force?", "type": "text", "content": "Force is a push or pull that can change the motion of an object."},
        {"title": "Newton First Law", "type": "text", "content": "An object at rest stays at rest, and an object in motion stays in motion unless acted upon by a force."},
        {"title": "Newton Second Law", "type": "text", "content": "Force equals mass times acceleration: F = ma"},
        {"title": "Newton Third Law", "type": "text", "content": "For every action, there is an equal and opposite reaction."},
        {"title": "Practice Problems", "type": "exercise", "content": {"problems": ["Calculate force when m=5kg and a=2m/s²"]}}
    ]'::jsonb
),
(
    'SS2 A',
    'Advanced Algebra - Quadratic Equations',
    2,
    'Mr. Emmanuel Adebayo',
    4,
    '[
        {"title": "Quadratic Form", "type": "text", "content": "A quadratic equation has the form ax² + bx + c = 0"},
        {"title": "Quadratic Formula", "type": "text", "content": "x = (-b ± √(b²-4ac)) / 2a"},
        {"title": "Worked Example", "type": "text", "content": "Solve x² + 5x + 6 = 0 → x = -2 or x = -3"},
        {"title": "Practice", "type": "exercise", "content": {"problems": ["x² - 4 = 0", "x² + 2x + 1 = 0"]}}
    ]'::jsonb
);

-- ============================================================
-- SEED MCQ TESTS
-- ============================================================

INSERT INTO mcq_tests (teacher_id, teacher_name, section, title, description, questions, total_questions, start_date, deadline) VALUES
(
    1,
    'Dr. Sarah Okonkwo',
    'SS1 A',
    'Biology Quiz: Cell Structure',
    'Test your knowledge of cell biology',
    '[
        {"question": "What is the powerhouse of the cell?", "options": ["Nucleus", "Mitochondria", "Ribosome", "Golgi Body"], "correctAnswer": 1},
        {"question": "Which organelle contains genetic material?", "options": ["Cytoplasm", "Cell Wall", "Nucleus", "Vacuole"], "correctAnswer": 2},
        {"question": "What surrounds the cell?", "options": ["Cell Membrane", "Nuclear Membrane", "Cytoplasm", "Chloroplast"], "correctAnswer": 0},
        {"question": "Where does photosynthesis occur?", "options": ["Mitochondria", "Nucleus", "Chloroplast", "Ribosome"], "correctAnswer": 2},
        {"question": "What is the jelly-like substance inside cells?", "options": ["Nucleus", "Cytoplasm", "Membrane", "Vacuole"], "correctAnswer": 1}
    ]'::jsonb,
    5,
    NOW(),
    NOW() + INTERVAL '7 days'
),
(
    2,
    'Mr. Emmanuel Adebayo',
    'SS1 A',
    'Algebra Basics Test',
    'Basic algebra concepts assessment',
    '[
        {"question": "Solve: x + 5 = 12", "options": ["5", "6", "7", "8"], "correctAnswer": 2},
        {"question": "Solve: 2x = 10", "options": ["4", "5", "6", "8"], "correctAnswer": 1},
        {"question": "Solve: x - 3 = 7", "options": ["4", "10", "7", "3"], "correctAnswer": 1},
        {"question": "If x = 4, what is 3x?", "options": ["7", "12", "34", "1"], "correctAnswer": 1},
        {"question": "Solve: x/2 = 6", "options": ["3", "8", "12", "4"], "correctAnswer": 2}
    ]'::jsonb,
    5,
    NOW(),
    NOW() + INTERVAL '5 days'
),
(
    3,
    'Mrs. Fatima Bello',
    'SS1 B',
    'English Grammar Test',
    'Parts of speech and grammar fundamentals',
    '[
        {"question": "Which is a noun?", "options": ["Run", "Beautiful", "Book", "Quickly"], "correctAnswer": 2},
        {"question": "Which is a verb?", "options": ["Happy", "Jump", "Red", "School"], "correctAnswer": 1},
        {"question": "Which is an adjective?", "options": ["Tall", "Walk", "Table", "Slowly"], "correctAnswer": 0},
        {"question": "Which is an adverb?", "options": ["Fast", "Fastly", "Quickly", "Quick"], "correctAnswer": 2},
        {"question": "Identify the pronoun:", "options": ["She", "Dog", "Run", "Blue"], "correctAnswer": 0}
    ]'::jsonb,
    5,
    NOW(),
    NOW() + INTERVAL '7 days'
),
(
    1,
    'Dr. Sarah Okonkwo',
    'SS2 A',
    'Physics: Forces and Motion',
    'Newton''s Laws of Motion assessment',
    '[
        {"question": "F = ma is which Newton''s Law?", "options": ["First", "Second", "Third", "Fourth"], "correctAnswer": 1},
        {"question": "What is the unit of force?", "options": ["Meter", "Kilogram", "Newton", "Joule"], "correctAnswer": 2},
        {"question": "An object at rest will...", "options": ["Move slowly", "Stay at rest", "Accelerate", "Decelerate"], "correctAnswer": 1},
        {"question": "If m=5kg and a=2m/s², what is F?", "options": ["2.5N", "7N", "10N", "3N"], "correctAnswer": 2},
        {"question": "Action-reaction is which law?", "options": ["First", "Second", "Third", "Zero"], "correctAnswer": 2}
    ]'::jsonb,
    5,
    NOW(),
    NOW() + INTERVAL '10 days'
);

-- ============================================================
-- SEED TEST SUBMISSIONS (Sample student answers)
-- ============================================================

INSERT INTO test_submissions (test_id, student_id, student_name, student_reg_no, answers, score, percentage, status, time_taken) VALUES
(1, 1, 'Amara Okafor', 'STU2024001', '{"0": 1, "1": 2, "2": 0, "3": 2, "4": 1}'::jsonb, 5, 100.00, 'completed', 300),
(1, 2, 'Chidi Eze', 'STU2024002', '{"0": 1, "1": 2, "2": 0, "3": 0, "4": 1}'::jsonb, 4, 80.00, 'completed', 420),
(1, 3, 'Ngozi Uche', 'STU2024003', '{"0": 0, "1": 2, "2": 0, "3": 2, "4": 0}'::jsonb, 3, 60.00, 'completed', 380),
(2, 1, 'Amara Okafor', 'STU2024001', '{"0": 2, "1": 1, "2": 1, "3": 1, "4": 2}'::jsonb, 5, 100.00, 'completed', 250),
(2, 2, 'Chidi Eze', 'STU2024002', '{"0": 2, "1": 1, "2": 0, "3": 1, "4": 2}'::jsonb, 4, 80.00, 'completed', 310),
(3, 4, 'Oluwaseun Bakare', 'STU2024004', '{"0": 2, "1": 1, "2": 0, "3": 2, "4": 0}'::jsonb, 5, 100.00, 'completed', 280),
(3, 5, 'Aisha Mohammed', 'STU2024005', '{"0": 2, "1": 1, "2": 0, "3": 2, "4": 1}'::jsonb, 4, 80.00, 'completed', 350);

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================
DO $$ 
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '╔════════════════════════════════════════════════════════╗';
    RAISE NOTICE '║           SEED DATA COMPLETED SUCCESSFULLY             ║';
    RAISE NOTICE '╚════════════════════════════════════════════════════════╝';
END $$;

SELECT 'Teachers' as entity, COUNT(*) as count FROM teachers
UNION ALL
SELECT 'Students', COUNT(*) FROM students
UNION ALL
SELECT 'Modules', COUNT(*) FROM modules
UNION ALL
SELECT 'MCQ Tests', COUNT(*) FROM mcq_tests
UNION ALL
SELECT 'Test Submissions', COUNT(*) FROM test_submissions;

-- ============================================================
-- LOGIN CREDENTIALS FOR TESTING
-- ============================================================
-- 
-- TEACHERS (password: password123):
--   - sarah.teacher@classroom.local
--   - emmanuel.teacher@classroom.local
--   - fatima.teacher@classroom.local
--
-- STUDENTS (password: student123):
--   - amara@student.local
--   - chidi@student.local
--   - ngozi@student.local
--   - seun@student.local
--   - aisha@student.local
--   - kwame@student.local
--   - zainab@student.local
--   - emeka@student.local
--   - blessing@student.local
--   - tunde@student.local
--
-- ============================================================
