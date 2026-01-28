require('dotenv').config();
const { Pool } = require('pg');

// Lightweight integration probe for notification schema.
// Runs inside a transaction and rolls back so it does not change persistent data.
(async () => {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  const client = await pool.connect();
  try {
    console.log('[INFO] Connecting to database...');
    await client.query('BEGIN');

    // 1) Check tables exist by selecting zero rows.
    const tables = [
      'notification_events',
      'notification_preferences',
      'notification_logs',
      'notification_queue',
    ];
    for (const tbl of tables) {
      await client.query(`SELECT 1 FROM ${tbl} LIMIT 1`);
    }
    console.log('[OK] Core notification tables are present');

    // 2) Verify seed count for notification_events (expected 19).
    const { rows: seedRows } = await client.query(
      'SELECT COUNT(*)::int AS count FROM notification_events'
    );
    const seedCount = seedRows[0].count;
    if (seedCount < 19) {
      throw new Error(`Seed events missing: expected 19, found ${seedCount}`);
    }
    console.log(`[OK] notification_events has ${seedCount} entries (>=19 expected)`);

    // 3) Validate views are selectable.
    const views = [
      'v_user_notification_settings',
      'v_recent_notifications',
      'v_notification_stats',
    ];
    for (const view of views) {
      await client.query(`SELECT * FROM ${view} LIMIT 1`);
    }
    console.log('[OK] Notification views respond to SELECT');

    // 4) Insert a temporary preference row to ensure writes work (rolled back).
    await client.query(
      `INSERT INTO notification_preferences (user_id, user_type, event_code, email_enabled, sms_enabled)
       VALUES ($1, $2, $3, $4, $5)`,
      [999999, 'student', 'MODULE_PUBLISHED', true, false]
    );
    console.log('[OK] Insert into notification_preferences succeeded (will be rolled back)');

    // Roll back so we leave no trace.
    await client.query('ROLLBACK');
    console.log('[INFO] Transaction rolled back; no persistent changes made');
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('[ERROR] Notification DB check failed:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
