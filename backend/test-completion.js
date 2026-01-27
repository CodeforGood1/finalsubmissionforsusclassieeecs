const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

(async () => {
  try {
    // Test with a known student ID (change this to your test student ID)
    const studentId = 1;
    
    console.log('\n=== TESTING COMPLETED MODULES COUNT ===\n');
    
    // Get student info
    const student = await pool.query('SELECT id, name, class_dept, section FROM students WHERE id = $1', [studentId]);
    console.log('Student:', student.rows[0]);
    
    const { class_dept, section } = student.rows[0];
    const fullSection = `${class_dept} ${section}`;
    console.log('Full Section:', fullSection);
    
    // Get total modules
    const totalModules = await pool.query(
      'SELECT COUNT(*) as total FROM modules WHERE LOWER(section) = LOWER($1)',
      [fullSection]
    );
    console.log('\nTotal Modules:', totalModules.rows[0].total);
    
    // Get all modules for this section with their step counts
    const modules = await pool.query(
      'SELECT id, topic_title, step_count FROM modules WHERE LOWER(section) = LOWER($1)',
      [fullSection]
    );
    console.log('\n=== MODULES IN SECTION ===');
    modules.rows.forEach(m => {
      console.log(`  Module ${m.id}: "${m.topic_title}" (${m.step_count} steps)`);
    });
    
    // Check completion for each module
    console.log('\n=== COMPLETION STATUS PER MODULE ===');
    for (const module of modules.rows) {
      const completedSteps = await pool.query(
        'SELECT step_index FROM module_completion WHERE module_id = $1 AND student_id = $2 AND is_completed = true ORDER BY step_index',
        [module.id, studentId]
      );
      
      const completedStepIndices = completedSteps.rows.map(r => r.step_index);
      const isFullyComplete = completedStepIndices.length === module.step_count;
      
      console.log(`  Module ${module.id} "${module.topic_title}":`);
      console.log(`    Steps: ${completedStepIndices.length}/${module.step_count} completed`);
      console.log(`    Completed steps: [${completedStepIndices.join(', ')}]`);
      console.log(`    Fully Complete: ${isFullyComplete ? 'YES' : 'NO'}`);
    }
    
    // Test the actual query used in the API
    console.log('\n=== TESTING API QUERY ===');
    const completedResult = await pool.query(`
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
    
    console.log('API Query Result - Completed Modules:', completedResult.rows[0].completed);
    
    // Alternative simpler query
    console.log('\n=== TESTING ALTERNATIVE QUERY ===');
    const altQuery = await pool.query(`
      SELECT m.id, m.topic_title, m.step_count,
        (SELECT COUNT(*) FROM module_completion mc 
         WHERE mc.module_id = m.id AND mc.student_id = $2 AND mc.is_completed = true) as completed_steps
      FROM modules m
      WHERE LOWER(m.section) = LOWER($1)
      AND m.step_count > 0
    `, [fullSection, studentId]);
    
    console.log('Modules with completion status:');
    altQuery.rows.forEach(m => {
      const isComplete = parseInt(m.completed_steps) === m.step_count;
      console.log(`  ${m.topic_title}: ${m.completed_steps}/${m.step_count} ${isComplete ? '✓ COMPLETE' : '✗ INCOMPLETE'}`);
    });
    
    const actualCompleted = altQuery.rows.filter(m => parseInt(m.completed_steps) === m.step_count).length;
    console.log('\nActual Completed Count:', actualCompleted);
    
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
})();
