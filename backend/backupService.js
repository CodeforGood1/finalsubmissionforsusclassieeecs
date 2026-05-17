const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const DEFAULT_INTERVAL_HOURS = 24;
const DEFAULT_RETENTION_DAYS = 30;
const DEFAULT_MAX_BACKUPS = 14;

const state = {
  enabled: false,
  running: false,
  lastRunAt: null,
  lastSuccessAt: null,
  lastError: null,
  lastBackupFile: null,
  timer: null,
};

function asPositiveInt(value, fallback, min = 1) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= min ? parsed : fallback;
}

function getBackupDir() {
  return path.resolve(
    __dirname,
    process.env.DB_BACKUP_DIR || path.join('backups', 'database')
  );
}

function getTimestamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '_');
}

function getBackupFiles(backupDir) {
  if (!fs.existsSync(backupDir)) return [];
  return fs.readdirSync(backupDir)
    .filter((name) => /^backup_\d{8}_\d{6}\.sql\.gz$/.test(name))
    .map((name) => {
      const fullPath = path.join(backupDir, name);
      return { name, fullPath, stat: fs.statSync(fullPath) };
    })
    .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
}

function pruneBackups(backupDir) {
  const retentionDays = asPositiveInt(process.env.DB_BACKUP_RETENTION_DAYS, DEFAULT_RETENTION_DAYS);
  const maxBackups = asPositiveInt(process.env.DB_BACKUP_MAX_FILES, DEFAULT_MAX_BACKUPS);
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const files = getBackupFiles(backupDir);

  files.forEach((file, index) => {
    if (index >= maxBackups || file.stat.mtimeMs < cutoff) {
      try {
        fs.unlinkSync(file.fullPath);
      } catch (error) {
        console.warn('[BACKUP] Failed to remove old backup:', file.name, error.message);
      }
    }
  });
}

function runPgDump(databaseUrl, outputFile) {
  return new Promise((resolve, reject) => {
    const args = [
      `--dbname=${databaseUrl}`,
      '--clean',
      '--if-exists',
      '--create',
      '--no-owner',
      '--no-privileges',
    ];

    const dump = spawn('pg_dump', args, {
      windowsHide: true,
      shell: false,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const gzip = zlib.createGzip({ level: 9 });
    const output = fs.createWriteStream(outputFile, { mode: 0o600 });
    let stderr = '';

    dump.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    dump.on('error', (error) => {
      reject(new Error(`pg_dump failed to start: ${error.message}`));
    });

    output.on('error', reject);
    gzip.on('error', reject);

    output.on('finish', () => {
      resolve();
    });

    dump.stdout.pipe(gzip).pipe(output);

    dump.on('close', (code) => {
      if (code !== 0) {
        dump.stdout.unpipe(gzip);
        gzip.destroy();
        output.destroy();
        reject(new Error((stderr || `pg_dump exited with code ${code}`).trim()));
      }
    });
  });
}

async function runDatabaseBackup(reason = 'scheduled') {
  if (state.running) {
    return { success: false, skipped: true, error: 'Backup already running' };
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    const error = 'DATABASE_URL is not configured';
    state.lastError = error;
    return { success: false, error };
  }

  const backupDir = getBackupDir();
  fs.mkdirSync(backupDir, { recursive: true });

  const outputFile = path.join(backupDir, `backup_${getTimestamp()}.sql.gz`);
  state.running = true;
  state.lastRunAt = new Date().toISOString();
  state.lastError = null;

  try {
    console.log(`[BACKUP] Starting ${reason} database backup`);
    await runPgDump(databaseUrl, outputFile);
    pruneBackups(backupDir);
    state.lastSuccessAt = new Date().toISOString();
    state.lastBackupFile = outputFile;
    console.log('[BACKUP] Database backup completed:', outputFile);
    return { success: true, file: outputFile };
  } catch (error) {
    state.lastError = error.message;
    try {
      if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);
    } catch (_) {
      // Ignore cleanup failure.
    }
    console.error('[BACKUP] Database backup failed:', error.message);
    return { success: false, error: error.message };
  } finally {
    state.running = false;
  }
}

function initializeBackupService() {
  if (process.env.NODE_ENV === 'test') {
    return state;
  }

  state.enabled = process.env.DB_BACKUP_ENABLED !== 'false';
  if (!state.enabled) {
    console.log('[BACKUP] Automated database backups disabled');
    return state;
  }

  const intervalHours = asPositiveInt(process.env.DB_BACKUP_INTERVAL_HOURS, DEFAULT_INTERVAL_HOURS);
  const intervalMs = intervalHours * 60 * 60 * 1000;

  fs.mkdirSync(getBackupDir(), { recursive: true });
  state.timer = setInterval(() => {
    runDatabaseBackup('scheduled');
  }, intervalMs);

  if (typeof state.timer.unref === 'function') {
    state.timer.unref();
  }

  console.log(`[BACKUP] Automated database backups enabled every ${intervalHours} hour(s)`);

  if (process.env.DB_BACKUP_RUN_ON_START === 'true') {
    setTimeout(() => runDatabaseBackup('startup'), 30000).unref?.();
  }

  return state;
}

function getBackupStatus() {
  return {
    enabled: state.enabled,
    running: state.running,
    lastRunAt: state.lastRunAt,
    lastSuccessAt: state.lastSuccessAt,
    lastError: state.lastError,
    lastBackupFile: state.lastBackupFile,
    backupDir: getBackupDir(),
    intervalHours: asPositiveInt(process.env.DB_BACKUP_INTERVAL_HOURS, DEFAULT_INTERVAL_HOURS),
    retentionDays: asPositiveInt(process.env.DB_BACKUP_RETENTION_DAYS, DEFAULT_RETENTION_DAYS),
    maxBackups: asPositiveInt(process.env.DB_BACKUP_MAX_FILES, DEFAULT_MAX_BACKUPS),
  };
}

module.exports = {
  initializeBackupService,
  runDatabaseBackup,
  getBackupStatus,
};
