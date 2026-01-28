-- Add start_date column to existing mcq_tests table
-- Run this if you already created the table without start_date

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'mcq_tests' AND column_name = 'start_date'
    ) THEN
        ALTER TABLE mcq_tests ADD COLUMN start_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
        RAISE NOTICE '[OK] Added start_date column to mcq_tests';
    ELSE
        RAISE NOTICE '→ start_date column already exists';
    END IF;
END $$;