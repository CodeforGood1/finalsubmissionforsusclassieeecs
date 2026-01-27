-- =====================================================
-- CODING SUBMISSIONS SYSTEM - COMPLETE SETUP
-- =====================================================

-- 1. CREATE TABLE FOR STUDENT CODE SUBMISSIONS
-- =====================================================
CREATE TABLE IF NOT EXISTS student_submissions (
  id SERIAL PRIMARY KEY,
  student_id INT NOT NULL,
  student_email VARCHAR(255),
  module_id INT NOT NULL,
  submitted_code TEXT NOT NULL,
  language VARCHAR(50) NOT NULL,
  test_cases_passed INT DEFAULT 0,
  total_test_cases INT DEFAULT 0,
  score DECIMAL(5, 2) DEFAULT 0.00,
  submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  execution_time_ms INT,
  memory_used_kb INT,
  status VARCHAR(20) DEFAULT 'completed',
  CONSTRAINT fk_submission_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_submission_module FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE,
  CONSTRAINT chk_score_range CHECK (score >= 0 AND score <= 100),
  CONSTRAINT chk_test_cases CHECK (test_cases_passed <= total_test_cases)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_submissions_student ON student_submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_submissions_module ON student_submissions(module_id);
CREATE INDEX IF NOT EXISTS idx_submissions_score ON student_submissions(score DESC);
CREATE INDEX IF NOT EXISTS idx_submissions_date ON student_submissions(submitted_at DESC);


-- 2. VIEW: STUDENT CODING PROGRESS SUMMARY
-- =====================================================
CREATE OR REPLACE VIEW v_student_coding_progress AS
SELECT 
  s.id AS student_id,
  s.name AS student_name,
  s.email AS student_email,
  s.reg_no,
  s.class_dept,
  s.section,
  COUNT(DISTINCT sub.module_id) AS modules_attempted,
  COUNT(sub.id) AS total_submissions,
  ROUND(AVG(sub.score), 2) AS average_score,
  MAX(sub.score) AS highest_score,
  MIN(sub.score) AS lowest_score,
  COUNT(CASE WHEN sub.score >= 80 THEN 1 END) AS excellent_submissions,
  COUNT(CASE WHEN sub.score >= 60 AND sub.score < 80 THEN 1 END) AS good_submissions,
  COUNT(CASE WHEN sub.score < 60 THEN 1 END) AS needs_improvement,
  MAX(sub.submitted_at) AS last_submission_date
FROM students s
LEFT JOIN student_submissions sub ON s.id = sub.student_id
GROUP BY s.id, s.name, s.email, s.reg_no, s.class_dept, s.section;


-- 3. VIEW: MODULE CODING STATISTICS
-- =====================================================
CREATE OR REPLACE VIEW v_module_coding_stats AS
SELECT 
  m.id AS module_id,
  m.topic_title,
  m.subject,
  m.section,
  m.teacher_name,
  COUNT(DISTINCT sub.student_id) AS students_attempted,
  COUNT(sub.id) AS total_submissions,
  ROUND(AVG(sub.score), 2) AS average_score,
  MAX(sub.score) AS highest_score,
  MIN(sub.score) AS lowest_score,
  ROUND(AVG(sub.test_cases_passed::DECIMAL / NULLIF(sub.total_test_cases, 0) * 100), 2) AS avg_pass_rate,
  COUNT(CASE WHEN sub.score = 100 THEN 1 END) AS perfect_scores,
  MAX(sub.submitted_at) AS last_submission_date
FROM modules m
LEFT JOIN student_submissions sub ON m.id = sub.module_id
GROUP BY m.id, m.topic_title, m.subject, m.section, m.teacher_name;


-- 4. VIEW: DETAILED SUBMISSION HISTORY
-- =====================================================
CREATE OR REPLACE VIEW v_submission_details AS
SELECT 
  sub.id AS submission_id,
  sub.student_id,
  s.name AS student_name,
  s.email AS student_email,
  s.reg_no,
  s.class_dept,
  s.section,
  sub.module_id,
  m.topic_title AS module_title,
  m.subject,
  m.teacher_name,
  sub.language,
  sub.test_cases_passed,
  sub.total_test_cases,
  sub.score,
  sub.submitted_at,
  sub.status,
  CASE 
    WHEN sub.score >= 90 THEN 'Excellent'
    WHEN sub.score >= 80 THEN 'Very Good'
    WHEN sub.score >= 70 THEN 'Good'
    WHEN sub.score >= 60 THEN 'Satisfactory'
    ELSE 'Needs Improvement'
  END AS grade_category,
  RANK() OVER (PARTITION BY sub.module_id ORDER BY sub.score DESC) AS rank_in_module,
  ROW_NUMBER() OVER (PARTITION BY sub.student_id, sub.module_id ORDER BY sub.submitted_at DESC) AS attempt_number
FROM student_submissions sub
JOIN students s ON sub.student_id = s.id
JOIN modules m ON sub.module_id = m.id;


-- 5. VIEW: TEACHER'S CODING DASHBOARD
-- =====================================================
CREATE OR REPLACE VIEW v_teacher_coding_dashboard AS
SELECT 
  t.id AS teacher_id,
  t.name AS teacher_name,
  t.dept,
  m.id AS module_id,
  m.topic_title,
  m.subject,
  m.section,
  COUNT(DISTINCT sub.student_id) AS students_submitted,
  COUNT(sub.id) AS total_submissions,
  ROUND(AVG(sub.score), 2) AS class_average,
  MAX(sub.score) AS top_score,
  COUNT(CASE WHEN sub.score >= 80 THEN 1 END) AS high_performers,
  COUNT(CASE WHEN sub.score < 60 THEN 1 END) AS struggling_students,
  MAX(sub.submitted_at) AS latest_submission
FROM teachers t
JOIN modules m ON m.teacher_id = t.id
LEFT JOIN student_submissions sub ON m.id = sub.module_id
GROUP BY t.id, t.name, t.dept, m.id, m.topic_title, m.subject, m.section;


-- 6. VIEW: LANGUAGE POPULARITY STATISTICS
-- =====================================================
CREATE OR REPLACE VIEW v_language_statistics AS
SELECT 
  language,
  COUNT(*) AS total_submissions,
  COUNT(DISTINCT student_id) AS unique_students,
  ROUND(AVG(score), 2) AS average_score,
  COUNT(CASE WHEN score >= 80 THEN 1 END) AS high_score_count,
  ROUND(AVG(test_cases_passed::DECIMAL / NULLIF(total_test_cases, 0) * 100), 2) AS avg_pass_rate
FROM student_submissions
GROUP BY language
ORDER BY total_submissions DESC;


-- 7. FUNCTION: GET STUDENT'S BEST SUBMISSION FOR MODULE
-- =====================================================
CREATE OR REPLACE FUNCTION get_best_submission(
  p_student_id INT,
  p_module_id INT
)
RETURNS TABLE (
  submission_id INT,
  score DECIMAL(5,2),
  language VARCHAR(50),
  test_cases_passed INT,
  total_test_cases INT,
  submitted_at TIMESTAMP
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    id,
    student_submissions.score,
    student_submissions.language,
    student_submissions.test_cases_passed,
    student_submissions.total_test_cases,
    student_submissions.submitted_at
  FROM student_submissions
  WHERE student_id = p_student_id 
    AND module_id = p_module_id
  ORDER BY student_submissions.score DESC, submitted_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;


-- 8. FUNCTION: GET TOP PERFORMERS FOR MODULE
-- =====================================================
CREATE OR REPLACE FUNCTION get_top_performers(
  p_module_id INT,
  p_limit INT DEFAULT 10
)
RETURNS TABLE (
  student_id INT,
  student_name VARCHAR(255),
  reg_no VARCHAR(50),
  best_score DECIMAL(5,2),
  total_attempts BIGINT,
  last_submission TIMESTAMP
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.id,
    s.name,
    s.reg_no,
    MAX(sub.score) AS best_score,
    COUNT(sub.id) AS total_attempts,
    MAX(sub.submitted_at) AS last_submission
  FROM students s
  JOIN student_submissions sub ON s.id = sub.student_id
  WHERE sub.module_id = p_module_id
  GROUP BY s.id, s.name, s.reg_no
  ORDER BY best_score DESC, last_submission DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;


-- 9. FUNCTION: GET STUDENT'S SUBMISSION HISTORY
-- =====================================================
CREATE OR REPLACE FUNCTION get_student_submission_history(
  p_student_id INT,
  p_limit INT DEFAULT 20
)
RETURNS TABLE (
  submission_id INT,
  module_id INT,
  module_title VARCHAR(255),
  subject VARCHAR(100),
  language VARCHAR(50),
  score DECIMAL(5,2),
  test_cases_passed INT,
  total_test_cases INT,
  submitted_at TIMESTAMP,
  grade_category VARCHAR(20)
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    sub.id,
    sub.module_id,
    m.topic_title,
    m.subject,
    sub.language,
    sub.score,
    sub.test_cases_passed,
    sub.total_test_cases,
    sub.submitted_at,
    CASE 
      WHEN sub.score >= 90 THEN 'Excellent'
      WHEN sub.score >= 80 THEN 'Very Good'
      WHEN sub.score >= 70 THEN 'Good'
      WHEN sub.score >= 60 THEN 'Satisfactory'
      ELSE 'Needs Improvement'
    END AS grade_category
  FROM student_submissions sub
  JOIN modules m ON sub.module_id = m.id
  WHERE sub.student_id = p_student_id
  ORDER BY sub.submitted_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;


-- 10. FUNCTION: CALCULATE MODULE DIFFICULTY SCORE
-- =====================================================
CREATE OR REPLACE FUNCTION calculate_module_difficulty(p_module_id INT)
RETURNS DECIMAL(5,2) AS $$
DECLARE
  difficulty_score DECIMAL(5,2);
BEGIN
  SELECT 
    CASE 
      WHEN AVG(score) >= 80 THEN 1.0  -- Easy
      WHEN AVG(score) >= 60 THEN 2.0  -- Medium
      WHEN AVG(score) >= 40 THEN 3.0  -- Hard
      ELSE 4.0                         -- Very Hard
    END INTO difficulty_score
  FROM student_submissions
  WHERE module_id = p_module_id
    AND submitted_at >= NOW() - INTERVAL '30 days';
  
  RETURN COALESCE(difficulty_score, 2.0);
END;
$$ LANGUAGE plpgsql;


-- 11. TRIGGER: UPDATE SUBMISSION TIMESTAMP
-- =====================================================
CREATE OR REPLACE FUNCTION update_submission_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.submitted_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_submission_timestamp ON student_submissions;
CREATE TRIGGER trg_update_submission_timestamp
  BEFORE UPDATE ON student_submissions
  FOR EACH ROW
  EXECUTE FUNCTION update_submission_timestamp();


-- 12. FUNCTION: GET LEADERBOARD
-- =====================================================
CREATE OR REPLACE FUNCTION get_coding_leaderboard(
  p_section VARCHAR(50) DEFAULT NULL,
  p_limit INT DEFAULT 20
)
RETURNS TABLE (
  rank BIGINT,
  student_id INT,
  student_name VARCHAR(255),
  reg_no VARCHAR(50),
  section VARCHAR(50),
  total_submissions BIGINT,
  average_score DECIMAL(5,2),
  perfect_scores BIGINT,
  modules_completed BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ROW_NUMBER() OVER (ORDER BY AVG(sub.score) DESC, COUNT(sub.id) DESC) AS rank,
    s.id,
    s.name,
    s.reg_no,
    CONCAT(s.class_dept, ' ', s.section) AS section,
    COUNT(sub.id) AS total_submissions,
    ROUND(AVG(sub.score), 2) AS average_score,
    COUNT(CASE WHEN sub.score = 100 THEN 1 END) AS perfect_scores,
    COUNT(DISTINCT sub.module_id) AS modules_completed
  FROM students s
  JOIN student_submissions sub ON s.id = sub.student_id
  WHERE (p_section IS NULL OR CONCAT(s.class_dept, ' ', s.section) = p_section)
  GROUP BY s.id, s.name, s.reg_no, s.class_dept, s.section
  HAVING COUNT(sub.id) > 0
  ORDER BY average_score DESC, total_submissions DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;


-- =====================================================
-- SAMPLE QUERIES FOR TESTING
-- =====================================================

-- Get student's coding progress
-- SELECT * FROM v_student_coding_progress WHERE student_id = 1;

-- Get module statistics
-- SELECT * FROM v_module_coding_stats WHERE module_id = 1;

-- Get detailed submission history
-- SELECT * FROM v_submission_details WHERE student_id = 1 ORDER BY submitted_at DESC;

-- Get teacher's dashboard
-- SELECT * FROM v_teacher_coding_dashboard WHERE teacher_id = 1;

-- Get language statistics
-- SELECT * FROM v_language_statistics;

-- Get student's best submission for a module
-- SELECT * FROM get_best_submission(1, 1);

-- Get top performers for a module
-- SELECT * FROM get_top_performers(1, 10);

-- Get student's submission history
-- SELECT * FROM get_student_submission_history(1, 20);

-- Calculate module difficulty
-- SELECT calculate_module_difficulty(1);

-- Get coding leaderboard
-- SELECT * FROM get_coding_leaderboard(NULL, 20);

-- Get section-specific leaderboard
-- SELECT * FROM get_coding_leaderboard('ECE A', 10);
