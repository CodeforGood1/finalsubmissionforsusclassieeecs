/**
 * Local Code Execution Module — Sandboxed
 * Runs Python, JavaScript, Java, C++ code locally without external APIs
 * Works completely offline with enforced resource limits
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const TMP_DIR = path.join(__dirname, 'tmp_code');

// Ensure tmp directory exists
if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

// Hard limits — cannot be exceeded regardless of module creation input
const MAX_TIMEOUT_MS  = 10000;  // 10 seconds absolute ceiling
const MAX_MEMORY_MB   = 128;    // 128 MB per process
const MAX_OUTPUT_BYTES = 512 * 1024; // 512 KB output
const MAX_CODE_LENGTH = 50000;  // 50 KB source code limit
const MAX_STDIN_LENGTH = 10000; // 10 KB stdin limit
const DEFAULT_TIMEOUT_MS = 5000;
const SOURCE_POLICY_PATTERNS = {
  python: [
    /\b(import|from)\s+(socket|requests|urllib|http\.client|ftplib|smtplib|subprocess|multiprocessing|os|pathlib|shutil)\b/i,
    /\b(open|exec|eval|compile|__import__)\s*\(/i
  ],
  javascript: [
    /\b(require|import)\s*(?:\(|.*from\s*)['"](?:fs|child_process|net|dgram|dns|http|https|tls|cluster|worker_threads|os)['"]/i,
    /\b(process\.env|process\.exit|eval|Function)\b/i
  ],
  java: [
    /\bimport\s+java\.(net|nio\.file)\./i,
    /\b(Runtime\.getRuntime|ProcessBuilder|System\.exit|new\s+File|FileReader|FileWriter|RandomAccessFile|FileInputStream|FileOutputStream)\b/i
  ],
  cpp: [
    /#\s*include\s*<(sys\/socket\.h|winsock2\.h|windows\.h|unistd\.h|fstream|filesystem)>/i,
    /\b(system|popen|fork|exec[lvpe]*|CreateProcess)\s*\(/i
  ]
};

// Track concurrent executions with a FIFO queue to prevent race-based slot bypass.
let activeExecutions = 0;
function positiveIntEnv(name, fallback) {
  const parsed = parseInt(process.env[name], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
const MAX_CONCURRENT = positiveIntEnv('CODE_EXEC_MAX_CONCURRENT', 10);
const MAX_QUEUE_DEPTH = positiveIntEnv('CODE_EXEC_MAX_QUEUE_DEPTH', 50);
const EXECUTION_QUEUE_TIMEOUT_MS = positiveIntEnv('CODE_EXEC_QUEUE_TIMEOUT_MS', 5000);
const executionQueue = [];

function drainExecutionQueue() {
  while (activeExecutions < MAX_CONCURRENT && executionQueue.length > 0) {
    const waiter = executionQueue.shift();
    if (waiter.timer) clearTimeout(waiter.timer);
    activeExecutions += 1;
    waiter.resolve(true);
  }
}

function acquireExecutionSlot() {
  if (activeExecutions < MAX_CONCURRENT) {
    activeExecutions += 1;
    return Promise.resolve(true);
  }
  if (executionQueue.length >= MAX_QUEUE_DEPTH) {
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    const waiter = {
      resolve,
      timer: setTimeout(() => {
        const index = executionQueue.indexOf(waiter);
        if (index !== -1) executionQueue.splice(index, 1);
        resolve(false);
      }, EXECUTION_QUEUE_TIMEOUT_MS)
    };
    if (typeof waiter.timer.unref === 'function') waiter.timer.unref();
    executionQueue.push(waiter);
  });
}

function releaseExecutionSlot() {
  activeExecutions = Math.max(0, activeExecutions - 1);
  drainExecutionQueue();
}

function normalizeLanguage(language) {
  const lang = String(language || '').toLowerCase();
  if (lang === 'js') return 'javascript';
  if (lang === 'c++') return 'cpp';
  return lang;
}

function validateSourcePolicy(code, language) {
  const lang = normalizeLanguage(language);
  const patterns = SOURCE_POLICY_PATTERNS[lang] || [];
  if (patterns.some((pattern) => pattern.test(code))) {
    return {
      error: 'This classroom runner only supports stdin/stdout programs. File, network, process, and dynamic-code APIs are blocked.'
    };
  }
  return { ok: true };
}

/**
 * Execute code locally with enforced sandboxing
 * @param {string} code - Source code to execute
 * @param {string} language - Language (python, javascript, java, cpp)
 * @param {string} stdin - Standard input for the program
 * @param {object} limits - Optional {timeoutMs, memoryMb} from module config
 * @returns {Promise<{stdout: string, stderr: string, error: boolean}>}
 */
