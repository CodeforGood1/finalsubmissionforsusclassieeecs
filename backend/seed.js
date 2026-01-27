/**
 * ============================================================
 * SUSTAINABLE CLASSROOM - DATABASE SEED SCRIPT
 * ============================================================
 * Run: node seed.js
 * This script will:
 * 1. Connect to PostgreSQL
 * 2. Create tables if they don't exist
 * 3. Seed sample data with properly hashed passwords
 * ============================================================
 */

require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');

const SALT_ROUNDS = 10;

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://lms_user:lms_password@localhost:5432/lms_db',
  ...(process.env.DB_SSL === 'true' ? { ssl: { rejectUnauthorized: false } } : {})
});

// ============================================================
// SEED DATA
// ============================================================

const teachers = [
  { name: 'Dr. Sarah Okonkwo', email: 'susclass.global+sarah.teacher@gmail.com', password: 'password123', staff_id: 'TCH001', dept: 'Science', sections: ['SS1 A', 'SS1 B', 'SS2 A'] },
  { name: 'Mr. Emmanuel Adebayo', email: 'susclass.global+emmanuel.teacher@gmail.com', password: 'password123', staff_id: 'TCH002', dept: 'Mathematics', sections: ['SS1 A', 'SS1 B', 'SS2 A', 'SS2 B'] },
  { name: 'Mrs. Fatima Bello', email: 'susclass.global+fatima.teacher@gmail.com', password: 'password123', staff_id: 'TCH003', dept: 'English', sections: ['SS1 A', 'SS2 A', 'SS2 B'] }
];

const students = [
  { name: 'Amara Okafor', email: 'susclass.global+amara@gmail.com', password: 'student123', reg_no: 'STU2024001', class_dept: 'SS1', section: 'A' },
  { name: 'Chidi Eze', email: 'susclass.global+chidi@gmail.com', password: 'student123', reg_no: 'STU2024002', class_dept: 'SS1', section: 'A' },
  { name: 'Ngozi Uche', email: 'susclass.global+ngozi@gmail.com', password: 'student123', reg_no: 'STU2024003', class_dept: 'SS1', section: 'A' },
  { name: 'Oluwaseun Bakare', email: 'susclass.global+seun@gmail.com', password: 'student123', reg_no: 'STU2024004', class_dept: 'SS1', section: 'B' },
  { name: 'Aisha Mohammed', email: 'susclass.global+aisha@gmail.com', password: 'student123', reg_no: 'STU2024005', class_dept: 'SS1', section: 'B' },
  { name: 'Kwame Asante', email: 'susclass.global+kwame@gmail.com', password: 'student123', reg_no: 'STU2024006', class_dept: 'SS2', section: 'A' },
  { name: 'Zainab Ibrahim', email: 'susclass.global+zainab@gmail.com', password: 'student123', reg_no: 'STU2024007', class_dept: 'SS2', section: 'A' },
  { name: 'Emeka Nwosu', email: 'susclass.global+emeka@gmail.com', password: 'student123', reg_no: 'STU2024008', class_dept: 'SS2', section: 'A' },
  { name: 'Blessing Okoro', email: 'susclass.global+blessing@gmail.com', password: 'student123', reg_no: 'STU2024009', class_dept: 'SS2', section: 'B' },
  { name: 'Tunde Adeyemi', email: 'susclass.global+tunde@gmail.com', password: 'student123', reg_no: 'STU2024010', class_dept: 'SS2', section: 'B' }
];

