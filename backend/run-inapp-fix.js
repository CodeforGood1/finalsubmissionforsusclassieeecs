require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function createInAppNotificationsTable() {
  try {
    console.log('🔧 Creating in_app_notifications table...\n');

    // Create table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS in_app_notifications (
        id SERIAL PRIMARY KEY,
        recipient_id INTEGER NOT NULL,
        recipient_type TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        type TEXT NOT NULL,
        action_url TEXT,
        metadata JSONB DEFAULT '{}'::jsonb,
        is_read BOOLEAN DEFAULT false,
        read_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        
        CONSTRAINT chk_recipient_type CHECK (recipient_type IN ('student', 'teacher', 'admin')),
        CONSTRAINT chk_notification_type CHECK (type IN ('module', 'test', 'submission', 'deadline', 'grade', 'announcement', 'system'))
      )
    `);
    console.log('✅ Table created successfully');

    // Create indexes
    await pool.query('CREATE INDEX IF NOT EXISTS idx_inapp_recipient ON in_app_notifications(recipient_id, recipient_type)');
    console.log('✅ Index 1 created (recipient)');

    await pool.query('CREATE INDEX IF NOT EXISTS idx_inapp_unread ON in_app_notifications(recipient_id, recipient_type, is_read)');
    console.log('✅ Index 2 created (unread)');

    await pool.query('CREATE INDEX IF NOT EXISTS idx_inapp_created ON in_app_notifications(created_at DESC)');
    console.log('✅ Index 3 created (created_at)');

    // Verify table exists
    const result = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name = 'in_app_notifications'
    `);

    console.log('\n🎉 Setup complete!');
    console.log(`📊 Table verified: ${result.rows.length > 0 ? 'EXISTS' : 'NOT FOUND'}`);
    
    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Error:', err.message);
    console.error('Full error:', err);
    await pool.end();
    process.exit(1);
  }
}

createInAppNotificationsTable();