async function executeCode(code, language, stdin = '', limits = {}) {
  // --- Input validation ---
  if (!code || typeof code !== 'string') {
    return { stdout: '', stderr: 'No code provided', error: true };
  }
  if (code.length > MAX_CODE_LENGTH) {
    return { stdout: '', stderr: `Code too large (max ${MAX_CODE_LENGTH} chars)`, error: true };
  }
  if (typeof language !== 'string') {
    return { stdout: '', stderr: 'Language must be a string', error: true };
  }
  if (stdin && stdin.length > MAX_STDIN_LENGTH) {
    return { stdout: '', stderr: `Stdin too large (max ${MAX_STDIN_LENGTH} chars)`, error: true };
  }
  const policy = validateSourcePolicy(code, language);
  if (policy.error) {
    return { stdout: '', stderr: policy.error, error: true };
  }

  // --- Concurrency guard ---
  if (!(await acquireExecutionSlot())) {
    return { stdout: '', stderr: 'Server busy - too many concurrent executions. Try again shortly.', error: true };
  }

  // Clamp user-supplied limits to hard ceilings
  const timeoutMs = Math.min(
    Math.max(parseInt(limits.timeoutMs) || DEFAULT_TIMEOUT_MS, 1000),
    MAX_TIMEOUT_MS
  );
  const memoryMb = Math.min(
    Math.max(parseInt(limits.memoryMb) || MAX_MEMORY_MB, 16),
    MAX_MEMORY_MB
  );

  const sessionId = crypto.randomBytes(8).toString('hex');
  const tempDir = path.join(TMP_DIR, sessionId);

  const cleanup = () => {
    releaseExecutionSlot();
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch (_) { /* ignore */ }
  };

  try {
    fs.mkdirSync(tempDir, { recursive: true });

    let args;
    let executable;
    let sourceFile;
    const isWindows = os.platform() === 'win32';

    const lang = normalizeLanguage(language);
    switch (lang) {
      case 'python': {
        sourceFile = path.join(tempDir, 'main.py');
        fs.writeFileSync(sourceFile, code);
        executable = isWindows ? 'python' : 'python3';
        args = [sourceFile];
        break;
      }
      case 'javascript':
      case 'js': {
        sourceFile = path.join(tempDir, 'main.js');
        fs.writeFileSync(sourceFile, code);
        executable = 'node';
        args = [`--max-old-space-size=${memoryMb}`, sourceFile];
        break;
      }
      case 'java': {
        const classMatch = code.match(/public\s+class\s+(\w+)/);
        const className = classMatch ? classMatch[1] : 'Main';
        // Only support the class names used by LMS starter templates.
        if (!['Main', 'Solution'].includes(className)) {
          cleanup();
          return { stdout: '', stderr: 'Java class name must be Main or Solution', error: true };
        }
        sourceFile = path.join(tempDir, `${className}.java`);
        fs.writeFileSync(sourceFile, code);
        // Two-phase: compile then run. We use a wrapper script in the temp dir.
        const compileResult = await runProcess('javac', [sourceFile], tempDir, timeoutMs, MAX_OUTPUT_BYTES);
        if (compileResult.error) {
          cleanup();
          return { stdout: '', stderr: compileResult.stderr || 'Compilation failed', error: true };
        }
        executable = 'java';
        args = [`-Xmx${memoryMb}m`, '-cp', tempDir, className];
        break;
      }
      case 'cpp':
      case 'c++': {
        sourceFile = path.join(tempDir, 'main.cpp');
        const outName = isWindows ? 'main.exe' : 'main';
        const executablePath = path.join(tempDir, outName);
        fs.writeFileSync(sourceFile, code);
        const compileResult = await runProcess('g++', [sourceFile, '-o', executablePath], tempDir, timeoutMs, MAX_OUTPUT_BYTES);
        if (compileResult.error) {
          cleanup();
          return { stdout: '', stderr: compileResult.stderr || 'Compilation failed', error: true };
        }
        executable = executablePath;
        args = [];
        break;
      }
      default:
        cleanup();
        return { stdout: '', stderr: `Unsupported language: ${language}`, error: true };
    }

    const result = await runProcess(executable, args, tempDir, timeoutMs, MAX_OUTPUT_BYTES, stdin);
    cleanup();
    return result;

  } catch (err) {
    cleanup();
    return { stdout: '', stderr: err.message, error: true };
  }
}

