-- Add subject column to modules table
-- Run this in your Neon PostgreSQL console

-- 1. Add subject column to modules table
ALTER TABLE modules ADD COLUMN IF NOT EXISTS subject VARCHAR(255);

-- 2. Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_modules_subject ON modules(subject);
CREATE INDEX IF NOT EXISTS idx_modules_section_subject ON modules(section, subject);

-- 3. Update existing modules to have a default subject (optional)
-- UPDATE modules SET subject = 'General' WHERE subject IS NULL;

SELECT '[OK] Added subject column to modules table' as status;

-- 4. Verify the change
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'modules' 
AND column_name = 'subject';
