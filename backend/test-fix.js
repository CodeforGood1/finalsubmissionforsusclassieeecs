const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

(async () => {
  try {
    const studentId = 13;
    
    console.log('\n=== TESTING FIXED COMPLETION COUNT ===\n');
    
    const student = await pool.query('SELECT id, name, class_dept, section FROM students WHERE id = $1', [studentId]);
    if (student.rows.length === 0) {
      console.log('Student 13 not found, testing with student 1');
      return;
    }
    
    console.log('Student:', student.rows[0]);
    
    const { class_dept, section } = student.rows[0];
    const fullSection = `${class_dept} ${section}`;
    console.log('Full Section:', fullSection);
    
    // Get modules for this student's section
    const modules = await pool.query(
      'SELECT id, topic_title, step_count FROM modules WHERE LOWER(section) = LOWER($1)',
      [fullSection]
    );
    
    console.log('\n=== MODULES IN SECTION ===');
    modules.rows.forEach(m => {
      console.log(`  Module ${m.id}: "${m.topic_title}" (${m.step_count} steps)`);
    });
    
    // Check what this student has completed
    const completions = await pool.query(
      'SELECT module_id, step_index FROM module_completion WHERE student_id = $1 AND is_completed = true ORDER BY module_id, step_index',
      [studentId]
    );
    
    console.log('\n=== STUDENT COMPLETIONS ===');
    console.log('Completed steps:', completions.rows);
    
    // Test OLD query (broken)
    console.log('\n=== OLD QUERY (BROKEN - uses 1-based) ===');
    const oldQuery = await pool.query(`
      SELECT COUNT(DISTINCT m.id) as completed
      FROM modules m
      WHERE LOWER(m.section) = LOWER($1)
      AND m.step_count > 0
      AND NOT EXISTS (
        SELECT 1 FROM generate_series(1, m.step_count) s(n)
        WHERE NOT EXISTS (
          SELECT 1 FROM module_completion mc 
          WHERE mc.module_id = m.id AND mc.student_id = $2 AND mc.step_index = s.n AND mc.is_completed = true
        )
      )
    `, [fullSection, studentId]);
    console.log('Old Result:', oldQuery.rows[0].completed, 'modules completed');
    
    // Test NEW query (fixed)
    console.log('\n=== NEW QUERY (FIXED - uses 0-based) ===');
    const newQuery = await pool.query(`
      SELECT COUNT(DISTINCT m.id) as completed
      FROM modules m
      WHERE LOWER(m.section) = LOWER($1)
      AND m.step_count > 0
      AND NOT EXISTS (
        SELECT 1 FROM generate_series(0, m.step_count - 1) s(n)
        WHERE NOT EXISTS (
          SELECT 1 FROM module_completion mc 
          WHERE mc.module_id = m.id AND mc.student_id = $2 AND mc.step_index = s.n AND mc.is_completed = true
        )
      )
    `, [fullSection, studentId]);
    console.log('New Result:', newQuery.rows[0].completed, 'modules completed');
    
    // Detail check
    console.log('\n=== DETAILED CHECK ===');
    for (const module of modules.rows) {
      const steps = await pool.query(
        'SELECT step_index FROM module_completion WHERE module_id = $1 AND student_id = $2 AND is_completed = true ORDER BY step_index',
        [module.id, studentId]
      );
      const completedIndices = steps.rows.map(r => r.step_index);
      const expectedIndices = Array.from({ length: module.step_count }, (_, i) => i);
      const isComplete = completedIndices.length === module.step_count;
      
      console.log(`Module ${module.id} "${module.topic_title}":`);
      console.log(`  Expected indices: [${expectedIndices.join(', ')}]`);
      console.log(`  Completed indices: [${completedIndices.join(', ')}]`);
      console.log(`  Status: ${isComplete ? '✓ COMPLETE' : '✗ INCOMPLETE'}`);
    }
    
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
})();