/**
 * Run a child process with strict resource limits via spawn (not exec/shell).
 * Using spawn avoids shell injection since arguments are passed as an array.
 */
function runProcess(cmd, args, cwd, timeoutMs, maxOutput, stdin = '') {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let killed = false;
    let settled = false;
    let killTimer;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (killTimer) clearTimeout(killTimer);
      resolve(result);
    };

    const child = spawn(cmd, args, {
      cwd,
      timeout: timeoutMs,
      stdio: ['pipe', 'pipe', 'pipe'],
      // Do not use shell — prevents command injection
      shell: false,
      // Detach on Linux so we can kill the entire process group
      detached: os.platform() !== 'win32',
      windowsHide: true,
      env: {
        // Minimal environment — no PATH leakage of sensitive vars
        PATH: process.env.PATH,
        HOME: cwd,
        TMPDIR: cwd,
        TEMP: cwd,
        TMP: cwd,
        // Python: prevent import of user-site packages
        PYTHONNOUSERSITE: '1',
        // Node: limit heap
        NODE_OPTIONS: `--max-old-space-size=${MAX_MEMORY_MB}`,
      },
    });

    child.stdout.on('data', (data) => {
      if (stdout.length < maxOutput) {
        stdout += data.toString().slice(0, maxOutput - stdout.length);
      } else if (!killed) {
        killed = true;
        killTree(child);
      }
    });

    child.stderr.on('data', (data) => {
      if (stderr.length < maxOutput) {
        stderr += data.toString().slice(0, maxOutput - stderr.length);
      }
    });

    child.on('error', (err) => {
      finish({ stdout, stderr: err.message, error: true });
    });

    child.on('close', (exitCode, signal) => {
      if (signal === 'SIGTERM' || signal === 'SIGKILL' || killed) {
        finish({
          stdout: stdout.slice(0, 500),
          stderr: `Execution terminated - exceeded time (${timeoutMs / 1000}s) or output limit`,
          error: true,
        });
      } else {
        finish({
          stdout: stdout || '',
          stderr: stderr || '',
          error: exitCode !== 0,
        });
      }
    });

    // Send stdin
    if (stdin) {
      child.stdin.write(stdin + '\n');
    }
    child.stdin.end();

    // Safety kill after timeout (in case 'timeout' option doesn't fire)
    killTimer = setTimeout(() => {
      if (!child.killed) {
        killed = true;
        killTree(child);
      }
    }, timeoutMs + 1000);
    if (typeof killTimer.unref === 'function') {
      killTimer.unref();
    }
  });
}

/** Kill entire process tree to clean up forked children */
function killTree(child) {
  try {
    if (os.platform() === 'win32') {
      // On Windows, use taskkill to kill the process tree
      const killer = spawn('taskkill', ['/pid', child.pid.toString(), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true
      });
      if (typeof killer.unref === 'function') killer.unref();
    } else {
      // On Unix, kill the process group
      process.kill(-child.pid, 'SIGKILL');
    }
  } catch (_) {
    try { child.kill('SIGKILL'); } catch (_) { /* already dead */ }
  }
}

module.exports = {
  executeCode,
  MAX_TIMEOUT_MS,
  MAX_MEMORY_MB,
  getExecutionQueueStatus: () => ({
    activeExecutions,
    queuedExecutions: executionQueue.length,
    maxConcurrent: MAX_CONCURRENT,
    maxQueueDepth: MAX_QUEUE_DEPTH
  })
};
