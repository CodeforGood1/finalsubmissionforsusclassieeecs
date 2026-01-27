const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

(async () => {
  try {
    console.log('\n=== CHECKING STUDENT DATA ===');
    const students = await pool.query(`
      SELECT id, name, class_dept, section 
      FROM students 
      LIMIT 5
    `);
    console.log('Students:', JSON.stringify(students.rows, null, 2));
    
    console.log('\n=== CHECKING MODULE DATA ===');
    const modules = await pool.query(`
      SELECT id, topic_title, section, teacher_id, step_count
      FROM modules 
      LIMIT 5
    `);
    console.log('Modules:', JSON.stringify(modules.rows, null, 2));
    
    console.log('\n=== CHECKING MODULE COMPLETION DATA ===');
    const completions = await pool.query(`
      SELECT module_id, student_id, step_index, is_completed
      FROM module_completion
      LIMIT 10
    `);
    console.log('Module Completions:', JSON.stringify(completions.rows, null, 2));
    
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
})();
