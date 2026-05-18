const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const { Writable } = require('stream');
const { pipeline } = require('stream/promises');
const zlib = require('zlib');

const DEFAULT_INTERVAL_HOURS = 24;
const DEFAULT_RETENTION_DAYS = 30;
const DEFAULT_MAX_BACKUPS = 14;

const state = {
  enabled: false,
  running: false,
  lastRunAt: null,
  lastSuccessAt: null,
  lastVerificationAt: null,
  lastError: null,
  lastBackupFile: null,
  lastBackupEncrypted: false,
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
    .filter((name) => /^backup_\d{8}_\d{6}\.sql\.gz(?:\.enc)?$/.test(name))
    .map((name) => {
      const fullPath = path.join(backupDir, name);
      return { name, fullPath, stat: fs.statSync(fullPath) };
    })
    .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
}

function isBackupEncryptionEnabled() {
  return process.env.DB_BACKUP_ENCRYPTION_ENABLED !== 'false';
}

function getBackupEncryptionKey() {
  const secret = process.env.DB_BACKUP_ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error('DB_BACKUP_ENCRYPTION_KEY or JWT_SECRET must be configured before encrypted backups can run');
  }
  return crypto.createHash('sha256').update(secret).digest();
}

async function verifyGzipBackup(filePath) {
  const stat = fs.statSync(filePath);
  if (!stat.size) throw new Error('Backup verification failed: empty backup file');
  await pipeline(
    fs.createReadStream(filePath),
    zlib.createGunzip(),
    new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      }
    })
  );
}

async function encryptBackupFile(sourceFile, encryptedFile) {
  const key = getBackupEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const header = Buffer.concat([Buffer.from('SCBKP1'), iv]);

  await new Promise((resolve, reject) => {
    const input = fs.createReadStream(sourceFile);
    const output = fs.createWriteStream(encryptedFile, { mode: 0o600 });
    let settled = false;
    const done = (error) => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve();
    };

    output.write(header);
    input.on('error', done);
    cipher.on('error', done);
    output.on('error', done);
    output.on('finish', () => done());
    cipher.on('end', () => {
      try {
        output.end(cipher.getAuthTag());
      } catch (error) {
        done(error);
      }
    });
    input.pipe(cipher).pipe(output, { end: false });
  });
}

async function verifyEncryptedBackup(filePath) {
  const stat = fs.statSync(filePath);
  const headerLength = 18;
  const tagLength = 16;
  if (stat.size <= headerLength + tagLength) {
    throw new Error('Encrypted backup verification failed: file is too small');
  }

  const fd = fs.openSync(filePath, 'r');
  try {
    const header = Buffer.alloc(headerLength);
    fs.readSync(fd, header, 0, headerLength, 0);
    if (header.subarray(0, 6).toString('utf8') !== 'SCBKP1') {
      throw new Error('Encrypted backup verification failed: unsupported backup header');
    }
    const authTag = Buffer.alloc(tagLength);
    fs.readSync(fd, authTag, 0, tagLength, stat.size - tagLength);
    const iv = header.subarray(6);
    const decipher = crypto.createDecipheriv('aes-256-gcm', getBackupEncryptionKey(), iv);
    decipher.setAuthTag(authTag);
    await pipeline(
      fs.createReadStream(filePath, { start: headerLength, end: stat.size - tagLength - 1 }),
      decipher,
      new Writable({
        write(_chunk, _encoding, callback) {
          callback();
        }
      })
    );
  } finally {
    fs.closeSync(fd);
  }
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
  const encryptedFile = `${outputFile}.enc`;
  state.running = true;
  state.lastRunAt = new Date().toISOString();
  state.lastError = null;

  try {
    console.log(`[BACKUP] Starting ${reason} database backup`);
    await runPgDump(databaseUrl, outputFile);
    await verifyGzipBackup(outputFile);

    let finalFile = outputFile;
    let encrypted = false;
    if (isBackupEncryptionEnabled()) {
      await encryptBackupFile(outputFile, encryptedFile);
      await verifyEncryptedBackup(encryptedFile);
      fs.unlinkSync(outputFile);
      finalFile = encryptedFile;
      encrypted = true;
    }

    pruneBackups(backupDir);
    state.lastSuccessAt = new Date().toISOString();
    state.lastVerificationAt = state.lastSuccessAt;
    state.lastBackupFile = finalFile;
    state.lastBackupEncrypted = encrypted;
    console.log('[BACKUP] Database backup completed:', finalFile);
    return { success: true, file: finalFile, encrypted, verified: true };
  } catch (error) {
    state.lastError = error.message;
    try {
      if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);
      if (fs.existsSync(encryptedFile)) fs.unlinkSync(encryptedFile);
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
    lastVerificationAt: state.lastVerificationAt,
    lastError: state.lastError,
    lastBackupFile: state.lastBackupFile,
    lastBackupEncrypted: state.lastBackupEncrypted,
    backupDir: getBackupDir(),
    encryptionEnabled: isBackupEncryptionEnabled(),
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