const modules = [
  {
    section: 'SS1 A',
    topic_title: 'Introduction to Biology - Cell Structure',
    teacher_id: 1,
    teacher_name: 'Dr. Sarah Okonkwo',
    steps: [
      { title: 'What is a Cell?', type: 'text', content: 'A cell is the basic unit of life. All living organisms are made up of cells. Cells are so small that we need microscopes to see them.' },
      { title: 'Parts of a Cell', type: 'text', content: 'Key parts include: Nucleus (control center), Mitochondria (powerhouse), Cell Membrane (outer layer), Cytoplasm (jelly-like substance).' },
      { title: 'Cell Types', type: 'text', content: 'There are two main types: Prokaryotic cells (no nucleus, like bacteria) and Eukaryotic cells (has nucleus, like animal and plant cells).' },
      { title: 'Quiz', type: 'quiz', content: JSON.stringify({ question: 'What is the powerhouse of the cell?', options: ['Nucleus', 'Mitochondria', 'Ribosome'], answer: 1 }) }
    ]
  },
  {
    section: 'SS1 A',
    topic_title: 'Basic Mathematics - Algebra Fundamentals',
    teacher_id: 2,
    teacher_name: 'Mr. Emmanuel Adebayo',
    steps: [
      { title: 'Introduction to Variables', type: 'text', content: 'In algebra, we use letters like x and y to represent unknown values. These are called variables.' },
      { title: 'Solving Simple Equations', type: 'text', content: 'To solve x + 5 = 10, subtract 5 from both sides: x = 5. Always do the same operation to both sides!' },
      { title: 'Practice Problems', type: 'exercise', content: JSON.stringify({ problems: ['x + 3 = 7', '2x = 10', 'x - 4 = 6'] }) }
    ]
  },
  {
    section: 'SS1 B',
    topic_title: 'English Grammar - Parts of Speech',
    teacher_id: 3,
    teacher_name: 'Mrs. Fatima Bello',
    steps: [
      { title: 'Nouns', type: 'text', content: 'A noun is a word that represents a person, place, thing, or idea. Examples: teacher, school, book, happiness.' },
      { title: 'Verbs', type: 'text', content: 'A verb describes an action, state, or occurrence. Examples: run, think, is, become.' },
      { title: 'Adjectives', type: 'text', content: 'An adjective describes or modifies a noun. Examples: tall, beautiful, intelligent, red.' },
      { title: 'Grammar Quiz', type: 'quiz', content: JSON.stringify({ question: 'Which word is a verb?', options: ['Run', 'Beautiful', 'Table'], answer: 0 }) }
    ]
  },
  {
    section: 'SS2 A',
    topic_title: 'Physics - Forces and Motion',
    teacher_id: 1,
    teacher_name: 'Dr. Sarah Okonkwo',
    steps: [
      { title: 'What is Force?', type: 'text', content: 'Force is a push or pull that can change the motion of an object. Force is measured in Newtons (N).' },
      { title: "Newton's First Law", type: 'text', content: 'An object at rest stays at rest, and an object in motion stays in motion unless acted upon by an external force.' },
      { title: "Newton's Second Law", type: 'text', content: 'Force equals mass times acceleration: F = ma. If you double the force, you double the acceleration.' },
      { title: "Newton's Third Law", type: 'text', content: 'For every action, there is an equal and opposite reaction.' },
      { title: 'Practice', type: 'exercise', content: JSON.stringify({ problems: ['Calculate force when m=5kg and a=2m/s²', 'If F=20N and m=4kg, find acceleration'] }) }
    ]
  }
];

const mcqTests = [
  {
    teacher_id: 1,
    teacher_name: 'Dr. Sarah Okonkwo',
    section: 'SS1 A',
    title: 'Biology Quiz: Cell Structure',
    description: 'Test your knowledge of cell biology fundamentals',
    questions: [
      { question: 'What is the powerhouse of the cell?', options: ['Nucleus', 'Mitochondria', 'Ribosome', 'Golgi Body'], correctAnswer: 1 },
      { question: 'Which organelle contains genetic material?', options: ['Cytoplasm', 'Cell Wall', 'Nucleus', 'Vacuole'], correctAnswer: 2 },
      { question: 'What surrounds the cell?', options: ['Cell Membrane', 'Nuclear Membrane', 'Cytoplasm', 'Chloroplast'], correctAnswer: 0 },
      { question: 'Where does photosynthesis occur?', options: ['Mitochondria', 'Nucleus', 'Chloroplast', 'Ribosome'], correctAnswer: 2 },
      { question: "What is the jelly-like substance inside cells?", options: ['Nucleus', 'Cytoplasm', 'Membrane', 'Vacuole'], correctAnswer: 1 }
    ],
    daysUntilDeadline: 7
  },
  {
    teacher_id: 2,
    teacher_name: 'Mr. Emmanuel Adebayo',
    section: 'SS1 A',
    title: 'Algebra Basics Test',
    description: 'Basic algebra concepts assessment',
    questions: [
      { question: 'Solve: x + 5 = 12', options: ['5', '6', '7', '8'], correctAnswer: 2 },
      { question: 'Solve: 2x = 10', options: ['4', '5', '6', '8'], correctAnswer: 1 },
      { question: 'Solve: x - 3 = 7', options: ['4', '10', '7', '3'], correctAnswer: 1 },
      { question: 'If x = 4, what is 3x?', options: ['7', '12', '34', '1'], correctAnswer: 1 },
      { question: 'Solve: x/2 = 6', options: ['3', '8', '12', '4'], correctAnswer: 2 }
    ],
    daysUntilDeadline: 5
  },
  {
    teacher_id: 3,
    teacher_name: 'Mrs. Fatima Bello',
    section: 'SS1 B',
    title: 'English Grammar Test',
    description: 'Parts of speech and grammar fundamentals',
    questions: [
      { question: 'Which is a noun?', options: ['Run', 'Beautiful', 'Book', 'Quickly'], correctAnswer: 2 },
      { question: 'Which is a verb?', options: ['Happy', 'Jump', 'Red', 'School'], correctAnswer: 1 },
      { question: 'Which is an adjective?', options: ['Tall', 'Walk', 'Table', 'Slowly'], correctAnswer: 0 },
      { question: 'Which is an adverb?', options: ['Fast', 'Fastly', 'Quickly', 'Quick'], correctAnswer: 2 },
      { question: 'Identify the pronoun:', options: ['She', 'Dog', 'Run', 'Blue'], correctAnswer: 0 }
    ],
    daysUntilDeadline: 7
  }
];

