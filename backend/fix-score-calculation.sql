-- ============================================================
-- FIX SCORE CALCULATION TRIGGER
-- ============================================================
-- This fixes the issue where scores show 0.00%
-- Run this in Neon SQL Editor
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
    total_q INTEGER;
BEGIN
    -- Get test questions and total
    SELECT questions, total_questions INTO test_questions, total_q 
    FROM mcq_tests WHERE id = NEW.test_id;
    
    -- Debug logging
    RAISE NOTICE 'Processing test_id: %', NEW.test_id;
    RAISE NOTICE 'Total questions: %', total_q;
    RAISE NOTICE 'Student answers: %', NEW.answers;
    
    -- Calculate score by comparing answers (case-insensitive)
    FOR q_index IN 0..(jsonb_array_length(test_questions) - 1) LOOP
        question := test_questions->q_index;
        
        -- Get student's answer for this question index
        student_answer := UPPER(TRIM(COALESCE(NEW.answers->>q_index::text, '')));
        
        -- Get correct answer from question
        correct_answer := UPPER(TRIM(COALESCE(question->>'correct', '')));
        
        RAISE NOTICE 'Q%: Student=%, Correct=%, Match=%', 
            q_index, student_answer, correct_answer, (student_answer = correct_answer);
        
        IF student_answer = correct_answer THEN
            correct_count := correct_count + 1;
        END IF;
    END LOOP;
    
    -- Set score and percentage
    NEW.score := correct_count;
    
    IF total_q > 0 THEN
        NEW.percentage := ROUND((correct_count::DECIMAL / total_q * 100)::numeric, 2);
    ELSE
        NEW.percentage := 0;
    END IF;
    
    -- Check if submitted after deadline
    IF NEW.submitted_at > (SELECT deadline FROM mcq_tests WHERE id = NEW.test_id) THEN
        NEW.status := 'late';
    ELSE
        NEW.status := 'completed';
    END IF;
    
    RAISE NOTICE 'Final score: % out of % (%.2f%%)', correct_count, total_q, NEW.percentage;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger
DROP TRIGGER IF EXISTS trigger_calculate_test_score ON test_submissions;
CREATE TRIGGER trigger_calculate_test_score
    BEFORE INSERT OR UPDATE ON test_submissions
    FOR EACH ROW
    EXECUTE FUNCTION calculate_test_score();

-- Test the trigger with a sample
-- Uncomment below to test:
-- SELECT * FROM test_submissions ORDER BY id DESC LIMIT 5;