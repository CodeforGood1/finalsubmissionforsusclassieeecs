// ============================================================
// NOTIFICATION SYSTEM DATABASE SETUP
// ============================================================
// Run this script to create notification tables, views, and triggers
// Usage: node setup-notifications.js
// ============================================================

require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

console.log('\n========================================');
console.log('Notification System Setup');
console.log('========================================\n');

// Create database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function setupNotifications() {
  try {
    console.log('[OK] DATABASE_URL loaded from .env');
    console.log('[OK] Connecting to database...\n');

    // Test connection
    await pool.query('SELECT NOW()');
    console.log('[OK] Database connection successful\n');

    // Read SQL file
    const sqlFilePath = path.join(__dirname, 'notification-system.sql');
    console.log(`[OK] Reading SQL file: ${sqlFilePath}\n`);
    
    const sql = fs.readFileSync(sqlFilePath, 'utf8');
    console.log('[OK] SQL file loaded\n');

    console.log('[INFO] Executing SQL script...\n');
    console.log('-----------------------------------');

    // Execute the SQL
    const result = await pool.query(sql);
    
    console.log('-----------------------------------\n');
    console.log('[OK] SQL executed successfully!\n');

    // Verify tables were created
    const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name LIKE 'notification%' 
      ORDER BY table_name
    `);

    console.log('Tables created:');
    tablesResult.rows.forEach(row => {
      console.log(`   [OK] ${row.table_name}`);
    });

    // Count notification events
    const eventsResult = await pool.query('SELECT COUNT(*) as count FROM notification_events');
    console.log(`\n[OK] Seeded ${eventsResult.rows[0].count} notification event types\n`);

    console.log('========================================');
    console.log('NOTIFICATION SYSTEM SETUP COMPLETE');
    console.log('========================================\n');
    console.log('Next steps:');
    console.log('  1. Verify SMTP settings in .env');
    console.log('  2. Restart server: npm run dev');
    console.log('  3. Test notifications\n');

  } catch (error) {
    console.error('\n[ERROR]:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run setup
setupNotifications();