// ============================================================
// MAIN SEED FUNCTION
// ============================================================

async function seed() {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║       SUSTAINABLE CLASSROOM - DATABASE SEEDER          ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log('');

  try {
    // Test connection
    console.log('🔌 Connecting to database...');
    await pool.query('SELECT NOW()');
    console.log('✅ Database connected successfully\n');

    // Check if tables exist, if not, create basic structure
    console.log('📋 Checking database schema...');
    const tablesExist = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'teachers'
      )
    `);
    
    if (!tablesExist.rows[0].exists) {
      console.log('⚠️  Tables not found, creating basic schema...');
      await pool.query(`
        CREATE TABLE IF NOT EXISTS teachers (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          staff_id TEXT,
          dept TEXT,
          media JSONB DEFAULT '{}'::jsonb,
          allocated_sections JSONB DEFAULT '[]'::jsonb,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE TABLE IF NOT EXISTS students (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          reg_no TEXT,
          class_dept TEXT,
          section TEXT,
          media JSONB DEFAULT '{}'::jsonb,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE TABLE IF NOT EXISTS modules (
          id SERIAL PRIMARY KEY,
          section TEXT NOT NULL,
          topic_title TEXT NOT NULL,
          teacher_id INTEGER REFERENCES teachers(id),
          teacher_name TEXT NOT NULL,
          step_count INTEGER DEFAULT 0,
          steps JSONB DEFAULT '[]'::jsonb,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE TABLE IF NOT EXISTS mcq_tests (
          id SERIAL PRIMARY KEY,
          teacher_id INTEGER REFERENCES teachers(id),
          teacher_name TEXT NOT NULL,
          section TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT,
          questions JSONB NOT NULL DEFAULT '[]'::jsonb,
          total_questions INTEGER NOT NULL,
          start_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          deadline TIMESTAMP NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          is_active BOOLEAN DEFAULT true
        );
        
        CREATE TABLE IF NOT EXISTS test_submissions (
          id SERIAL PRIMARY KEY,
          test_id INTEGER REFERENCES mcq_tests(id),
          student_id INTEGER REFERENCES students(id),
          student_name TEXT NOT NULL,
          student_reg_no TEXT,
          answers JSONB DEFAULT '{}'::jsonb,
          score INTEGER DEFAULT 0,
          percentage DECIMAL(5,2) DEFAULT 0.00,
          status TEXT DEFAULT 'completed',
          submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          time_taken INTEGER,
          UNIQUE(test_id, student_id)
        );
      `);
      console.log('✅ Basic schema created\n');
    } else {
      console.log('✅ Tables already exist\n');
    }

    // Clear existing data
    console.log('🧹 Clearing existing data...');
    await pool.query('DELETE FROM test_submissions');
    await pool.query('DELETE FROM mcq_tests');
    await pool.query('DELETE FROM modules');
    await pool.query('DELETE FROM students');
    await pool.query('DELETE FROM teachers');
    console.log('✅ Existing data cleared\n');

    // Seed teachers
    console.log('👨‍🏫 Creating teachers...');
    const teacherIdMap = {}; // Map original teacher_id (1,2,3) to actual DB IDs
    let teacherIndex = 1;
    for (const teacher of teachers) {
      const hashedPassword = await bcrypt.hash(teacher.password, SALT_ROUNDS);
      const result = await pool.query(
        `INSERT INTO teachers (name, email, password, staff_id, dept, allocated_sections) 
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [teacher.name, teacher.email, hashedPassword, teacher.staff_id, teacher.dept, JSON.stringify(teacher.sections)]
      );
      teacherIdMap[teacherIndex] = result.rows[0].id;
      teacherIndex++;
      console.log(`   ✓ ${teacher.name} (${teacher.email}) - ID: ${result.rows[0].id}`);
    }
    console.log('');

    // Seed students
    console.log('👨‍🎓 Creating students...');
    for (const student of students) {
      const hashedPassword = await bcrypt.hash(student.password, SALT_ROUNDS);
      await pool.query(
        `INSERT INTO students (name, email, password, reg_no, class_dept, section) 
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [student.name, student.email, hashedPassword, student.reg_no, student.class_dept, student.section]
      );
      console.log(`   ✓ ${student.name} (${student.class_dept} ${student.section})`);
    }
    console.log('');

    // Seed modules
    console.log('📚 Creating learning modules...');
    for (const module of modules) {
      const actualTeacherId = teacherIdMap[module.teacher_id]; // Map to actual DB ID
      await pool.query(
        `INSERT INTO modules (section, topic_title, teacher_id, teacher_name, step_count, steps) 
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [module.section, module.topic_title, actualTeacherId, module.teacher_name, module.steps.length, JSON.stringify(module.steps)]
      );
      console.log(`   ✓ ${module.topic_title}`);
    }
    console.log('');

    // Seed MCQ tests
    console.log('📝 Creating MCQ tests...');
    for (const test of mcqTests) {
      const deadline = new Date();
      deadline.setDate(deadline.getDate() + test.daysUntilDeadline);
      const actualTeacherId = teacherIdMap[test.teacher_id]; // Map to actual DB ID
      
      await pool.query(
        `INSERT INTO mcq_tests (teacher_id, teacher_name, section, title, description, questions, total_questions, start_date, deadline) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8)`,
        [actualTeacherId, test.teacher_name, test.section, test.title, test.description, JSON.stringify(test.questions), test.questions.length, deadline]
      );
      console.log(`   ✓ ${test.title}`);
    }
    console.log('');

    // Verify counts
    console.log('📊 Verifying seed data...');
    const counts = await pool.query(`
      SELECT 'Teachers' as entity, COUNT(*) as count FROM teachers
      UNION ALL SELECT 'Students', COUNT(*) FROM students
      UNION ALL SELECT 'Modules', COUNT(*) FROM modules
      UNION ALL SELECT 'MCQ Tests', COUNT(*) FROM mcq_tests
    `);
    
    console.log('');
    console.log('┌─────────────────┬───────┐');
    console.log('│ Entity          │ Count │');
    console.log('├─────────────────┼───────┤');
    for (const row of counts.rows) {
      console.log(`│ ${row.entity.padEnd(15)} │ ${row.count.toString().padStart(5)} │`);
    }
    console.log('└─────────────────┴───────┘');

    console.log('');
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║                   ✅ SEEDING COMPLETED!                        ║');
    console.log('╠════════════════════════════════════════════════════════════════╣');
    console.log('║  LOGIN CREDENTIALS (all emails go to susclass.global@gmail.com)║');
    console.log('║                                                                ║');
    console.log('║  TEACHERS (password: password123):                             ║');
    console.log('║    • susclass.global+sarah.teacher@gmail.com                   ║');
    console.log('║    • susclass.global+emmanuel.teacher@gmail.com                ║');
    console.log('║    • susclass.global+fatima.teacher@gmail.com                  ║');
    console.log('║                                                                ║');
    console.log('║  STUDENTS (password: student123):                              ║');
    console.log('║    • susclass.global+amara@gmail.com (SS1 A)                   ║');
    console.log('║    • susclass.global+chidi@gmail.com (SS1 A)                   ║');
    console.log('║    • susclass.global+seun@gmail.com (SS1 B)                    ║');
    console.log('║    • susclass.global+kwame@gmail.com (SS2 A)                   ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    console.log('');

  } catch (error) {
    console.error('');
    console.error('❌ Seeding failed:', error.message);
    console.error('');
    if (error.code === 'ECONNREFUSED') {
      console.error('💡 Make sure PostgreSQL is running:');
      console.error('   docker-compose up -d postgres');
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run seed
seed();
