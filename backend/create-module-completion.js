require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function createTable() {
  try {
    console.log('Creating module_completion table...');
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS module_completion (
        id SERIAL PRIMARY KEY,
        module_id INTEGER NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
        student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        step_index INTEGER NOT NULL,
        is_completed BOOLEAN DEFAULT FALSE,
        completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(module_id, student_id, step_index)
      )
    `);
    console.log('✓ Table created');
    
    await pool.query('CREATE INDEX IF NOT EXISTS idx_module_completion_module ON module_completion(module_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_module_completion_student ON module_completion(student_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_module_completion_completed ON module_completion(is_completed)');
    console.log('✓ Indexes created');
    
    console.log('\n✅ module_completion table setup complete!');
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await pool.end();
  }
}

createTable();
