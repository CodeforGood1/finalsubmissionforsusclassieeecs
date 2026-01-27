-- Add module_completion table for tracking student progress through module steps

CREATE TABLE IF NOT EXISTS module_completion (
  id SERIAL PRIMARY KEY,
  module_id INTEGER NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  step_index INTEGER NOT NULL,
  is_completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(module_id, student_id, step_index)
);

CREATE INDEX IF NOT EXISTS idx_module_completion_module ON module_completion(module_id);
CREATE INDEX IF NOT EXISTS idx_module_completion_student ON module_completion(student_id);
CREATE INDEX IF NOT EXISTS idx_module_completion_completed ON module_completion(is_completed);

-- Grant permissions
GRANT ALL PRIVILEGES ON module_completion TO postgres;
GRANT ALL PRIVILEGES ON module_completion_id_seq TO postgres;

COMMENT ON TABLE module_completion IS 'Tracks student progress through individual module steps';
COMMENT ON COLUMN module_completion.step_index IS 'Zero-based index of the step within the module';
COMMENT ON COLUMN module_completion.is_completed IS 'Whether the student has completed this step';
