const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
require('./logger');
const express = require('express');
const http = require('http');
const fs = require('fs');
const crypto = require('crypto');
const { Pool } = require('pg');
const cors = require('cors');
const compression = require('compression');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const notificationService = require('./notificationService');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');

// Local services for on-premise deployment
const localStorageService = require('./localStorageService');
const localEmailService = require('./localEmailService');
const { executeCode, MAX_TIMEOUT_MS, MAX_MEMORY_MB, getExecutionQueueStatus } = require('./local-code-executor');
const backupService = require('./backupService');

// --- INPUT VALIDATION HELPERS ---
const VALID_ROLES = ['student', 'teacher'];
const VALID_LANGUAGES = ['python', 'javascript', 'js', 'java', 'cpp', 'c++'];
const MAX_STEPS = 50;
const MAX_QUESTIONS = 200;
const MAX_TEST_CASES = 20;
const MAX_CODE_SIZE = 50000;
const MAX_TEXT_CONTENT_SIZE = 20000;
const MAX_RESOURCE_URL_SIZE = 2048;
const MAX_SECTIONS_PER_ASSIGNMENT = 100;
const VALID_STEP_TYPES = new Set(['text', 'video', 'pdf', 'jitsi', 'mcq', 'coding', 'code']);
const REPORT_TARGET_TYPES = new Set(['chat_message', 'module']);
const REPORT_STATUSES = new Set(['open', 'reviewing', 'resolved', 'dismissed']);

function sanitizeRole(role) {
  const r = (role || 'student').toLowerCase().trim();
  return VALID_ROLES.includes(r) ? r : null;
}
function roleToTable(role) {
  const r = sanitizeRole(role);
  if (r === 'student') return 'students';
  if (r === 'teacher') return 'teachers';
  return null;
}
function isPositiveInt(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0;
}

const ADMIN_PASSWORD_HASH_FILE = path.resolve(__dirname, 'data', 'admin-password.hash');
const LEGACY_ADMIN_PASSWORD_FILE = path.resolve(__dirname, 'data', 'admin-password.txt');

function cleanText(value, maxLength = 255) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

function validatePasswordPolicy(password, options = {}) {
  const minLength = options.admin && process.env.NODE_ENV === 'production'
    ? Math.max(parseInt(process.env.ADMIN_PASSWORD_MIN_LENGTH || '12', 10), 12)
    : Math.max(parseInt(process.env.PASSWORD_MIN_LENGTH || '8', 10), 8);

  if (typeof password !== 'string') {
    return { error: 'Password is required' };
  }
  if (password.length > 72) {
    return { error: 'Password too long (max 72 characters)' };
  }
  if (password.length < minLength) {
    return { error: `Password must be at least ${minLength} characters` };
  }
  if (/\r|\n/.test(password)) {
    return { error: 'Password cannot contain line breaks' };
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return { error: 'Password must include at least one letter and one number' };
  }
  return { value: password };
}

function requireText(value, fieldName, maxLength) {
  const cleaned = cleanText(value, maxLength);
  if (cleaned.length < 1) {
    return { error: `${fieldName} is required` };
  }
  return { value: cleaned };
}

function parseMaybeJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        return Array.isArray(parsed) ? parsed : [];
      } catch (_) {
        return [];
      }
    }
    return [trimmed];
  }
  return [];
}

function normalizeSectionList(sections, section) {
  const source = parseMaybeJsonArray(sections);
  if (source.length === 0 && section) source.push(section);

  const normalized = [];
  const seen = new Set();
  for (const item of source) {
    if (typeof item !== 'string') continue;
    const cleaned = item.trim().replace(/\s+/g, ' ').slice(0, 60);
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      normalized.push(cleaned);
    }
  }

  if (normalized.length === 0) {
    return { error: 'At least one section is required' };
  }
  if (normalized.length > MAX_SECTIONS_PER_ASSIGNMENT) {
    return { error: `Too many sections (max ${MAX_SECTIONS_PER_ASSIGNMENT})` };
  }
  return { value: normalized };
}

function parseMaybeJson(value, fallback) {
  if (typeof value !== 'string') return value ?? fallback;
  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
}

function isFutureDateTime(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.getTime() >= Date.now() - 60000;
}

function validateModuleSteps(rawSteps) {
  const steps = parseMaybeJson(rawSteps, []);
  if (!Array.isArray(steps) || steps.length === 0) {
    return { error: 'At least one step is required' };
  }
  if (steps.length > MAX_STEPS) {
    return { error: `Too many steps (max ${MAX_STEPS})` };
  }

  const normalizedSteps = [];
  for (let index = 0; index < steps.length; index++) {
    const step = steps[index] || {};
    const type = cleanText(step.type, 30).toLowerCase();
    const fallbackHeader = cleanText(
      step.title || step.name || (typeof step.data === 'string' ? step.data : '') || `${type || 'Module'} step`,
      100
    );
    const header = cleanText(step.header, 100) || fallbackHeader;

    if (!VALID_STEP_TYPES.has(type)) {
      return { error: `Step ${index + 1} has an unsupported type` };
    }
    if (!header) {
      return { error: `Step ${index + 1} needs a title` };
    }

    if (type === 'mcq') {
      const data = step.data || {};
      const fields = ['question', 'a', 'b', 'c', 'd'];
      for (const field of fields) {
        if (!cleanText(data[field], field === 'question' ? 500 : 200)) {
          return { error: `Step ${index + 1} MCQ ${field} is required` };
        }
      }
      if (!['A', 'B', 'C', 'D'].includes(cleanText(data.correct, 1).toUpperCase())) {
        return { error: `Step ${index + 1} MCQ correct answer must be A, B, C, or D` };
      }
      normalizedSteps.push({
        ...step,
        type,
        header,
        data: {
          question: cleanText(data.question, 500),
          a: cleanText(data.a, 200),
          b: cleanText(data.b, 200),
          c: cleanText(data.c, 200),
          d: cleanText(data.d, 200),
          correct: cleanText(data.correct, 1).toUpperCase()
        }
      });
      continue;
    }

    if (type === 'jitsi') {
      const data = step.data || {};
      const roomName = cleanText(data.roomName, 50).replace(/[^a-zA-Z0-9-]/g, '').toLowerCase();
      if (!roomName) {
        return { error: `Step ${index + 1} live session room name is required` };
      }
      if (!data.scheduledTime || !isFutureDateTime(data.scheduledTime)) {
        return { error: `Step ${index + 1} live session must be scheduled for now or a future time` };
      }
      const duration = Math.min(180, Math.max(15, parseInt(data.duration, 10) || 60));
      normalizedSteps.push({
        ...step,
        type,
        header,
        data: {
          ...data,
          roomName,
          scheduledTime: data.scheduledTime,
          duration
        }
      });
      continue;
    }

    if (type === 'coding') {
      const data = step.data || {};
      if (!cleanText(data.description, 2000)) {
        return { error: `Step ${index + 1} coding problem description is required` };
      }
      const testCases = Array.isArray(data.testCases) ? data.testCases : [];
      if (testCases.length > MAX_TEST_CASES) {
        return { error: `Step ${index + 1} has too many test cases (max ${MAX_TEST_CASES})` };
      }
      normalizedSteps.push({
        ...step,
        type,
        header,
        data: {
          ...data,
          description: cleanText(data.description, 2000),
          timeLimit: Math.min(MAX_TIMEOUT_MS, Math.max(1000, parseInt(data.timeLimit, 10) || 5000)),
          memoryLimit: Math.min(MAX_MEMORY_MB, Math.max(16, parseInt(data.memoryLimit, 10) || 64)),
          testCases
        }
      });
      continue;
    }

    if (type === 'text') {
      const data = String(step.data || '');
      if (data.length > MAX_TEXT_CONTENT_SIZE) {
        return { error: `Step ${index + 1} text content is too large (max ${MAX_TEXT_CONTENT_SIZE} characters)` };
      }
      normalizedSteps.push({ ...step, type, header, data: cleanText(data, MAX_TEXT_CONTENT_SIZE) });
      continue;
    }

    if (type === 'video' || type === 'pdf') {
      const data = cleanText(step.data, MAX_RESOURCE_URL_SIZE);
      if (!data) {
        return { error: `Step ${index + 1} ${type.toUpperCase()} URL is required` };
      }
      if (!/^https?:\/\//i.test(data) && !data.startsWith('/uploads/')) {
        return { error: `Step ${index + 1} ${type.toUpperCase()} URL must be an http(s) URL or uploaded file path` };
      }
      normalizedSteps.push({ ...step, type, header, data });
      continue;
    }

    if (type === 'code') {
      const data = String(step.data || '');
      if (data.length > MAX_CODE_SIZE) {
        return { error: `Step ${index + 1} code sample is too large (max ${MAX_CODE_SIZE} characters)` };
      }
      normalizedSteps.push({ ...step, type, header, data });
      continue;
    }

    normalizedSteps.push({ ...step, type, header });
  }

  return { value: normalizedSteps };
}

function validateMcqQuestions(rawQuestions) {
  const questions = parseMaybeJson(rawQuestions, []);
  if (!Array.isArray(questions) || questions.length === 0) {
    return { error: 'At least one question is required' };
  }
  if (questions.length > MAX_QUESTIONS) {
    return { error: `Too many questions (max ${MAX_QUESTIONS})` };
  }

  const normalized = questions.map((question, index) => {
    const clean = {
      question: cleanText(question?.question, 500),
      a: cleanText(question?.a, 200),
      b: cleanText(question?.b, 200),
      c: cleanText(question?.c, 200),
      d: cleanText(question?.d, 200),
      correct: cleanText(question?.correct, 1).toUpperCase()
    };
    const missingField = ['question', 'a', 'b', 'c', 'd'].find((field) => !clean[field]);
    if (missingField) {
      throw new Error(`Question ${index + 1} ${missingField} is required`);
    }
    if (!['A', 'B', 'C', 'D'].includes(clean.correct)) {
      throw new Error(`Question ${index + 1} correct answer must be A, B, C, or D`);
    }
    return clean;
  });

  return { value: normalized };
}

// Initialize local storage directories
localStorageService.ensureUploadDirs();

// Initialize local email service
localEmailService.initializeEmailService();

// Get upload middleware
const { upload, createUploader } = localStorageService;
const bulkUpload = createUploader({ maxFiles: 200 });

const app = express();
const isDev = process.env.NODE_ENV !== 'production';
const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const AUTH_COOKIE_NAME = 'susclass_auth';
const CSRF_COOKIE_NAME = 'susclass_csrf';
const COOKIE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const AUTH_LOCKOUT_MAX_FAILURES = Math.max(parseInt(process.env.AUTH_LOCKOUT_MAX_FAILURES || '5', 10), 3);
const AUTH_LOCKOUT_WINDOW_MS = Math.max(parseInt(process.env.AUTH_LOCKOUT_WINDOW_MS || `${15 * 60 * 1000}`, 10), 60 * 1000);
const AUTH_LOCKOUT_DURATION_MS = Math.max(parseInt(process.env.AUTH_LOCKOUT_DURATION_MS || `${15 * 60 * 1000}`, 10), 60 * 1000);
const revokedSessionFallback = new Map();
const authFailureFallback = new Map();

function buildAllowedStateChangeOrigins() {
  const origins = new Set([
    'http://localhost',
    'http://127.0.0.1',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:5000',
    'http://127.0.0.1:5000',
  ]);
  [process.env.FRONTEND_URL, process.env.VITE_API_URL].filter(Boolean).forEach((origin) => {
    try {
      origins.add(new URL(origin).origin);
    } catch (_) {
      // Ignore malformed optional env values.
    }
  });
  return origins;
}

const allowedStateChangeOrigins = buildAllowedStateChangeOrigins();

function parseCookieHeader(header) {
  if (!header) return {};
  return header.split(';').reduce((cookies, item) => {
    const index = item.indexOf('=');
    if (index === -1) return cookies;
    const key = item.slice(0, index).trim();
    const value = item.slice(index + 1).trim();
    try {
      cookies[key] = decodeURIComponent(value);
    } catch (_) {
      cookies[key] = value;
    }
    return cookies;
  }, {});
}

function parseCookies(req) {
  return parseCookieHeader(req.headers.cookie);
}

function secureCookieOptions(httpOnly = true) {
  return {
    httpOnly,
    secure: !isDev,
    sameSite: 'strict',
    path: '/',
    maxAge: COOKIE_MAX_AGE_MS,
  };
}

function setCsrfCookie(res) {
  const token = crypto.randomBytes(32).toString('hex');
  res.cookie(CSRF_COOKIE_NAME, token, secureCookieOptions(false));
  return token;
}

function setAuthCookies(res, token) {
  res.cookie(AUTH_COOKIE_NAME, token, secureCookieOptions(true));
  return setCsrfCookie(res);
}

function clearAuthCookies(res) {
  const clearOptions = { path: '/', secure: !isDev, sameSite: 'strict' };
  res.clearCookie(AUTH_COOKIE_NAME, clearOptions);
  res.clearCookie(CSRF_COOKIE_NAME, clearOptions);
}

function getBearerToken(req) {
  const authHeader = req.headers.authorization || '';
  const [scheme, rawToken] = authHeader.split(/\s+/);
  const headerToken = /^Bearer$/i.test(scheme) && !['null', 'undefined', 'cookie-session', ''].includes(rawToken) ? rawToken : '';
  if (headerToken) return headerToken;
  return parseCookies(req)[AUTH_COOKIE_NAME] || '';
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  return aBuf.length === bBuf.length && crypto.timingSafeEqual(aBuf, bBuf);
}

function issueAuthToken(payload, expiresIn = '24h') {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn,
    jwtid: crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex')
  });
}

function hashSessionToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function tokenExpiryDate(token) {
  const decoded = jwt.decode(token);
  if (decoded?.exp) return new Date(decoded.exp * 1000);
  return new Date(Date.now() + COOKIE_MAX_AGE_MS);
}

async function cleanupRevokedSessions() {
  try {
    await pool.query('DELETE FROM revoked_sessions WHERE expires_at <= $1', [new Date()]);
  } catch (error) {
    for (const [hash, expiresAt] of revokedSessionFallback.entries()) {
      if (expiresAt <= Date.now()) revokedSessionFallback.delete(hash);
    }
  }
}

async function isSessionTokenRevoked(token) {
  if (!token) return false;
  const tokenHash = hashSessionToken(token);
  const fallbackExpiry = revokedSessionFallback.get(tokenHash);
  if (fallbackExpiry) {
    if (fallbackExpiry > Date.now()) return true;
    revokedSessionFallback.delete(tokenHash);
  }

  try {
    const result = await pool.query(
      'SELECT 1 FROM revoked_sessions WHERE token_hash = $1 AND expires_at > $2 LIMIT 1',
      [tokenHash, new Date()]
    );
    return result.rows.length > 0;
  } catch (error) {
    console.error('[SESSION] Revocation lookup failed:', error.message);
    return false;
  }
}

async function revokeSessionToken(token) {
  if (!token) return;
  const tokenHash = hashSessionToken(token);
  const expiresAt = tokenExpiryDate(token);
  if (expiresAt <= new Date()) return;

  revokedSessionFallback.set(tokenHash, expiresAt.getTime());
  try {
    await pool.query(
      `INSERT INTO revoked_sessions (token_hash, expires_at)
       VALUES ($1, $2)
       ON CONFLICT (token_hash) DO NOTHING`,
      [tokenHash, expiresAt]
    );
  } catch (error) {
    console.error('[SESSION] Failed to persist revoked session:', error.message);
  }
}

function authFailureKey(identifier, role) {
  return `${cleanText(role, 50).toLowerCase()}:${cleanText(identifier, 150).toLowerCase()}`;
}

function parseLockoutRow(row) {
  if (!row) return null;
  const lastFailedAt = row.last_failed_at ? new Date(row.last_failed_at).getTime() : 0;
  const lockedUntil = row.locked_until ? new Date(row.locked_until).getTime() : 0;
  return {
    failureCount: parseInt(row.failure_count || '0', 10) || 0,
    lastFailedAt,
    lockedUntil
  };
}

async function getAuthLockout(identifier, role) {
  const key = authFailureKey(identifier, role);
  if (!key.includes(':') || key.endsWith(':')) return { locked: false };
  const fallback = authFailureFallback.get(key);
  if (fallback?.lockedUntil > Date.now()) {
    return { locked: true, lockedUntil: new Date(fallback.lockedUntil) };
  }

  try {
    const result = await pool.query(
      'SELECT failure_count, locked_until, last_failed_at FROM auth_failures WHERE identifier = $1 AND role = $2',
      [cleanText(identifier, 150).toLowerCase(), cleanText(role, 50).toLowerCase()]
    );
    const state = parseLockoutRow(result.rows[0]);
    if (!state) return { locked: false };
    if (state.lockedUntil > Date.now()) {
      return { locked: true, lockedUntil: new Date(state.lockedUntil) };
    }
    if (state.lastFailedAt && Date.now() - state.lastFailedAt > AUTH_LOCKOUT_WINDOW_MS) {
      await clearAuthFailures(identifier, role);
    }
  } catch (error) {
    console.error('[AUTH] Lockout lookup failed:', error.message);
  }
  return { locked: false };
}

async function recordAuthFailure(identifier, role) {
  const normalizedIdentifier = cleanText(identifier, 150).toLowerCase();
  const normalizedRole = cleanText(role, 50).toLowerCase();
  if (!normalizedIdentifier || !normalizedRole) return;

  const key = authFailureKey(normalizedIdentifier, normalizedRole);
  const now = Date.now();
  const nowDate = new Date(now);
  let state = authFailureFallback.get(key) || { failureCount: 0, lastFailedAt: 0, lockedUntil: 0 };
  if (now - state.lastFailedAt > AUTH_LOCKOUT_WINDOW_MS) {
    state = { failureCount: 0, lastFailedAt: 0, lockedUntil: 0 };
  }

  const failureCount = state.failureCount + 1;
  const lockedUntil = failureCount >= AUTH_LOCKOUT_MAX_FAILURES
    ? now + AUTH_LOCKOUT_DURATION_MS
    : 0;
  authFailureFallback.set(key, { failureCount, lastFailedAt: now, lockedUntil });

  try {
    const existing = await pool.query(
      'SELECT failure_count, last_failed_at FROM auth_failures WHERE identifier = $1 AND role = $2',
      [normalizedIdentifier, normalizedRole]
    );
    const current = parseLockoutRow(existing.rows[0]);
    const dbFailureCount = current && now - current.lastFailedAt <= AUTH_LOCKOUT_WINDOW_MS
      ? current.failureCount + 1
      : 1;
    const dbLockedUntil = dbFailureCount >= AUTH_LOCKOUT_MAX_FAILURES
      ? new Date(now + AUTH_LOCKOUT_DURATION_MS)
      : null;

    if (existing.rows.length > 0) {
      await pool.query(
        `UPDATE auth_failures
         SET failure_count = $1, locked_until = $2, last_failed_at = $5
         WHERE identifier = $3 AND role = $4`,
        [dbFailureCount, dbLockedUntil, normalizedIdentifier, normalizedRole, nowDate]
      );
    } else {
      await pool.query(
        `INSERT INTO auth_failures (identifier, role, failure_count, locked_until, last_failed_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [normalizedIdentifier, normalizedRole, dbFailureCount, dbLockedUntil, nowDate]
      );
    }
  } catch (error) {
    console.error('[AUTH] Failed to record login failure:', error.message);
  }
}

async function clearAuthFailures(identifier, role) {
  const normalizedIdentifier = cleanText(identifier, 150).toLowerCase();
  const normalizedRole = cleanText(role, 50).toLowerCase();
  if (!normalizedIdentifier || !normalizedRole) return;
  authFailureFallback.delete(authFailureKey(normalizedIdentifier, normalizedRole));
  try {
    await pool.query(
      'DELETE FROM auth_failures WHERE identifier = $1 AND role = $2',
      [normalizedIdentifier, normalizedRole]
    );
  } catch (error) {
    console.error('[AUTH] Failed to clear login failures:', error.message);
  }
}

function lockoutResponse(res, lockedUntil) {
  const seconds = Math.max(1, Math.ceil((lockedUntil.getTime() - Date.now()) / 1000));
  res.setHeader('Retry-After', String(seconds));
  return res.status(423).json({
    error: `Account temporarily locked after repeated failed attempts. Try again in ${Math.ceil(seconds / 60)} minute(s).`
  });
}

function isCsrfExemptPath(pathname) {
  return [
    '/api/csrf-token',
    '/api/logout',
    '/api/login',
    '/api/admin/login',
    '/api/admin/change-password',
    '/api/verify-totp',
    '/api/password-reset/request',
    '/api/password-reset/confirm',
  ].includes(pathname);
}

// Trust proxy for rate limiting behind nginx/docker
app.set('trust proxy', 1);

app.use((req, res, next) => {
  if (
    !isDev &&
    process.env.FORCE_HTTPS !== 'false' &&
    req.headers['x-forwarded-proto'] &&
    req.headers['x-forwarded-proto'] !== 'https'
  ) {
    return res.redirect(308, `https://${req.headers.host}${req.originalUrl}`);
  }
  next();
});

app.use((req, res, next) => {
  if (!STATE_CHANGING_METHODS.has(req.method)) return next();
  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('application/json')) return next();

  const contentLength = parseInt(req.headers['content-length'] || '0', 10);
  if (!contentLength) return next();

  const routeLimits = [
    { pattern: /^\/api\/student\/execute-code$/, limit: 128 * 1024 },
    { pattern: /^\/api\/student\/submit-code$/, limit: 256 * 1024 },
    { pattern: /^\/api\/(login|verify-totp|password-reset\/request|password-reset\/confirm|admin\/login|admin\/change-password)$/, limit: 32 * 1024 },
    { pattern: /^\/api\/reports(?:\/|$)/, limit: 64 * 1024 },
    { pattern: /^\/api\/teacher\/(upload-module|test\/create)$/, limit: 1024 * 1024 },
    { pattern: /^\/api\/teacher\/(module|test)\//, limit: 1024 * 1024 },
  ];
  const matched = routeLimits.find((item) => item.pattern.test(req.path));
  if (matched && contentLength > matched.limit) {
    return res.status(413).json({ error: `Request body too large for this endpoint (max ${matched.limit} bytes)` });
  }
  next();
});

app.use(express.json({ limit: '10mb' }));
app.use(cors({
  credentials: true,
  origin(origin, callback) {
    if (!origin || isDev) return callback(null, true);
    try {
      return callback(null, allowedStateChangeOrigins.has(new URL(origin).origin));
    } catch (_) {
      return callback(null, false);
    }
  }
}));

// Security Middleware
app.use(compression());

// Security headers with Helmet
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: isDev ? ["'self'", "'unsafe-inline'"] : ["'self'"],
      scriptSrc: isDev ? ["'self'", "'unsafe-inline'", "'unsafe-eval'"] : ["'self'"],
      imgSrc: ["'self'", "data:", "blob:"],
      mediaSrc: ["'self'", "blob:"],
      connectSrc: ["'self'", "http://localhost:*", "ws://localhost:*", "http://*:5000", "ws://*:5000"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameSrc: ["'self'", "https://www.youtube.com", "https://youtube.com", "https://localhost:8443", "https://localhost:*"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: null,
    },
  },
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  hsts: !isDev,
}));

app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=(), payment=()');
  next();
});

// Rate limiting - general API protection (MUCH higher limits for on-premise)
const generalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute window
  max: isDev ? 10000 : 500, // 500 requests per minute per IP (very high for on-premise)
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting in development
    if (isDev) return true;
    // Skip rate limiting for admin endpoints (admin needs to create many users)
    if (req.path.includes('/admin/')) return true;
    // Skip health checks
    if (req.path === '/api/health') return true;
    return false;
  },
  // Use IP address as key, falling back to socket address
  keyGenerator: (req) => {
    return req.ip || req.socket?.remoteAddress || 'unknown';
  }
});

// Stricter rate limiting for authentication endpoints (per user email, not IP)
const authLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute window
  max: isDev ? 1000 : 20, // 20 login attempts per minute per email (reasonable)
  message: { error: 'Too many login attempts. Please wait 1 minute before trying again.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => isDev, // Skip in development
  // Key by email (if provided) to allow different users from same IP
  keyGenerator: (req) => {
    const email = req.body?.email || req.body?.identifier || '';
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    // If email provided, use email+IP combo. Otherwise just IP.
    return email ? `${email.toLowerCase()}:${ip}` : ip;
  }
});

const codeExecutionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: isDev ? 120 : 20,
  message: { error: 'Too many code execution requests. Please wait a minute and try again.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => isDev,
  keyGenerator: (req) => `${req.user?.role || 'anon'}:${req.user?.id || req.ip || 'unknown'}`
});

app.use('/api/', (req, res, next) => {
  if (isDev || !STATE_CHANGING_METHODS.has(req.method)) {
    return next();
  }
  const origin = req.get('origin');
  if (!origin) return next();

  try {
    const normalizedOrigin = new URL(origin).origin;
    if (allowedStateChangeOrigins.has(normalizedOrigin)) return next();
  } catch (_) {
    // Fall through to rejection.
  }

  return res.status(403).json({ error: 'Cross-site request blocked' });
});

app.use('/api/', (req, res, next) => {
  const pathname = req.originalUrl.split('?')[0];
  if (!STATE_CHANGING_METHODS.has(req.method) || isCsrfExemptPath(pathname)) {
    return next();
  }

  const cookies = parseCookies(req);
  if (!cookies[AUTH_COOKIE_NAME]) {
    return next();
  }

  const csrfFromCookie = cookies[CSRF_COOKIE_NAME];
  const csrfFromHeader = req.get('x-csrf-token');
  if (!safeEqual(csrfFromCookie, csrfFromHeader)) {
    return res.status(403).json({ error: 'CSRF validation failed' });
  }

  return next();
});

// Apply general rate limiting to all API routes
app.use('/api/', generalLimiter);

// Apply stricter rate limiting to auth routes
app.use('/api/login', authLimiter);
app.use('/api/register', authLimiter);
app.use('/api/verify-totp', authLimiter);
app.use('/api/forgot-password', authLimiter);

// Serve static files from /public in production
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================
// PRODUCTION MONITORING & HEALTH ENDPOINTS
// ============================================================

// Track request metrics for Prometheus
const metrics = {
  requests: { total: 0, success: 0, errors: 0 },
  latency: { sum: 0, count: 0 },
  startTime: Date.now(),
  activeConnections: 0
};

// Middleware to track metrics
app.use((req, res, next) => {
  if (req.path === '/api/health' || req.path === '/api/metrics') {
    return next();
  }
  const start = Date.now();
  metrics.requests.total++;
  metrics.activeConnections++;
  
  res.on('finish', () => {
    metrics.activeConnections--;
    metrics.latency.sum += Date.now() - start;
    metrics.latency.count++;
    if (res.statusCode >= 400) {
      metrics.requests.errors++;
    } else {
      metrics.requests.success++;
    }
  });
  next();
});

// Simple health check endpoint for Docker/Kubernetes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/docs/openapi.json', (req, res) => {
  res.sendFile(path.join(__dirname, 'openapi.json'));
});

// Detailed health check with database connectivity
app.get('/api/health/detailed', async (req, res) => {
  const healthStatus = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - metrics.startTime) / 1000),
    services: {}
  };
  
  try {
    // Check database
    const dbStart = Date.now();
    await pool.query('SELECT 1');
    healthStatus.services.database = {
      status: 'healthy',
      latencyMs: Date.now() - dbStart
    };
  } catch (err) {
    healthStatus.status = 'degraded';
    healthStatus.services.database = { status: 'unhealthy', error: err.message };
  }
  
  // Check cache
  healthStatus.services.cache = {
    status: 'healthy',
    entries: cache.data.size
  };
  
  res.status(healthStatus.status === 'ok' ? 200 : 503).json(healthStatus);
});

// Prometheus-compatible metrics endpoint
app.get('/api/metrics', (req, res) => {
  const uptime = Math.floor((Date.now() - metrics.startTime) / 1000);
  const avgLatency = metrics.latency.count > 0 
    ? Math.round(metrics.latency.sum / metrics.latency.count) 
    : 0;
  
  const prometheusMetrics = `
# HELP lms_uptime_seconds Server uptime in seconds
# TYPE lms_uptime_seconds counter
lms_uptime_seconds ${uptime}

# HELP lms_http_requests_total Total HTTP requests
# TYPE lms_http_requests_total counter
lms_http_requests_total{status="success"} ${metrics.requests.success}
lms_http_requests_total{status="error"} ${metrics.requests.errors}

# HELP lms_http_request_duration_avg Average request duration in ms
# TYPE lms_http_request_duration_avg gauge
lms_http_request_duration_avg ${avgLatency}

# HELP lms_active_connections Current active connections
# TYPE lms_active_connections gauge
lms_active_connections ${metrics.activeConnections}

# HELP lms_cache_entries Current cache entries
# TYPE lms_cache_entries gauge
lms_cache_entries ${cache.data.size}

# HELP lms_cache_hits_total Cache hits
# TYPE lms_cache_hits_total counter
lms_cache_hits_total ${cache.stats.hits}

# HELP lms_cache_misses_total Cache misses
# TYPE lms_cache_misses_total counter
lms_cache_misses_total ${cache.stats.misses}

# HELP lms_cache_evictions_total Cache evictions
# TYPE lms_cache_evictions_total counter
lms_cache_evictions_total ${cache.stats.evictions}

# HELP lms_code_execution_active Active code executions
# TYPE lms_code_execution_active gauge
lms_code_execution_active ${getExecutionQueueStatus().activeExecutions}

# HELP lms_code_execution_queued Queued code executions
# TYPE lms_code_execution_queued gauge
lms_code_execution_queued ${getExecutionQueueStatus().queuedExecutions}

# HELP lms_db_pool_total Database pool total connections
# TYPE lms_db_pool_total gauge
lms_db_pool_total ${pool.totalCount || 0}

# HELP lms_db_pool_idle Database pool idle connections
# TYPE lms_db_pool_idle gauge
lms_db_pool_idle ${pool.idleCount || 0}

# HELP lms_db_pool_waiting Database pool waiting clients
# TYPE lms_db_pool_waiting gauge
lms_db_pool_waiting ${pool.waitingCount || 0}
`.trim();

  res.set('Content-Type', 'text/plain; charset=utf-8');
  res.send(prometheusMetrics);
});

// --- CONFIGURATION ---
const SALT_ROUNDS = 10;
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('[FATAL] JWT_SECRET environment variable is not set. Exiting.');
  process.exit(1);
}
if (
  process.env.NODE_ENV === 'production' &&
  (JWT_SECRET.length < 32 || /test|change|secret|default/i.test(JWT_SECRET))
) {
  console.error('[FATAL] JWT_SECRET must be a strong production secret (32+ chars, not a default/test value).');
  process.exit(1);
}

// --- DATABASE CONNECTION (LOCAL POSTGRESQL) ---
// On-premise: Connect to local PostgreSQL server with optimized pool settings
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Pool optimization for on-premise deployment (1000+ concurrent users)
  max: 50,                         // Maximum connections in pool
  idleTimeoutMillis: 30000,        // Close idle connections after 30s
  connectionTimeoutMillis: 10000,  // Connection timeout
  // SSL only if explicitly enabled for on-premise deployment
  ...(process.env.DB_SSL === 'true' ? { ssl: { rejectUnauthorized: false } } : {})
});

async function teacherCanAccessStudent(teacherId, studentId) {
  if (!isPositiveInt(teacherId) || !isPositiveInt(studentId)) return false;
  const result = await pool.query(
    `SELECT EXISTS (
      SELECT 1
      FROM teachers t
      JOIN students s ON s.id = $2
      WHERE t.id = $1 AND (
        EXISTS (
          SELECT 1 FROM teacher_student_allocations tsa
          WHERE tsa.teacher_id = t.id AND tsa.student_id = s.id
        )
        OR EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(
            CASE WHEN jsonb_typeof(COALESCE(t.allocated_sections, '[]'::jsonb)) = 'array'
              THEN COALESCE(t.allocated_sections, '[]'::jsonb)
              ELSE '[]'::jsonb
            END
          ) AS sec
          WHERE UPPER(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(sec, '[-_]', ' ', 'g'), ' +', ' ', 'g'))) =
            UPPER(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(s.class_dept || ' ' || s.section, '[-_]', ' ', 'g'), ' +', ' ', 'g')))
        )
        OR EXISTS (
          SELECT 1 FROM modules m
          WHERE m.teacher_id = t.id AND (
            UPPER(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(m.section, '[-_]', ' ', 'g'), ' +', ' ', 'g'))) =
              UPPER(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(s.class_dept || ' ' || s.section, '[-_]', ' ', 'g'), ' +', ' ', 'g')))
            OR EXISTS (
              SELECT 1 FROM jsonb_array_elements_text(COALESCE(m.sections, '[]'::jsonb)) AS module_sec
              WHERE UPPER(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(module_sec, '[-_]', ' ', 'g'), ' +', ' ', 'g'))) =
                UPPER(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(s.class_dept || ' ' || s.section, '[-_]', ' ', 'g'), ' +', ' ', 'g')))
            )
          )
        )
        OR EXISTS (
          SELECT 1 FROM mcq_tests test
          WHERE test.teacher_id = t.id AND (
            UPPER(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(test.section, '[-_]', ' ', 'g'), ' +', ' ', 'g'))) =
              UPPER(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(s.class_dept || ' ' || s.section, '[-_]', ' ', 'g'), ' +', ' ', 'g')))
            OR EXISTS (
              SELECT 1 FROM jsonb_array_elements_text(COALESCE(test.sections, '[]'::jsonb)) AS test_sec
              WHERE UPPER(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(test_sec, '[-_]', ' ', 'g'), ' +', ' ', 'g'))) =
                UPPER(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(s.class_dept || ' ' || s.section, '[-_]', ' ', 'g'), ' +', ' ', 'g')))
            )
          )
        )
      )
    ) AS can_access`,
    [teacherId, studentId]
  );
  return Boolean(result.rows[0]?.can_access);
}

async function getStudentAccessibleModule(studentId, moduleId) {
  if (!isPositiveInt(studentId) || !isPositiveInt(moduleId)) return null;
  const result = await pool.query(
    `SELECT m.id, m.topic_title, m.teacher_id, m.teacher_name, m.subject, m.section
     FROM modules m
     JOIN students s ON s.id = $2
     WHERE m.id = $1 AND (
       UPPER(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(m.section, '[-_]', ' ', 'g'), ' +', ' ', 'g'))) =
         UPPER(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(s.class_dept || ' ' || s.section, '[-_]', ' ', 'g'), ' +', ' ', 'g')))
       OR m.section = 'ALL'
       OR EXISTS (
         SELECT 1 FROM jsonb_array_elements_text(COALESCE(m.sections, '[]'::jsonb)) AS sec
         WHERE UPPER(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(sec, '[-_]', ' ', 'g'), ' +', ' ', 'g'))) =
           UPPER(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(s.class_dept || ' ' || s.section, '[-_]', ' ', 'g'), ' +', ' ', 'g')))
       )
     )
     LIMIT 1`,
    [moduleId, studentId]
  );
  return result.rows[0] || null;
}

async function readAdminHashFromDisk() {
  try {
    if (fs.existsSync(ADMIN_PASSWORD_HASH_FILE)) {
      return fs.readFileSync(ADMIN_PASSWORD_HASH_FILE, 'utf8').trim();
    }
  } catch (error) {
    console.error('[ADMIN] Failed to read admin hash file:', error.message);
  }
  return '';
}

async function writeAdminHashToDisk(passwordHash) {
  try {
    fs.mkdirSync(path.dirname(ADMIN_PASSWORD_HASH_FILE), { recursive: true });
    fs.writeFileSync(ADMIN_PASSWORD_HASH_FILE, `${passwordHash}\n`, { mode: 0o600 });
  } catch (error) {
    console.error('[ADMIN] Failed to persist admin password hash:', error.message);
  }
}

async function getBootstrapAdminHash() {
  if (process.env.NODE_ENV === 'test' && process.env.ADMIN_PASSWORD) {
    return bcrypt.hash(process.env.ADMIN_PASSWORD, SALT_ROUNDS);
  }

  const diskHash = await readAdminHashFromDisk();
  if (diskHash) return diskHash;
  if (process.env.ADMIN_PASSWORD_HASH) return process.env.ADMIN_PASSWORD_HASH.trim();

  let bootstrapPassword = process.env.ADMIN_PASSWORD;
  if (!bootstrapPassword && fs.existsSync(LEGACY_ADMIN_PASSWORD_FILE)) {
    try {
      bootstrapPassword = fs.readFileSync(LEGACY_ADMIN_PASSWORD_FILE, 'utf8').replace(/\r?\n+$/, '');
      console.warn('[ADMIN] Migrating legacy plaintext admin password file to hashed storage.');
    } catch (error) {
      console.error('[ADMIN] Failed to read legacy admin password file:', error.message);
    }
  }

  if (!bootstrapPassword) return '';

  if (process.env.NODE_ENV === 'production' && bootstrapPassword.length < 12) {
    console.warn('[ADMIN] ADMIN_PASSWORD should be at least 12 characters in production.');
  }

  const hash = await bcrypt.hash(bootstrapPassword, SALT_ROUNDS);
  await writeAdminHashToDisk(hash);
  return hash;
}

async function initializeAdminAccount() {
  const email = (process.env.ADMIN_EMAIL || 'admin@classroom.local').toLowerCase().trim();
  const passwordHash = await getBootstrapAdminHash();
  if (!passwordHash) {
    console.warn('[ADMIN] No ADMIN_PASSWORD or ADMIN_PASSWORD_HASH configured. Admin login will fail until configured.');
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_accounts (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  if (passwordHash) {
    await pool.query(
      `INSERT INTO admin_accounts (email, password_hash)
       VALUES ($1, $2)
       ON CONFLICT (email) DO NOTHING`,
      [email, passwordHash]
    );
  }
}

async function verifyAdminCredentials(email, password) {
  const normalizedEmail = cleanText(email, 150).toLowerCase();
  const configuredEmail = (process.env.ADMIN_EMAIL || 'admin@classroom.local').toLowerCase().trim();
  if (!normalizedEmail || normalizedEmail !== configuredEmail || typeof password !== 'string') {
    return false;
  }

  try {
    const result = await pool.query('SELECT password_hash FROM admin_accounts WHERE LOWER(email) = LOWER($1)', [normalizedEmail]);
    if (result.rows.length > 0) {
      return bcrypt.compare(password, result.rows[0].password_hash);
    }
  } catch (error) {
    console.error('[ADMIN] Admin credential lookup failed:', error.message);
  }

  return false;
}

async function updateAdminPassword(newPassword) {
  const email = (process.env.ADMIN_EMAIL || 'admin@classroom.local').toLowerCase().trim();
  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await pool.query(
    `INSERT INTO admin_accounts (email, password_hash, updated_at)
     VALUES ($1, $2, CURRENT_TIMESTAMP)
     ON CONFLICT (email)
     DO UPDATE SET password_hash = EXCLUDED.password_hash, updated_at = CURRENT_TIMESTAMP`,
    [email, passwordHash]
  );
  await writeAdminHashToDisk(passwordHash);
}

// --- SIMPLE IN-MEMORY CACHE ---
// Lightweight cache for frequently accessed data (teacher allocations, student sections)
const cache = {
  data: new Map(),
  ttl: 5 * 60 * 1000, // 5 minutes default TTL
  maxEntries: parseInt(process.env.CACHE_MAX_ENTRIES, 10) || 500,
  stats: { hits: 0, misses: 0, evictions: 0 },
  
  set(key, value, ttlMs = this.ttl) {
    if (this.data.size >= this.maxEntries && !this.data.has(key)) {
      const oldestKey = this.data.keys().next().value;
      if (oldestKey) {
        this.data.delete(oldestKey);
        this.stats.evictions++;
      }
    }
    this.data.set(key, {
      value,
      expiry: Date.now() + ttlMs
    });
  },
  
  get(key) {
    const item = this.data.get(key);
    if (!item) {
      this.stats.misses++;
      return null;
    }
    if (Date.now() > item.expiry) {
      this.data.delete(key);
      this.stats.misses++;
      return null;
    }
    this.stats.hits++;
    return item.value;
  },
  
  invalidate(pattern) {
    for (const key of this.data.keys()) {
      if (key.includes(pattern)) {
        this.data.delete(key);
      }
    }
  },
  
  clear() {
    this.data.clear();
    this.stats = { hits: 0, misses: 0, evictions: 0 };
  }
};

// Clean expired cache entries every 5 minutes
const cacheCleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, item] of cache.data.entries()) {
    if (now > item.expiry) {
      cache.data.delete(key);
    }
  }
}, 5 * 60 * 1000);
if (typeof cacheCleanupTimer.unref === 'function') {
  cacheCleanupTimer.unref();
}

console.log('[DATABASE] Connecting to PostgreSQL...');
console.log('[DATABASE] SSL:', process.env.DB_SSL === 'true' ? 'Enabled' : 'Disabled (on-premise mode)');
console.log('[CACHE] In-memory cache initialized (5 min TTL)');

// Initialize notification service
notificationService.initializeNotificationService(pool);

// Auto-create required tables/views if they do not exist
const databaseReady = (async () => {
  try {
    await initializeAdminAccount();
    console.log('admin account table ready');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS revoked_sessions (
        id SERIAL PRIMARY KEY,
        token_hash TEXT UNIQUE NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        revoked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_revoked_sessions_expires_at ON revoked_sessions(expires_at)');
    await cleanupRevokedSessions();
    console.log('revoked session table ready');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS auth_failures (
        id SERIAL PRIMARY KEY,
        identifier TEXT NOT NULL,
        role TEXT NOT NULL,
        failure_count INTEGER NOT NULL DEFAULT 0,
        locked_until TIMESTAMP,
        last_failed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (identifier, role)
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_auth_failures_locked_until ON auth_failures(locked_until)');
    console.log('auth lockout table ready');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS teacher_allocations (
        id SERIAL PRIMARY KEY,
        teacher_id INTEGER NOT NULL,
        section VARCHAR(100) NOT NULL,
        subject VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(teacher_id, section, subject)
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS teacher_student_allocations (
        id SERIAL PRIMARY KEY,
        teacher_id INTEGER NOT NULL,
        student_id INTEGER NOT NULL,
        subject VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(teacher_id, student_id, subject)
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_teacher_student_allocations_teacher ON teacher_student_allocations(teacher_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_teacher_student_allocations_student ON teacher_student_allocations(student_id)');
    console.log('teacher allocation tables ready');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS content_reports (
        id SERIAL PRIMARY KEY,
        reporter_role VARCHAR(20) NOT NULL,
        reporter_id INTEGER NOT NULL,
        target_type VARCHAR(40) NOT NULL,
        target_id INTEGER NOT NULL,
        reason TEXT NOT NULL,
        details TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'open',
        target_context JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        reviewed_at TIMESTAMP,
        reviewed_by TEXT
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_content_reports_status_created ON content_reports(status, created_at DESC)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_content_reports_target ON content_reports(target_type, target_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_content_reports_reporter ON content_reports(reporter_role, reporter_id)');
    console.log('content report table ready');

    await pool.query('ALTER TABLE teachers DROP CONSTRAINT IF EXISTS chk_name_length');
    await pool.query('ALTER TABLE teachers ADD CONSTRAINT chk_name_length CHECK (char_length(name) >= 1)');
    await pool.query('ALTER TABLE students DROP CONSTRAINT IF EXISTS chk_name_length');
    await pool.query('ALTER TABLE students ADD CONSTRAINT chk_name_length CHECK (char_length(name) >= 1)');
    await pool.query('ALTER TABLE mcq_tests DROP CONSTRAINT IF EXISTS chk_title_length');
    await pool.query('ALTER TABLE mcq_tests ADD CONSTRAINT chk_title_length CHECK (char_length(title) >= 1 AND char_length(title) <= 200)');
    console.log('database input length constraints updated');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS module_completion (
        id SERIAL PRIMARY KEY,
        module_id INTEGER NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
        student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        step_index INTEGER NOT NULL,
        is_completed BOOLEAN DEFAULT FALSE,
        completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(module_id, student_id, step_index)
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_module_completion_module ON module_completion(module_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_module_completion_student ON module_completion(student_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_module_completion_completed ON module_completion(is_completed)');
    console.log('module_completion table ready');
    
    // Create daily_study_time table for time tracking
    await pool.query(`
      CREATE TABLE IF NOT EXISTS daily_study_time (
        id SERIAL PRIMARY KEY,
        student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        study_date DATE NOT NULL DEFAULT CURRENT_DATE,
        total_seconds INTEGER NOT NULL DEFAULT 0,
        session_start TIMESTAMP,
        last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(student_id, study_date)
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_daily_study_student_date ON daily_study_time(student_id, study_date)');
    console.log('daily_study_time table ready');

    // Recreate v_student_module_progress view to support multi-section modules (sections JSONB)
    await pool.query(`
      CREATE OR REPLACE VIEW v_student_module_progress AS
      SELECT
        s.id AS student_id,
        s.name AS student_name,
        s.reg_no,
        s.class_dept,
        s.section,
        COUNT(DISTINCT m.id) AS total_modules,
        COUNT(DISTINCT CASE WHEN mp.is_completed = true THEN m.id END) AS completed_modules,
        COUNT(DISTINCT CASE WHEN mp.is_completed = false OR mp.id IS NULL THEN m.id END) AS pending_modules,
        CASE WHEN COUNT(DISTINCT m.id) > 0
          THEN ROUND(COUNT(DISTINCT CASE WHEN mp.is_completed = true THEN m.id END)::numeric / COUNT(DISTINCT m.id)::numeric * 100, 2)
          ELSE 0
        END AS completion_percentage
      FROM students s
      LEFT JOIN modules m ON (
        UPPER(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(m.section, '[-_]', ' ', 'g'), ' +', ' ', 'g'))) = UPPER(TRIM(s.class_dept || ' ' || s.section))
        OR EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(COALESCE(m.sections, '[]'::jsonb)) AS sec
          WHERE UPPER(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(sec, '[-_]', ' ', 'g'), ' +', ' ', 'g'))) = UPPER(TRIM(s.class_dept || ' ' || s.section))
        )
      )
      LEFT JOIN module_progress mp ON m.id = mp.module_id AND mp.student_id = s.id
      GROUP BY s.id, s.name, s.reg_no, s.class_dept, s.section
    `);
    console.log('v_student_module_progress view updated (multi-section support)');
  } catch (err) {
    console.error('[WARNING] Database table setup error:', err.message);
  }
})();
app.locals.databaseReady = databaseReady;

backupService.initializeBackupService();
const sessionCleanupTimer = setInterval(cleanupRevokedSessions, 60 * 60 * 1000);
if (typeof sessionCleanupTimer.unref === 'function') {
  sessionCleanupTimer.unref();
}

// --- LOCAL STORAGE CONFIGURATION (ON-PREMISE) ---
// Serve uploaded files statically
app.use('/uploads', express.static(localStorageService.UPLOAD_BASE_DIR));

console.log('[STORAGE] Local file storage configured');
console.log('[STORAGE] Upload directory:', localStorageService.UPLOAD_BASE_DIR);

// --- MIDDLEWARE ---
const authenticateToken = async (req, res, next) => {
  const token = getBearerToken(req);
  
  if (!token) return res.status(401).json({ error: "Access Denied: No Token" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (await isSessionTokenRevoked(token)) {
      return res.status(403).json({ error: "Session has been logged out. Please sign in again." });
    }
    req.user = decoded;
    req.authToken = token;
    next();
  } catch (err) {
    return res.status(403).json({ error: "Invalid or Expired Token" });
  }
};

const adminOnly = (req, res, next) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: "Forbidden: Admin Only" });
  next();
};

const teacherOnly = (req, res, next) => {
  if (req.user.role !== 'teacher') return res.status(403).json({ error: "Forbidden: Teacher Only" });
  next();
};

const studentOnly = (req, res, next) => {
  if (req.user.role !== 'student') return res.status(403).json({ error: "Forbidden: Student Only" });
  next();
};

app.use(/^\/api\/teacher(?:\/|$)/, authenticateToken, teacherOnly);
app.use(/^\/api\/student(?:\/|$)/, authenticateToken, studentOnly);

app.get('/api/csrf-token', (req, res) => {
  const token = setCsrfCookie(res);
  res.json({ csrfToken: token });
});

app.post('/api/logout', async (req, res) => {
  await revokeSessionToken(getBearerToken(req));
  clearAuthCookies(res);
  res.json({ success: true });
});

app.get('/api/session', authenticateToken, (req, res) => {
  res.json({ authenticated: true, user: req.user });
});

// --- ROUTES: AUTHENTICATION ---

// Email configuration - uses local SMTP for on-premise deployment
console.log('=== LOCAL EMAIL CONFIG (ON-PREMISE) ===');
console.log('[EMAIL] SMTP Host:', process.env.SMTP_HOST || 'localhost');
console.log('[EMAIL] SMTP Port:', process.env.SMTP_PORT || 1025);
console.log('[EMAIL] Dev Mode:', process.env.EMAIL_DEV_MODE || 'auto');

// Send email using local SMTP service (used for password reset only)
const sendEmailAsync = async (mailOptions) => {
  return localEmailService.sendEmail(mailOptions);
};

// 1. Admin Login (database-backed password hash)
app.post('/api/admin/login', async (req, res) => {
  const { email, password } = req.body;
  const lockout = await getAuthLockout(email, 'admin');
  if (lockout.locked) {
    return lockoutResponse(res, lockout.lockedUntil);
  }

  try {
    if (await verifyAdminCredentials(email, password)) {
      await clearAuthFailures(email, 'admin');
      const token = issueAuthToken({ email: cleanText(email, 150).toLowerCase(), role: 'admin' }, '24h');
      setAuthCookies(res, token);
      return res.json({ success: true, token });
    }
    await recordAuthFailure(email, 'admin');
    return res.status(401).json({ success: false, message: "Invalid Admin Credentials" });
  } catch (error) {
    console.error('[ADMIN] Login error:', error.message);
    return res.status(500).json({ error: 'Admin login failed' });
  }
});

app.post('/api/admin/change-password', authLimiter, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
    return res.status(400).json({ error: 'currentPassword and newPassword are required' });
  }

  if (!(await verifyAdminCredentials(process.env.ADMIN_EMAIL, currentPassword))) {
    return res.status(401).json({ error: 'Current admin password is incorrect' });
  }

  const passwordResult = validatePasswordPolicy(newPassword, { admin: true });
  if (passwordResult.error) {
    return res.status(400).json({ error: passwordResult.error });
  }

  try {
    await updateAdminPassword(newPassword);
  } catch (error) {
    console.error('[ADMIN] Failed to update admin password:', error.message);
    return res.status(500).json({ error: 'Failed to save the new admin password' });
  }

  console.log('[ADMIN] Admin password updated');
  return res.json({ success: true, message: 'Admin password updated successfully' });
});

// 2. Universal Login (Student/Teacher)
app.post('/api/login', async (req, res) => {
    const { email, password, role } = req.body;
    
    if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
    }
    
    // Default to 'student' if no role specified — strict whitelist
    const activeRole = sanitizeRole(role);
    const table = roleToTable(role);
    if (!activeRole || !table) {
        return res.status(400).json({ error: "Role must be 'student' or 'teacher'" });
    }

    const lockout = await getAuthLockout(email, activeRole);
    if (lockout.locked) {
        return lockoutResponse(res, lockout.lockedUntil);
    }

    try {
        const result = await pool.query(`SELECT * FROM ${table} WHERE LOWER(email) = LOWER($1)`, [email]);
        
        if (result.rows.length > 0) {
            const user = result.rows[0];
            const isMatch = await bcrypt.compare(password, user.password);
            
            if (isMatch) {
                // Check if user has TOTP (authenticator app) enabled
                const totpEnabled = user.totp_enabled || false;

                if (totpEnabled) {
                    // User has authenticator app - prompt for TOTP code
                    res.json({ 
                        success: true, 
                        mfaRequired: true, 
                        totpEnabled: true,
                        email: user.email,
                        message: "Enter code from your authenticator app"
                    });
                } else {
                    await clearAuthFailures(email, activeRole);
                    // Direct login - no MFA required
                    const token = issueAuthToken(
                        { id: user.id, email: user.email, role: activeRole },
                        '24h'
                    );
                    setAuthCookies(res, token);
                    delete user.password;
                    delete user.totp_secret;
                    res.json({
                        success: true,
                        mfaRequired: false,
                        token,
                        user: { ...user, role: activeRole }
                    });
                }
            } else {
                await recordAuthFailure(email, activeRole);
                res.status(401).json({ success: false, message: "Incorrect Password" });
            }
        } else {
            await recordAuthFailure(email, activeRole);
            res.status(404).json({ success: false, message: "Account not found" });
        }
    } catch (err) {
        console.error("Login Error:", err);
        res.status(500).json({ error: "Database error" });
    }
});

// (Email OTP endpoints removed — login uses direct JWT or TOTP authenticator app)

// --- TOTP (AUTHENTICATOR APP) SETUP ---
// Setup TOTP for teacher/student - generates QR code for Microsoft/Google Authenticator

// 4a. Setup Authenticator - Generate Secret and QR Code
app.post('/api/setup-totp', authenticateToken, async (req, res) => {
  const { role } = req.user;
  const userId = req.user.id;
  const table = role === 'student' ? 'students' : 'teachers';

  try {
    // Get user's email for QR code label
    const userResult = await pool.query(`SELECT email, totp_enabled FROM ${table} WHERE id = $1`, [userId]);
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = userResult.rows[0];

    // Generate new TOTP secret
    const secret = speakeasy.generateSecret({
      name: `Sustainable Classroom (${user.email})`,
      issuer: 'Sustainable Classroom',
      length: 20
    });

    // Store secret temporarily (not enabled until verified)
    await pool.query(
      `UPDATE ${table} SET totp_secret = $1 WHERE id = $2`,
      [secret.base32, userId]
    );

    // Generate QR code as data URL
    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

    res.json({
      success: true,
      secret: secret.base32,  // For manual entry
      qrCode: qrCodeUrl,      // Base64 image for scanning
      message: "Scan this QR code with Microsoft Authenticator or Google Authenticator"
    });

  } catch (err) {
    console.error("TOTP Setup Error:", err);
    res.status(500).json({ error: "Failed to setup authenticator" });
  }
});

// 4b. Verify and Enable TOTP - Confirm setup with first code
app.post('/api/verify-totp-setup', authenticateToken, async (req, res) => {
  const { code } = req.body;
  const { role } = req.user;
  const userId = req.user.id;
  const table = role === 'student' ? 'students' : 'teachers';

  try {
    // Get user's secret
    const userResult = await pool.query(`SELECT totp_secret FROM ${table} WHERE id = $1`, [userId]);
    
    if (userResult.rows.length === 0 || !userResult.rows[0].totp_secret) {
      return res.status(400).json({ error: "TOTP not set up. Call /api/setup-totp first." });
    }

    const secret = userResult.rows[0].totp_secret;

    // Verify the code
    const verified = speakeasy.totp.verify({
      secret: secret,
      encoding: 'base32',
      token: code,
      window: 2  // Allow 2 periods before/after for clock skew
    });

    if (verified) {
      // Enable TOTP
      await pool.query(
        `UPDATE ${table} SET totp_enabled = TRUE WHERE id = $1`,
        [userId]
      );

      res.json({
        success: true,
        message: "Authenticator enabled! Use your app code for future logins."
      });
    } else {
      res.status(401).json({ error: "Invalid code. Please try again." });
    }

  } catch (err) {
    console.error("TOTP Verify Setup Error:", err);
    res.status(500).json({ error: "Failed to verify authenticator code" });
  }
});

// 4c. Verify TOTP during Login (authenticator app)
app.post('/api/verify-totp', async (req, res) => {
  const { email, code, role } = req.body;
  if (!email || !code || !role) return res.status(400).json({ error: 'Email, code, and role required' });
  const table = roleToTable(role);
  if (!table) return res.status(400).json({ error: "Role must be 'student' or 'teacher'" });
  const activeRole = sanitizeRole(role);

  const lockout = await getAuthLockout(email, activeRole);
  if (lockout.locked) {
    return lockoutResponse(res, lockout.lockedUntil);
  }

  try {
    const result = await pool.query(
      `SELECT * FROM ${table} WHERE LOWER(email) = LOWER($1) AND totp_enabled = TRUE`,
      [email]
    );

    if (result.rows.length === 0) {
      await recordAuthFailure(email, activeRole);
      return res.status(404).json({ error: "User not found or authenticator not enabled" });
    }

    const user = result.rows[0];

    // Verify TOTP code
    const verified = speakeasy.totp.verify({
      secret: user.totp_secret,
      encoding: 'base32',
      token: code,
      window: 2
    });

    if (verified) {
      await clearAuthFailures(email, activeRole);
      // Generate JWT token
      const token = issueAuthToken(
        { id: user.id, email: user.email, role: role.toLowerCase() },
        '24h'
      );
      setAuthCookies(res, token);

      delete user.password;
      delete user.totp_secret;

      res.json({
        success: true,
        token,
        user: { ...user, role: role.toLowerCase() }
      });
    } else {
      await recordAuthFailure(email, activeRole);
      res.status(401).json({ error: "Invalid authenticator code" });
    }

  } catch (err) {
    console.error("TOTP Login Error:", err);
    res.status(500).json({ error: "Authentication failed" });
  }
});

// 4d. Disable TOTP (password-only login)
app.post('/api/disable-totp', authenticateToken, async (req, res) => {
  const { code } = req.body;
  const { role } = req.user;
  const userId = req.user.id;
  const table = role === 'student' ? 'students' : 'teachers';

  if (!code || !/^\d{6}$/.test(String(code).trim())) {
    return res.status(400).json({ error: "Enter the 6-digit authenticator code to disable authentication" });
  }

  try {
    const userResult = await pool.query(
      `SELECT totp_secret, totp_enabled FROM ${table} WHERE id = $1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = userResult.rows[0];
    if (!user.totp_enabled || !user.totp_secret) {
      return res.status(400).json({ error: "Authenticator is already disabled" });
    }

    const verified = speakeasy.totp.verify({
      secret: user.totp_secret,
      encoding: 'base32',
      token: String(code).trim(),
      window: 2
    });

    if (!verified) {
      return res.status(401).json({ error: "Invalid authenticator code" });
    }

    await pool.query(
      `UPDATE ${table} SET totp_enabled = FALSE, totp_secret = NULL WHERE id = $1`,
      [userId]
    );

    res.json({
      success: true,
      message: "Authenticator disabled. You will log in with password only."
    });

  } catch (err) {
    console.error("TOTP Disable Error:", err);
    res.status(500).json({ error: "Failed to disable authenticator" });
  }
});

// 4e. Check if user has TOTP enabled (for login flow or authenticated user)
app.get('/api/check-totp', async (req, res) => {
  try {
    // Check for JWT auth header or httpOnly auth cookie (authenticated user)
    const token = getBearerToken(req);
    if (token) {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (await isSessionTokenRevoked(token)) {
        return res.status(403).json({ error: "Session has been logged out. Please sign in again." });
      }
      const table = decoded.role === 'student' ? 'students' : 'teachers';
      
      const result = await pool.query(
        `SELECT totp_enabled FROM ${table} WHERE id = $1`,
        [decoded.id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "User not found" });
      }

      return res.json({
        totpEnabled: result.rows[0].totp_enabled || false
      });
    }

    // Fallback: Check via query params (for login flow)
    const { email, role } = req.query;
    if (!email || !role) {
      return res.status(400).json({ error: "Email and role required" });
    }

    const table = roleToTable(role);
    if (!table) return res.status(400).json({ error: "Role must be 'student' or 'teacher'" });
    const result = await pool.query(
      `SELECT totp_enabled FROM ${table} WHERE LOWER(email) = LOWER($1)`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      totpEnabled: result.rows[0].totp_enabled || false
    });

  } catch (err) {
    console.error("Check TOTP Error:", err);
    res.status(500).json({ error: "Failed to check authenticator status" });
  }
});

// --- PASSWORD RESET ---

// Request password reset (sends OTP to email)
app.post('/api/password-reset/request', async (req, res) => {
  const { email, role } = req.body;
  
  if (!email || !role) {
    return res.status(400).json({ error: "Email and role required" });
  }
  
  const table = roleToTable(role);
  if (!table) return res.status(400).json({ error: "Role must be 'student' or 'teacher'" });
  
  try {
    // Check if user exists
    const result = await pool.query(
      `SELECT id, name, email FROM ${table} WHERE LOWER(email) = LOWER($1)`,
      [email]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    
    const user = result.rows[0];
    
    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    
    // Store OTP
    await pool.query(
      `UPDATE ${table} SET otp_code = $1, otp_expiry = $2 WHERE id = $3`,
      [otp, expiry, user.id]
    );
    
    // Send OTP email via nodemailer
    console.log('[PASSWORD RESET] Sending OTP to:', email);
    
    if (process.env.SMTP_HOST) {
      try {
        const nodemailer = require('nodemailer');
        const transportConfig = {
          host: process.env.SMTP_HOST || 'localhost',
          port: parseInt(process.env.SMTP_PORT || '1025', 10),
          secure: process.env.SMTP_SECURE === 'true',
          ignoreTLS: process.env.SMTP_IGNORE_TLS !== 'false',
        };
        const transporter = nodemailer.createTransport(transportConfig);
        const fromName = process.env.EMAIL_FROM_NAME || 'SusClass';
        const fromAddr = process.env.EMAIL_FROM_ADDRESS || 'noreply@classroom.local';
        await transporter.sendMail({
          from: `"${fromName}" <${fromAddr}>`,
          to: email,
          subject: 'Password Reset Code',
          html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
                <div style="background-color: #ffffff; padding: 30px; border-radius: 10px; box-shadow: 0 1px 2px rgba(0,0,0,0.06);">
                  <h2 style="color: #111827; margin-bottom: 16px; font-weight: 700;">Password Reset Request</h2>
                  <p style="color: #1f2937; line-height: 1.6;">Hello <strong>${user.name}</strong>,</p>
                  <p style="color: #1f2937; line-height: 1.6;">Use this code to reset your password:</p>
                  <div style="background-color: #111827; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
                    <span style="color: #ffffff; font-size: 32px; font-weight: bold; letter-spacing: 8px;">${otp}</span>
                  </div>
                  <p style="color: #6b7280; font-size: 14px;">This code expires in 10 minutes.</p>
                  <p style="color: #6b7280; font-size: 12px; margin-top: 20px;">If you didn't request this, please ignore this email.</p>
                </div>
              </div>
            `
        });
        console.log('[PASSWORD RESET] Email sent successfully');
      } catch (emailErr) {
        console.error('[PASSWORD RESET] Email failed:', emailErr.message);
        console.log('[PASSWORD RESET] OTP for testing:', otp);
      }
    } else {
      console.log('[PASSWORD RESET] No SMTP_HOST configured - OTP:', otp);
    }
    
    res.json({ success: true, message: "Reset code sent to email" });
  } catch (err) {
    console.error("Password Reset Request Error:", err);
    res.status(500).json({ error: "Failed to process request" });
  }
});

// Verify OTP and reset password
app.post('/api/password-reset/confirm', async (req, res) => {
  const { email, role, otp, newPassword } = req.body;
  
  if (!email || !role || !otp || !newPassword) {
    return res.status(400).json({ error: "All fields required" });
  }
  
  const passwordResult = validatePasswordPolicy(newPassword);
  if (passwordResult.error) {
    return res.status(400).json({ error: passwordResult.error });
  }
  
  const table = roleToTable(role);
  if (!table) return res.status(400).json({ error: "Role must be 'student' or 'teacher'" });
  
  try {
    // Verify OTP
    const result = await pool.query(
      `SELECT id FROM ${table} WHERE LOWER(email) = LOWER($1) AND otp_code = $2 AND otp_expiry > NOW()`,
      [email, otp]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid or expired code" });
    }
    
    const userId = result.rows[0].id;
    
    // Hash new password and update
    const hashed = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await pool.query(
      `UPDATE ${table} SET password = $1, otp_code = NULL, otp_expiry = NULL WHERE id = $2`,
      [hashed, userId]
    );
    
    console.log('[PASSWORD RESET] Password updated for:', email);
    res.json({ success: true, message: "Password reset successful" });
  } catch (err) {
    console.error("Password Reset Confirm Error:", err);
    res.status(500).json({ error: "Failed to reset password" });
  }
});

// Admin reset any user's password
app.post('/api/admin/reset-password', authenticateToken, adminOnly, async (req, res) => {
  const { userId, userType, newPassword } = req.body;
  
  if (!userId || !userType || !newPassword) {
    return res.status(400).json({ error: "userId, userType, and newPassword required" });
  }
  
  if (!['teacher', 'student'].includes(userType.toLowerCase())) {
    return res.status(400).json({ error: "userType must be 'teacher' or 'student'" });
  }
  
  const passwordResult = validatePasswordPolicy(newPassword);
  if (passwordResult.error) {
    return res.status(400).json({ error: passwordResult.error });
  }
  
  const table = userType.toLowerCase() === 'teacher' ? 'teachers' : 'students';
  
  try {
    const hashed = await bcrypt.hash(newPassword, SALT_ROUNDS);
    const result = await pool.query(
      `UPDATE ${table} SET password = $1 WHERE id = $2 RETURNING email`,
      [hashed, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    
    console.log('[ADMIN] Password reset for:', result.rows[0].email);
    res.json({ success: true, message: "Password reset successful" });
  } catch (err) {
    console.error("Admin Password Reset Error:", err);
    res.status(500).json({ error: "Failed to reset password" });
  }
});

// --- ROUTES: ADMIN MANAGEMENT ---

// 3. Register Teacher
app.post('/api/admin/register-teacher', authenticateToken, adminOnly, async (req, res) => {
  const { name, email, password, staff_id, dept, media } = req.body;
  
  // Validate required fields
  const trimmedName = name ? name.trim() : '';
  if (!trimmedName) {
    return res.status(400).json({ error: "Name is required" });
  }
  if (trimmedName.length > 100) {
    return res.status(400).json({ error: "Name too long (max 100 characters)" });
  }
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }
  if (email.length > 150) {
    return res.status(400).json({ error: "Email too long (max 150 characters)" });
  }
  if (password.length > 72) {
    return res.status(400).json({ error: "Password too long (max 72 characters)" });
  }
  const passwordResult = validatePasswordPolicy(password);
  if (passwordResult.error) {
    return res.status(400).json({ error: passwordResult.error });
  }
  if (staff_id && staff_id.length > 20) {
    return res.status(400).json({ error: "Staff ID too long (max 20 characters)" });
  }
  if (dept && dept.trim().length > 60) {
    return res.status(400).json({ error: "Department too long (max 60 characters)" });
  }
  
  // Validate email format
  const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: "Invalid email format" });
  }
  
  try {
    const hashed = await bcrypt.hash(password, SALT_ROUNDS);
    const normalizedDept = dept ? dept.trim().toUpperCase() : null;
    // Note: We pass objects directly; pg driver handles JSON conversion for JSONB columns
    const query = `INSERT INTO teachers (name, email, password, staff_id, dept, media, allocated_sections) 
                   VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`;
    const values = [trimmedName, email.toLowerCase().trim(), hashed, staff_id, normalizedDept, media || {}, []];
    
    const result = await pool.query(query, values);
    const teacherId = result.rows[0].id;
    
    // NOTIFICATION: Welcome email
    try {
      const teacher = {
        id: teacherId,
        type: 'teacher',
        email: email,
        name: name
      };
      
      await notificationService.sendEmail(
        'ACCOUNT_CREATED',
        teacher,
        {
          name: name,
          email: email,
          role: 'teacher',
          staff_id: staff_id
        },
        { teacher_id: teacherId }
      );
      console.log(`Sent ACCOUNT_CREATED notification to teacher ${name}`);
    } catch (notifErr) {
      console.error('Welcome notification error (non-blocking):', notifErr);
    }
    
    res.status(201).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "DB Error: " + err.message });
  }
});

// 4. Register Student
app.post('/api/admin/register-student', authenticateToken, adminOnly, async (req, res) => {
  const { name, email, password, reg_no, class_dept, section, media } = req.body;
  
  console.log("=== STUDENT REGISTRATION ATTEMPT ===");
  console.log("Name:", name);
  console.log("Email:", email);
  console.log("Reg No:", reg_no);
  console.log("Class/Dept:", class_dept);
  console.log("Section:", section);
  console.log("Media:", media);
  
  try {
    // Validate required fields
    if (!name || typeof name !== 'string' || name.trim().length < 1) {
      console.log("[ERROR] Name is required");
      return res.status(400).json({ error: "Name is required" });
    }
    if (name.trim().length > 100) {
      return res.status(400).json({ error: "Name too long (max 100 characters)" });
    }
    if (!email || !password) {
      console.log("[ERROR] Missing required fields");
      return res.status(400).json({ error: "Email and password are required" });
    }
    if (email.length > 150) {
      return res.status(400).json({ error: "Email too long (max 150 characters)" });
    }
    if (password.length > 72) {
      return res.status(400).json({ error: "Password too long (max 72 characters)" });
    }
    const passwordResult = validatePasswordPolicy(password);
    if (passwordResult.error) {
      return res.status(400).json({ error: passwordResult.error });
    }
    if (reg_no && reg_no.length > 20) {
      return res.status(400).json({ error: "Reg No too long (max 20 characters)" });
    }
    if (section && section.trim().length > 20) {
      return res.status(400).json({ error: "Section too long (max 20 characters)" });
    }
    if (class_dept && class_dept.trim().length > 60) {
      return res.status(400).json({ error: "Class/Department too long (max 60 characters)" });
    }
    
    // Validate email format
    const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
    if (!emailRegex.test(email)) {
      console.log("[ERROR] Invalid email format:", email);
      return res.status(400).json({ error: "Invalid email format. Please use a complete email address (e.g., user@example.com)" });
    }
    
    console.log("Validation passed, hashing password...");
    const hashed = await bcrypt.hash(password, SALT_ROUNDS);
    
    // Normalize class_dept and section to prevent duplicates (ECE A = ece a = ECE a)
    const normalizedClass = class_dept ? class_dept.trim().toUpperCase() : null;
    const normalizedSection = section ? section.trim().toUpperCase() : null;
    
    console.log("Password hashed, inserting into database...");
    console.log("Normalized Class:", normalizedClass, "Normalized Section:", normalizedSection);
    const query = `INSERT INTO students (name, email, password, reg_no, class_dept, section, media) 
                   VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`;
    const values = [name.trim(), email.toLowerCase().trim(), hashed, reg_no, normalizedClass, normalizedSection, media || {}];
    
    const result = await pool.query(query, values);
    const studentId = result.rows[0].id;
    console.log("Student registered successfully");
    
    // NOTIFICATION: Welcome email
    try {
      const student = {
        id: studentId,
        type: 'student',
        email: email,
        name: name
      };
      
      await notificationService.sendEmail(
        'ACCOUNT_CREATED',
        student,
        {
          name: name,
          email: email,
          role: 'student',
          reg_no: reg_no,
          section: section
        },
        { student_id: studentId }
      );
      console.log(`Sent ACCOUNT_CREATED notification to student ${name}`);
    } catch (notifErr) {
      console.error('Welcome notification error (non-blocking):', notifErr);
    }
    
    res.status(201).json({ success: true });
  } catch (err) {
    console.error("[ERROR] Registration Error:", err.message);
    console.error("Error Code:", err.code);
    console.error("Error Detail:", err.detail);
    
    // Check for duplicate email
    if (err.code === '23505') {
      return res.status(400).json({ error: "Email already exists. Please use a different email address." });
    }
    // Check for email format constraint
    if (err.message.includes('chk_email_format')) {
      return res.status(400).json({ error: "Invalid email format. Please enter a complete email address." });
    }
    res.status(500).json({ error: "Database Error: " + err.message });
  }
});

// 4b. Bulk Upload Students via CSV
app.post('/api/admin/bulk-upload-students', authenticateToken, adminOnly, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No CSV file uploaded" });
    
    const text = fs.readFileSync(req.file.path, 'utf-8');
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length < 1) return res.status(400).json({ error: "CSV file is empty" });
    
    // Auto-detect header row
    const header = lines[0].toLowerCase().replace(/\r/g, '');
    const hasHeader = header.includes('name') || header.includes('email') || header.includes('reg_no') || header.includes('class_dept');
    const startIndex = hasHeader ? 1 : 0;
    
    if (lines.length <= startIndex) return res.status(400).json({ error: "CSV has no data rows" });
    
    const results = { success: 0, failed: 0, errors: [] };
    
    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i].replace(/\r/g, '').trim();
      if (!line) continue;
      
      // Parse CSV (handle quoted commas)
      const values = line.match(/(".*?"|[^,]+)(?=\s*,|\s*$)/g);
      if (!values || values.length < 6) {
        results.failed++;
        results.errors.push(`Row ${i + 1}: Expected 6 columns (name,email,password,reg_no,class_dept,section)`);
        continue;
      }
      
      const [name, email, password, reg_no, class_dept, section] = values.map(v => v.replace(/^"|"$/g, '').trim());
      
      if (!name || !email || !password || !reg_no || !class_dept || !section) {
        results.failed++;
        results.errors.push(`Row ${i + 1}: Missing required fields`);
        continue;
      }
      
      const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
      if (!emailRegex.test(email)) {
        results.failed++;
        results.errors.push(`Row ${i + 1}: Invalid email "${email}"`);
        continue;
      }
      const passwordResult = validatePasswordPolicy(password);
      if (passwordResult.error) {
        results.failed++;
        results.errors.push(`Row ${i + 1}: ${passwordResult.error}`);
        continue;
      }
      
      try {
        const hashed = await bcrypt.hash(password, SALT_ROUNDS);
        await pool.query(
          `INSERT INTO students (name, email, password, reg_no, class_dept, section, media) 
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [name.trim(), email, hashed, reg_no, class_dept.trim().toUpperCase(), section.trim().toUpperCase(), {}]
        );
        results.success++;
      } catch (dbErr) {
        results.failed++;
        results.errors.push(`Row ${i + 1} (${email}): ${dbErr.code === '23505' ? 'Email already exists' : dbErr.message}`);
      }
    }
    
    // Clean up uploaded file
    try { fs.unlinkSync(req.file.path); } catch (e) {}
    
    res.json({ 
      success: true, 
      message: `${results.success} students registered, ${results.failed} failed`,
      ...results 
    });
  } catch (err) {
    console.error("Bulk Upload Students Error:", err);
    res.status(500).json({ error: "Bulk upload failed: " + err.message });
  }
});

// 4c. Bulk Upload Teachers via CSV
app.post('/api/admin/bulk-upload-teachers', authenticateToken, adminOnly, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No CSV file uploaded" });
    
    const text = fs.readFileSync(req.file.path, 'utf-8');
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length < 1) return res.status(400).json({ error: "CSV file is empty" });
    
    const header = lines[0].toLowerCase().replace(/\r/g, '');
    const hasHeader = header.includes('name') || header.includes('email') || header.includes('staff_id') || header.includes('dept');
    const startIndex = hasHeader ? 1 : 0;
    
    if (lines.length <= startIndex) return res.status(400).json({ error: "CSV has no data rows" });
    
    const results = { success: 0, failed: 0, errors: [] };
    
    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i].replace(/\r/g, '').trim();
      if (!line) continue;
      
      const values = line.match(/(".*?"|[^,]+)(?=\s*,|\s*$)/g);
      if (!values || values.length < 5) {
        results.failed++;
        results.errors.push(`Row ${i + 1}: Expected 5 columns (name,email,password,staff_id,dept)`);
        continue;
      }
      
      const [name, email, password, staff_id, dept] = values.map(v => v.replace(/^"|"$/g, '').trim());
      
      if (!name || !email || !password) {
        results.failed++;
        results.errors.push(`Row ${i + 1}: Missing required fields (name, email, password)`);
        continue;
      }
      
      const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
      if (!emailRegex.test(email)) {
        results.failed++;
        results.errors.push(`Row ${i + 1}: Invalid email "${email}"`);
        continue;
      }
      const passwordResult = validatePasswordPolicy(password);
      if (passwordResult.error) {
        results.failed++;
        results.errors.push(`Row ${i + 1}: ${passwordResult.error}`);
        continue;
      }
      
      try {
        const hashed = await bcrypt.hash(password, SALT_ROUNDS);
        await pool.query(
          `INSERT INTO teachers (name, email, password, staff_id, dept, media, allocated_sections) 
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [name.trim(), email, hashed, staff_id || '', dept || '', {}, []]
        );
        results.success++;
      } catch (dbErr) {
        results.failed++;
        results.errors.push(`Row ${i + 1} (${email}): ${dbErr.code === '23505' ? 'Email already exists' : dbErr.message}`);
      }
    }
    
    try { fs.unlinkSync(req.file.path); } catch (e) {}
    
    res.json({ 
      success: true, 
      message: `${results.success} teachers registered, ${results.failed} failed`,
      ...results 
    });
  } catch (err) {
    console.error("Bulk Upload Teachers Error:", err);
    res.status(500).json({ error: "Bulk upload failed: " + err.message });
  }
});

// 5. Teacher List (For Allocation)
app.get('/api/teachers', authenticateToken, adminOnly, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name, staff_id, dept, allocated_sections FROM teachers ORDER BY name ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Update Allocation (Old - keeping for backward compatibility)
app.put('/api/teachers/:id/allocate', authenticateToken, adminOnly, async (req, res) => {
  const { id } = req.params;
  const { sections } = req.body; // Expects an array: ["CSE A", "ECE B"]
  try {
    await pool.query('UPDATE teachers SET allocated_sections = $1 WHERE id = $2', [JSON.stringify(sections), id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7a. Admin: Update Teacher
app.put('/api/admin/teacher/:id', authenticateToken, adminOnly, async (req, res) => {
  const { id } = req.params;
  const { name, email, staff_id, dept, media } = req.body;
  try {
    if (media) {
      await pool.query(
        'UPDATE teachers SET name = $1, email = $2, staff_id = $3, dept = $4, media = $5 WHERE id = $6',
        [name, email, staff_id, dept, media, id]
      );
    } else {
      await pool.query(
        'UPDATE teachers SET name = $1, email = $2, staff_id = $3, dept = $4 WHERE id = $5',
        [name, email, staff_id, dept, id]
      );
    }
    res.json({ success: true, message: "Teacher updated successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7b. Admin: Delete Teacher
app.delete('/api/admin/teacher/:id', authenticateToken, adminOnly, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM teachers WHERE id = $1', [id]);
    res.json({ success: true, message: "Teacher deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7c. Admin: Update Student
app.put('/api/admin/student/:id', authenticateToken, adminOnly, async (req, res) => {
  const { id } = req.params;
  const { name, email, reg_no, class_dept, section, media } = req.body;
  try {
    const normalizedClass = class_dept ? class_dept.trim().toUpperCase() : null;
    const normalizedSection = section ? section.trim().toUpperCase() : null;
    
    if (media) {
      await pool.query(
        'UPDATE students SET name = $1, email = $2, reg_no = $3, class_dept = $4, section = $5, media = $6 WHERE id = $7',
        [name, email, reg_no, normalizedClass, normalizedSection, media, id]
      );
    } else {
      await pool.query(
        'UPDATE students SET name = $1, email = $2, reg_no = $3, class_dept = $4, section = $5 WHERE id = $6',
        [name, email, reg_no, normalizedClass, normalizedSection, id]
      );
    }
    res.json({ success: true, message: "Student updated successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7d. Admin: Delete Student
app.delete('/api/admin/student/:id', authenticateToken, adminOnly, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM students WHERE id = $1', [id]);
    res.json({ success: true, message: "Student deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7e. Admin: Get All Students
app.get('/api/admin/students', authenticateToken, adminOnly, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, reg_no, class_dept, section, media, created_at FROM students ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7f. Admin: Get All Teachers
app.get('/api/admin/teachers', authenticateToken, adminOnly, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, staff_id, dept, allocated_sections, media, created_at FROM teachers ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7g. Admin: Allocate Teacher to Students (Many-to-Many)
app.post('/api/admin/allocate', authenticateToken, adminOnly, async (req, res) => {
  const { teacher_id, student_ids, subject } = req.body;
  try {
    // Delete existing allocations for this teacher and subject
    await pool.query(
      'DELETE FROM teacher_student_allocations WHERE teacher_id = $1 AND subject = $2',
      [teacher_id, subject]
    );
    
    // Insert new allocations
    for (const student_id of student_ids) {
      await pool.query(
        'INSERT INTO teacher_student_allocations (teacher_id, student_id, subject) VALUES ($1, $2, $3) ON CONFLICT (teacher_id, student_id, subject) DO NOTHING',
        [teacher_id, student_id, subject]
      );
    }
    
    res.json({ success: true, message: "Allocation updated successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7g2. Admin: Get Available Sections (unique class/section combinations)
app.get('/api/admin/sections', authenticateToken, adminOnly, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        ROW_NUMBER() OVER (ORDER BY class_dept, section) as id,
        class_dept, 
        section, 
        COUNT(*) as student_count
      FROM students 
      WHERE class_dept IS NOT NULL AND section IS NOT NULL
      GROUP BY class_dept, section 
      ORDER BY class_dept, section
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7g3. Admin: Allocate Teacher to Sections (Class-based allocation)
app.post('/api/admin/allocate-sections', authenticateToken, adminOnly, async (req, res) => {
  const { teacher_id, sections, subject } = req.body;
  
  console.log("Allocation request:", { teacher_id, sections, subject });
  
  if (!teacher_id || !sections || sections.length === 0 || !subject) {
    return res.status(400).json({ error: "Teacher ID, sections, and subject are required" });
  }
  
  try {
    // Get all available sections to map IDs
    const allSectionsResult = await pool.query(`
      SELECT 
        ROW_NUMBER() OVER (ORDER BY class_dept, section) as id,
        class_dept, 
        section
      FROM students 
      WHERE class_dept IS NOT NULL AND section IS NOT NULL
      GROUP BY class_dept, section 
      ORDER BY class_dept, section
    `);
    
    const allSections = allSectionsResult.rows;
    console.log("All available sections:", allSections);
    
    // Map selected section IDs to section strings (class_dept section) - USE SPACE not hyphen
    const selectedSectionStrings = sections.map(sectionId => {
      // Section IDs come as strings from frontend, compare as strings
      const section = allSections.find(s => String(s.id) === String(sectionId));
      if (section) {
        return `${section.class_dept} ${section.section}`; // Use SPACE for consistency
      }
      return null;
    }).filter(Boolean);
    
    console.log("Selected section strings:", selectedSectionStrings);
    
    if (selectedSectionStrings.length === 0) {
      return res.status(400).json({ error: "No valid sections found" });
    }
    
    // Get current allocated sections for this teacher
    const teacherResult = await pool.query(
      'SELECT allocated_sections FROM teachers WHERE id = $1',
      [teacher_id]
    );
    
    // Handle null or non-array allocated_sections
    let currentSections = teacherResult.rows[0]?.allocated_sections;
    
    // Parse if it's a JSON string, ensure it's an array
    if (typeof currentSections === 'string') {
      try {
        currentSections = JSON.parse(currentSections);
      } catch (e) {
        currentSections = [];
      }
    }
    
    if (!Array.isArray(currentSections)) {
      currentSections = [];
    }
    
    // Add new sections (avoiding duplicates) - convert Set back to Array
    const updatedSections = Array.from(new Set([...currentSections, ...selectedSectionStrings]));
    
    console.log("Updating teacher sections to:", updatedSections);
    
    // Update teacher's allocated_sections - ensure it's stored as proper JSON
    await pool.query(
      'UPDATE teachers SET allocated_sections = $1 WHERE id = $2',
      [JSON.stringify(updatedSections), teacher_id]
    );
    
    // Also create teacher_student_allocations for all students in these sections
    for (const sectionStr of selectedSectionStrings) {
      const [class_dept, section] = sectionStr.split(' '); // Split by SPACE
      
      // Get all students in this section
      const studentsResult = await pool.query(
        'SELECT id FROM students WHERE class_dept = $1 AND section = $2',
        [class_dept, section]
      );
      
      console.log(`Found ${studentsResult.rows.length} students in ${sectionStr}`);
      
      // Create allocations for each student
      for (const student of studentsResult.rows) {
        await pool.query(
          'INSERT INTO teacher_student_allocations (teacher_id, student_id, subject) VALUES ($1, $2, $3) ON CONFLICT (teacher_id, student_id, subject) DO NOTHING',
          [teacher_id, student.id, subject]
        );
      }
    }
    
    res.json({ 
      success: true, 
      message: `Teacher assigned to ${selectedSectionStrings.length} section(s): ${selectedSectionStrings.join(', ')}` 
    });
  } catch (err) {
    console.error("Section allocation error:", err);
    res.status(500).json({ error: err.message });
  }
});

// 7g4. Admin: Update Teacher Allocations (Replace existing allocations)
app.put('/api/admin/teacher/:id/allocations', authenticateToken, adminOnly, async (req, res) => {
  const { id } = req.params;
  const { sections, subject } = req.body;
  
  console.log("Update teacher allocations:", { teacher_id: id, sections, subject });
  
  try {
    // Update teacher's allocated_sections - replace entirely
    await pool.query(
      'UPDATE teachers SET allocated_sections = $1 WHERE id = $2',
      [JSON.stringify(sections || []), id]
    );
    
    // Delete existing allocations in both tables
    await pool.query('DELETE FROM teacher_allocations WHERE teacher_id = $1', [id]);
    await pool.query('DELETE FROM teacher_student_allocations WHERE teacher_id = $1', [id]);
    
    // Add new allocations to both tables
    if (sections && sections.length > 0 && subject) {
      for (const sectionStr of sections) {
        await pool.query(
          'INSERT INTO teacher_allocations (teacher_id, section, subject) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
          [id, sectionStr, subject]
        );
        
        // Also populate teacher_student_allocations
        const parts = sectionStr.trim().split(/\s+/);
        if (parts.length >= 2) {
          const dept = parts.slice(0, -1).join(' ');
          const sec = parts[parts.length - 1];
          const studentsResult = await pool.query(
            'SELECT id FROM students WHERE UPPER(class_dept) = UPPER($1) AND UPPER(section) = UPPER($2)',
            [dept, sec]
          );
          for (const student of studentsResult.rows) {
            await pool.query(
              'INSERT INTO teacher_student_allocations (teacher_id, student_id, subject) VALUES ($1, $2, $3) ON CONFLICT (teacher_id, student_id, subject) DO NOTHING',
              [id, student.id, subject]
            );
          }
        }
      }
    }
    
    // Invalidate cache
    cache.invalidate(`teacher_students_${id}`);
    
    res.json({ success: true, message: `Teacher allocations updated to: ${(sections || []).join(', ')}` });
  } catch (err) {
    console.error("Update allocations error:", err);
    res.status(500).json({ error: err.message });
  }
});

// 7g5. Admin: Remove specific section from teacher
app.delete('/api/admin/teacher/:id/section/:section', authenticateToken, adminOnly, async (req, res) => {
  const { id, section } = req.params;
  const decodedSection = decodeURIComponent(section);
  
  console.log("Remove teacher section:", { teacher_id: id, section: decodedSection });
  
  try {
    // Get current sections
    const teacherResult = await pool.query('SELECT allocated_sections FROM teachers WHERE id = $1', [id]);
    let currentSections = teacherResult.rows[0]?.allocated_sections || [];
    
    if (typeof currentSections === 'string') {
      try { currentSections = JSON.parse(currentSections); } catch(e) { currentSections = []; }
    }
    
    // Remove the section (case-insensitive)
    const updatedSections = currentSections.filter(s => 
      s.toUpperCase().replace(/\\s+/g, ' ').trim() !== decodedSection.toUpperCase().replace(/\\s+/g, ' ').trim()
    );
    
    // Update teacher
    await pool.query('UPDATE teachers SET allocated_sections = $1 WHERE id = $2', [JSON.stringify(updatedSections), id]);
    
    // Remove from teacher_allocations table
    await pool.query(
      'DELETE FROM teacher_allocations WHERE teacher_id = $1 AND UPPER(TRIM(section)) = UPPER(TRIM($2))',
      [id, decodedSection]
    );
    
    // Also remove from teacher_student_allocations for students in this section
    const parts = decodedSection.trim().split(/\s+/);
    if (parts.length >= 2) {
      const dept = parts.slice(0, -1).join(' ');
      const sec = parts[parts.length - 1];
      await pool.query(
        `DELETE FROM teacher_student_allocations WHERE teacher_id = $1 AND student_id IN (
          SELECT id FROM students WHERE UPPER(class_dept) = UPPER($2) AND UPPER(section) = UPPER($3)
        )`,
        [id, dept, sec]
      );
    }
    
    // Invalidate cache
    cache.invalidate(`teacher_students_${id}`);
    
    res.json({ success: true, message: `Removed section: ${decodedSection}` });
  } catch (err) {
    console.error("Remove section error:", err);
    res.status(500).json({ error: err.message });
  }
});

// 7h. Admin: Get Teacher's Students
app.get('/api/admin/teacher/:id/students', authenticateToken, adminOnly, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      'SELECT * FROM v_teacher_students WHERE teacher_id = $1 ORDER BY student_name',
      [id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7i. Admin: Get Student's Teachers
app.get('/api/admin/student/:id/teachers', authenticateToken, adminOnly, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      'SELECT * FROM v_student_teachers WHERE student_id = $1 ORDER BY teacher_name',
      [id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7j. Admin: System Status Dashboard (Production Monitoring)
app.get('/api/admin/system-status', authenticateToken, adminOnly, async (req, res) => {
  try {
    const uptime = Math.floor((Date.now() - metrics.startTime) / 1000);
    const avgLatency = metrics.latency.count > 0 
      ? Math.round(metrics.latency.sum / metrics.latency.count) 
      : 0;
    
    // Get database stats
    const dbStats = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM students) as total_students,
        (SELECT COUNT(*) FROM teachers) as total_teachers,
        (SELECT COUNT(*) FROM modules) as total_modules,
        (SELECT COUNT(*) FROM mcq_tests) as total_tests,
        (SELECT COUNT(*) FROM chat_messages) as total_messages,
        (SELECT COUNT(*) FROM student_submissions) as total_submissions
    `);
    
    // Get recent activity (based on created_at since updated_at may not exist)
    const recentActivity = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM chat_messages WHERE created_at > NOW() - INTERVAL '24 hours') as recent_messages,
        (SELECT COUNT(*) FROM student_submissions WHERE submitted_at > NOW() - INTERVAL '24 hours') as recent_submissions
    `);
    
    // Get storage usage estimate
    const storageStats = await pool.query(`
      SELECT pg_size_pretty(pg_database_size(current_database())) as database_size
    `);
    
    res.json({
      system: {
        uptime: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
        uptimeSeconds: uptime,
        nodeVersion: process.version,
        memoryUsage: {
          heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
          heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB',
          rss: Math.round(process.memoryUsage().rss / 1024 / 1024) + ' MB'
        }
      },
      database: {
        status: 'healthy',
        size: storageStats.rows[0].database_size,
        pool: {
          total: pool.totalCount || 0,
          idle: pool.idleCount || 0,
          waiting: pool.waitingCount || 0
        },
        stats: dbStats.rows[0]
      },
      requests: {
        total: metrics.requests.total,
        success: metrics.requests.success,
        errors: metrics.requests.errors,
        avgLatencyMs: avgLatency,
        activeConnections: metrics.activeConnections
      },
      cache: {
        entries: cache.data.size,
        hits: cache.stats.hits,
        misses: cache.stats.misses,
        evictions: cache.stats.evictions
      },
      codeExecution: {
        ...getExecutionQueueStatus()
      },
      activity: {
        last24hMessages: parseInt(recentActivity.rows[0]?.recent_messages || 0),
        last24hSubmissions: parseInt(recentActivity.rows[0]?.recent_submissions || 0)
      },
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('System status error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/backups/status', authenticateToken, adminOnly, (req, res) => {
  res.json(backupService.getBackupStatus());
});

app.post('/api/admin/backups/run', authenticateToken, adminOnly, async (req, res) => {
  const result = await backupService.runDatabaseBackup('manual');
  res.status(result.success ? 200 : 500).json(result);
});


// 8. Fetch Teacher Profile (for Dashboard)
app.get('/api/teacher/me', authenticateToken, async (req, res) => {
  try {
    // req.user.id comes from the decoded JWT token
    const result = await pool.query(
      'SELECT id, name, email, staff_id, dept, media, allocated_sections, totp_enabled FROM teachers WHERE id = $1', 
      [req.user.id]
    );
    
    if (result.rows.length === 0) return res.status(404).json({ error: "Teacher not found" });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 8b. Teacher: Get My Allocated Students (with self-healing)
app.get('/api/teacher/my-students', authenticateToken, async (req, res) => {
  try {
    const teacher_id = req.user.id;
    const cacheKey = `teacher_students_${teacher_id}`;
    
    // Check cache first
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }
    
    // Get teacher's allocated_sections (source of truth for which sections)
    const teacherResult = await pool.query(
      'SELECT dept, allocated_sections FROM teachers WHERE id = $1',
      [teacher_id]
    );
    const teacherDept = teacherResult.rows[0]?.dept || '';
    let allocatedSections = teacherResult.rows[0]?.allocated_sections || [];
    if (typeof allocatedSections === 'string') {
      try { allocatedSections = JSON.parse(allocatedSections); } catch(e) { allocatedSections = []; }
    }
    if (!Array.isArray(allocatedSections)) allocatedSections = [];
    
    // Self-heal: ensure teacher_student_allocations has rows for ALL allocated sections
    if (allocatedSections.length > 0) {
      // Get existing allocation sections from teacher_student_allocations
      const existingResult = await pool.query(
        `SELECT DISTINCT UPPER(s.class_dept || ' ' || s.section) as full_section
         FROM teacher_student_allocations a
         JOIN students s ON a.student_id = s.id
         WHERE a.teacher_id = $1`,
        [teacher_id]
      );
      const existingSections = new Set(existingResult.rows.map(r => r.full_section));
      
      // Find sections in allocated_sections that have no rows in teacher_student_allocations
      const missingSections = allocatedSections.filter(s => !existingSections.has(s.toUpperCase()));
      
      if (missingSections.length > 0) {
        console.log(`[Self-Heal] Teacher ${teacher_id}: creating allocation rows for missing sections:`, missingSections);
        for (const sectionStr of missingSections) {
          const parts = sectionStr.trim().split(/\s+/);
          if (parts.length < 2) continue;
          const dept = parts.slice(0, -1).join(' ');
          const sec = parts[parts.length - 1];
          
          const studentsResult = await pool.query(
            'SELECT id FROM students WHERE UPPER(class_dept) = UPPER($1) AND UPPER(section) = UPPER($2)',
            [dept, sec]
          );
          
          // Determine subject: check if teacher has any existing allocations with a subject, otherwise use dept
          const subjectResult = await pool.query(
            'SELECT DISTINCT subject FROM teacher_student_allocations WHERE teacher_id = $1 AND subject IS NOT NULL LIMIT 1',
            [teacher_id]
          );
          const subject = subjectResult.rows[0]?.subject || teacherDept;
          
          for (const student of studentsResult.rows) {
            await pool.query(
              'INSERT INTO teacher_student_allocations (teacher_id, student_id, subject) VALUES ($1, $2, $3) ON CONFLICT (teacher_id, student_id, subject) DO NOTHING',
              [teacher_id, student.id, subject]
            );
          }
        }
        // Clear cache since we just modified data
        cache.invalidate(cacheKey);
      }
    }
    
    const result = await pool.query(
      'SELECT * FROM v_teacher_students WHERE teacher_id = $1 ORDER BY student_name',
      [teacher_id]
    );
    
    // Cache for 2 minutes
    cache.set(cacheKey, result.rows, 2 * 60 * 1000);
    
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 9. Fetch Students for a specific section
app.get('/api/teacher/students/:section', authenticateToken, async (req, res) => {
  const fullSectionString = req.params.section; // e.g., "ECE A" or "ece a"

  try {
    // 1. Split "ECE A" into ["ECE", "A"]
    const parts = fullSectionString.trim().split(/\s+/); 
    const deptPart = parts[0];    // "ECE"
    const sectionPart = parts[1]; // "A"

    // 2. Query using LOWER() on both the column and the parameter
    const result = await pool.query(
      `SELECT id, name, reg_no, class_dept, section, media 
       FROM students 
       WHERE LOWER(class_dept) = LOWER($1) 
       AND LOWER(section) = LOWER($2) 
       ORDER BY name ASC`,
      [deptPart, sectionPart]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Fetch Students Error:", err.message);
    res.status(500).json({ error: "Failed to load roster" });
  }
});

// --- ROUTES: MEDIA (LOCAL STORAGE) ---

// 7. Media Upload (Images and Videos) - LOCAL STORAGE
app.post('/api/upload', authenticateToken, upload.single('file'), (req, res) => {
  try {
    console.log("[LOCAL UPLOAD] Request received");
    
    if (!req.file) {
      console.error("[LOCAL UPLOAD] No file in request");
      return res.status(400).json({ error: "No file uploaded" });
    }
    
    // Determine file type for URL path
    const fileType = req.file.mimetype.startsWith('video/') ? 'videos' : 
                     req.file.mimetype.startsWith('image/') ? 'images' : 'documents';
    
    // Build local URL
    const fileUrl = `/uploads/${fileType}/${req.file.filename}`;
    
    console.log("[LOCAL UPLOAD] File saved:", req.file.filename);
    console.log("[LOCAL UPLOAD] URL:", fileUrl);
    
    res.json({ 
      url: fileUrl, 
      public_id: req.file.filename,
      filename: req.file.filename,
      type: req.file.mimetype,
      size: req.file.size,
      resource_type: req.file.mimetype.startsWith('video/') ? 'video' : 'image'
    });
  } catch (err) {
    console.error("[LOCAL UPLOAD] Error:", err);
    res.status(500).json({ error: "Upload failed: " + err.message });
  }
});

// Bulk PDF upload - creates a module with each PDF as a step
app.post('/api/teacher/upload-module-pdfs', authenticateToken, upload.array('pdfs', 50), async (req, res) => {
  try {
    console.log("[BULK PDF UPLOAD] Request received");
    
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "No PDF files uploaded" });
    }
    
    const { section, sections, subject, topic } = req.body;
    const teacherId = req.user.id;
    
    const subjectResult = requireText(subject, 'Subject', 60);
    if (subjectResult.error) return res.status(400).json({ error: subjectResult.error });
    const topicResult = requireText(topic, 'Module topic/title', 100);
    if (topicResult.error) return res.status(400).json({ error: topicResult.error });
    const sectionResult = normalizeSectionList(sections, section);
    if (sectionResult.error) return res.status(400).json({ error: sectionResult.error });
    const cleanSubject = subjectResult.value;
    const cleanTopic = topicResult.value;
    const targetSections = sectionResult.value;
    
    // Validate all files are PDFs
    const nonPdfFiles = req.files.filter(f => f.mimetype !== 'application/pdf');
    if (nonPdfFiles.length > 0) {
      return res.status(400).json({ error: `Only PDF files allowed. Found: ${nonPdfFiles.map(f => f.originalname).join(', ')}` });
    }
    
    // Create steps from PDFs
    const steps = req.files.map((file, index) => {
      const fileUrl = `/uploads/documents/${file.filename}`;
      // Use original filename (without extension) as step header
      const stepHeader = cleanText(file.originalname.replace(/\.pdf$/i, ''), 100) || `Step ${index + 1}`;
      
      return {
        type: 'pdf',
        header: stepHeader,
        data: {
          url: fileUrl,
          filename: file.originalname,
          size: file.size
        }
      };
    });
    
    console.log(`[BULK PDF UPLOAD] Created ${steps.length} steps from PDFs`);
    
    // Get teacher name
    const teacherResult = await pool.query('SELECT name FROM teachers WHERE id = $1', [teacherId]);
    const teacherName = teacherResult.rows[0]?.name || 'Unknown';
    
    // Insert module
    const query = `
      INSERT INTO modules (section, sections, subject, topic_title, teacher_id, teacher_name, step_count, steps) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
      RETURNING id
    `;
    const values = [
      targetSections[0], 
      JSON.stringify(targetSections), 
      cleanSubject, 
      cleanTopic, 
      teacherId, 
      teacherName, 
      steps.length, 
      JSON.stringify(steps)
    ];
    
    const result = await pool.query(query, values);
    const moduleId = result.rows[0].id;
    
    console.log(`[BULK PDF UPLOAD] Module created with ID: ${moduleId}`);
    
    // Send notifications (non-blocking)
    try {
      const sectionPlaceholders = targetSections.map((_, i) => `$${i + 1}`).join(', ');
      const sectionStudentsResult = await pool.query(
        `SELECT DISTINCT id, name, email FROM students 
         WHERE LOWER(class_dept || ' ' || section) IN (${sectionPlaceholders})`,
        targetSections.map(s => s.toLowerCase())
      );
      const uniqueStudents = sectionStudentsResult.rows;

      for (const student of uniqueStudents) {
        await pool.query(`
          INSERT INTO in_app_notifications 
          (recipient_type, recipient_id, type, title, message, link, metadata, created_at)
          VALUES ('student', $1, 'module_published', $2, $3, $4, $5, CURRENT_TIMESTAMP)
        `, [
          student.id,
          'New Module Available',
          `${teacherName} published "${cleanTopic}" with ${steps.length} PDF documents. Start learning now!`,
          `/learning/${moduleId}`,
          JSON.stringify({
            module_id: moduleId,
            module_title: cleanTopic,
            teacher_name: teacherName,
            sections: targetSections,
            subject: cleanSubject,
            step_count: steps.length,
            content_type: 'pdf'
          })
        ]);
      }
      console.log(`[BULK PDF UPLOAD] Created notifications for ${uniqueStudents.length} students`);
    } catch (notifErr) {
      console.error('[BULK PDF UPLOAD] Notification error (non-blocking):', notifErr);
    }
    
    // Invalidate cache
    for (const sec of targetSections) {
      cache.invalidate(`modules_section_${sec.toLowerCase()}`);
    }
    
    res.status(201).json({ 
      success: true, 
      moduleId, 
      sections: targetSections,
      pdfCount: steps.length,
      message: `Module created with ${steps.length} PDF documents`
    });
  } catch (err) {
    console.error("[BULK PDF UPLOAD] Error:", err);
    res.status(500).json({ error: "Failed to upload PDFs: " + err.message });
  }
});

// Mixed media upload - PDFs and videos together, auto-routed to correct step types
app.post('/api/teacher/upload-module-mixed', authenticateToken, bulkUpload.array('files', 200), async (req, res) => {
  try {
    console.log("[MIXED MEDIA UPLOAD] Request received");
    
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "No files uploaded" });
    }
    
    const { section, sections, subject, topic, stepCount } = req.body;
    const teacherId = req.user.id;
    
    const subjectResult = requireText(subject, 'Subject', 60);
    if (subjectResult.error) return res.status(400).json({ error: subjectResult.error });
    const topicResult = requireText(topic, 'Module topic/title', 100);
    if (topicResult.error) return res.status(400).json({ error: topicResult.error });
    const sectionResult = normalizeSectionList(sections, section);
    if (sectionResult.error) return res.status(400).json({ error: sectionResult.error });
    const cleanSubject = subjectResult.value;
    const cleanTopic = topicResult.value;
    const targetSections = sectionResult.value;
    
    // Separate files by type and get custom step names
    const pdfFiles = [];
    const videoFiles = [];
    const unsupportedFiles = [];
    
    req.files.forEach((file, index) => {
      const stepName = cleanText(req.body[`stepName_${index}`] || file.originalname.replace(/\.(pdf|mp4|webm|ogg|mov|avi|mkv)$/i, ''), 100) || `Step ${index + 1}`;
      
      if (file.mimetype === 'application/pdf') {
        pdfFiles.push({ file, stepName });
      } else if (file.mimetype.startsWith('video/')) {
        videoFiles.push({ file, stepName });
      } else {
        unsupportedFiles.push(file);
      }
    });
    
    if (unsupportedFiles.length > 0) {
      return res.status(400).json({ 
        error: `Only PDF and video files allowed. Unsupported files: ${unsupportedFiles.map(f => f.originalname).join(', ')}` 
      });
    }
    
    // Create steps from files with custom names
    const steps = [];
    
    // Add PDF steps
    pdfFiles.forEach(({ file, stepName }) => {
      const fileUrl = `/uploads/documents/${file.filename}`;
      
      steps.push({
        type: 'pdf',
        header: stepName,
        data: {
          url: fileUrl,
          filename: file.originalname,
          size: file.size
        }
      });
    });
    
    // Add video steps
    videoFiles.forEach(({ file, stepName }) => {
      const fileUrl = `/uploads/videos/${file.filename}`;
      
      steps.push({
        type: 'video',
        header: stepName,
        data: fileUrl
      });
    });
    
    if (steps.length === 0) {
      return res.status(400).json({ error: "No valid PDF or video files found" });
    }
    
    console.log(`[MIXED MEDIA UPLOAD] Created ${steps.length} steps (${pdfFiles.length} PDFs, ${videoFiles.length} videos)`);
    
    // Get teacher name
    const teacherResult = await pool.query('SELECT name FROM teachers WHERE id = $1', [teacherId]);
    const teacherName = teacherResult.rows[0]?.name || 'Unknown';
    
    // Insert module
    const query = `
      INSERT INTO modules (section, sections, subject, topic_title, teacher_id, teacher_name, step_count, steps) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
      RETURNING id
    `;
    const values = [
      targetSections[0], 
      JSON.stringify(targetSections), 
      cleanSubject, 
      cleanTopic, 
      teacherId, 
      teacherName, 
      steps.length, 
      JSON.stringify(steps)
    ];
    
    const result = await pool.query(query, values);
    const moduleId = result.rows[0].id;
    
    console.log(`[MIXED MEDIA UPLOAD] Module created with ID: ${moduleId}`);
    
    // Send notifications (non-blocking)
    try {
      const sectionPlaceholders = targetSections.map((_, i) => `$${i + 1}`).join(', ');
      const sectionStudentsResult = await pool.query(
        `SELECT DISTINCT id, name, email FROM students 
         WHERE LOWER(class_dept || ' ' || section) IN (${sectionPlaceholders})`,
        targetSections.map(s => s.toLowerCase())
      );
      const uniqueStudents = sectionStudentsResult.rows;

      for (const student of uniqueStudents) {
        await pool.query(`
          INSERT INTO in_app_notifications 
          (recipient_type, recipient_id, type, title, message, link, metadata, created_at)
          VALUES ('student', $1, 'module_published', $2, $3, $4, $5, CURRENT_TIMESTAMP)
        `, [
          student.id,
          'New Module Available',
          `${teacherName} published "${cleanTopic}" with ${pdfFiles.length} PDFs and ${videoFiles.length} videos. Start learning now!`,
          `/learning/${moduleId}`,
          JSON.stringify({
            module_id: moduleId,
            module_title: cleanTopic,
            teacher_name: teacherName,
            sections: targetSections,
            subject: cleanSubject,
            step_count: steps.length,
            pdf_count: pdfFiles.length,
            video_count: videoFiles.length,
            content_type: 'mixed'
          })
        ]);
      }
      console.log(`[MIXED MEDIA UPLOAD] Created notifications for ${uniqueStudents.length} students`);
    } catch (notifErr) {
      console.error('[MIXED MEDIA UPLOAD] Notification error (non-blocking):', notifErr);
    }
    
    // Invalidate cache
    for (const sec of targetSections) {
      cache.invalidate(`modules_section_${sec.toLowerCase()}`);
    }
    
    res.status(201).json({ 
      success: true, 
      moduleId, 
      sections: targetSections,
      pdfCount: pdfFiles.length,
      videoCount: videoFiles.length,
      totalSteps: steps.length,
      message: `Module created with ${pdfFiles.length} PDFs and ${videoFiles.length} videos`
    });
  } catch (err) {
    console.error("[MIXED MEDIA UPLOAD] Error:", err);
    res.status(500).json({ error: "Failed to upload files: " + err.message });
  }
});

// Video streaming endpoint with range support for large files
app.get('/api/videos/stream/:filename', (req, res) => {
  const { filename } = req.params;
  localStorageService.streamVideo(req, res, filename);
});

// Get disk usage statistics (admin only)
app.get('/api/storage/stats', authenticateToken, adminOnly, async (req, res) => {
  try {
    const stats = await localStorageService.getDiskUsage();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List uploaded files (admin only)
app.get('/api/storage/files/:type', authenticateToken, adminOnly, async (req, res) => {
  try {
    const { type } = req.params;
    const files = await localStorageService.listFiles(type);
    res.json(files);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete file (admin only)
app.delete('/api/storage/files/:type/:filename', authenticateToken, adminOnly, async (req, res) => {
  try {
    const { type, filename } = req.params;
    await localStorageService.deleteFile(filename, type);
    res.json({ success: true, message: 'File deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// FETCH INDIVIDUAL STUDENT PROFILE
// FETCH STUDENT PROFILE WITH PHOTO
app.get('/api/student/profile', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, reg_no, class_dept, section, media, totp_enabled FROM students WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: "Student not found" });

    const student = result.rows[0];
    
    // Get module progress
    const progressResult = await pool.query(
      'SELECT * FROM v_student_module_progress WHERE student_id = $1',
      [req.user.id]
    );
    
    const moduleProgress = progressResult.rows[0] || {
      total_modules: 0,
      completed_modules: 0,
      completion_percentage: 0
    };
    
    // Extract the image URL if it exists, otherwise provide a null
    const profilePic = student.media && student.media.url ? student.media.url : null;

    res.json({
      ...student,
      profilePic,
      progress: {
        modulesFinished: moduleProgress.completed_modules,
        totalModules: moduleProgress.total_modules,
        wellbeingScore: Math.round(moduleProgress.completion_percentage)
      }
    });
  } catch (err) {
    console.error("Student Profile Error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// GET STUDENT RECENT MODULES
app.get('/api/student/recent-modules', authenticateToken, async (req, res) => {
  try {
    const studentResult = await pool.query(
      'SELECT class_dept, section FROM students WHERE id = $1',
      [req.user.id]
    );
    
    if (studentResult.rows.length === 0) {
      return res.status(404).json({ error: "Student not found" });
    }
    
    const { class_dept, section } = studentResult.rows[0];
    const fullSection = `${class_dept} ${section}`.toUpperCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
    
    // Get modules for student's section with accurate progress
    const modulesResult = await pool.query(`
      SELECT m.id, m.topic_title, m.section, m.subject, m.created_at, m.step_count,
        COALESCE(
          (SELECT COUNT(*) * 100.0 / NULLIF(m.step_count, 0) 
           FROM module_completion mc 
           WHERE mc.module_id = m.id AND mc.student_id = $1 AND mc.is_completed = true), 
          0
        ) as progress,
        COALESCE(
          (SELECT MAX(mc.step_index) FROM module_completion mc 
           WHERE mc.module_id = m.id AND mc.student_id = $1), 
          -1
        )::int as last_step_index
      FROM modules m 
      WHERE UPPER(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(m.section, '[-_]', ' ', 'g'), ' +', ' ', 'g'))) = $2
         OR EXISTS (
           SELECT 1 FROM jsonb_array_elements_text(COALESCE(m.sections, '[]'::jsonb)) AS s
           WHERE UPPER(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(s, '[-_]', ' ', 'g'), ' +', ' ', 'g'))) = $2
         )
      ORDER BY m.created_at DESC 
      LIMIT 5
    `, [req.user.id, fullSection]);
    
    res.json(modulesResult.rows);
  } catch (err) {
    console.error("Recent modules error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// GET STUDENT STATS
app.get('/api/student/stats', authenticateToken, async (req, res) => {
  try {
    const studentResult = await pool.query(
      'SELECT class_dept, section FROM students WHERE id = $1',
      [req.user.id]
    );
    
    if (studentResult.rows.length === 0) {
      return res.status(404).json({ error: "Student not found" });
    }
    
    const { class_dept, section } = studentResult.rows[0];
    const fullSection = `${class_dept} ${section}`.toUpperCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
    
    // Get total modules for section (check both section column and sections JSONB)
    const totalResult = await pool.query(
      `SELECT COUNT(*) as total FROM modules WHERE 
        UPPER(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(section, '[-_]', ' ', 'g'), ' +', ' ', 'g'))) = $1
        OR EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(COALESCE(sections, '[]'::jsonb)) AS s
          WHERE UPPER(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(s, '[-_]', ' ', 'g'), ' +', ' ', 'g'))) = $1
        )`,
      [fullSection]
    );
    
    // Get completed modules (all steps completed)
    const completedResult = await pool.query(`
      SELECT COUNT(DISTINCT m.id) as completed
      FROM modules m
      WHERE (
        UPPER(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(m.section, '[-_]', ' ', 'g'), ' +', ' ', 'g'))) = $1
        OR EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(COALESCE(m.sections, '[]'::jsonb)) AS s
          WHERE UPPER(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(s, '[-_]', ' ', 'g'), ' +', ' ', 'g'))) = $1
        )
      )
      AND m.step_count > 0
      AND NOT EXISTS (
        SELECT 1 FROM generate_series(0, m.step_count - 1) s(n)
        WHERE NOT EXISTS (
          SELECT 1 FROM module_completion mc 
          WHERE mc.module_id = m.id AND mc.student_id = $2 AND mc.step_index = s.n AND mc.is_completed = true
        )
      )
    `, [fullSection, req.user.id]);
    
    // Calculate streak (consecutive days with activity from today backwards)
    const streakResult = await pool.query(`
      WITH activity_dates AS (
        SELECT DISTINCT DATE(completed_at) as activity_date
        FROM module_completion
        WHERE student_id = $1 AND is_completed = true
        UNION
        SELECT DISTINCT study_date as activity_date
        FROM daily_study_time
        WHERE student_id = $1 AND total_seconds > 0
      ),
      streak_calc AS (
        SELECT activity_date,
               activity_date - (ROW_NUMBER() OVER (ORDER BY activity_date DESC))::int as streak_group
        FROM activity_dates
        WHERE activity_date <= CURRENT_DATE
      )
      SELECT COUNT(*) as streak
      FROM streak_calc
      WHERE streak_group = (
        SELECT streak_group FROM streak_calc WHERE activity_date = CURRENT_DATE
        UNION ALL
        SELECT streak_group FROM streak_calc WHERE activity_date = CURRENT_DATE - 1
        LIMIT 1
      )
    `, [req.user.id]);
    
    res.json({
      modulesCompleted: parseInt(completedResult.rows[0]?.completed || 0),
      totalModules: parseInt(totalResult.rows[0]?.total || 0),
      streak: parseInt(streakResult.rows[0]?.streak || 0)
    });
  } catch (err) {
    console.error("Student stats error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// --- ROUTES: MODULE MANAGEMENT ---

// 10. Teacher: Upload/Publish New Module
app.post('/api/teacher/upload-module', authenticateToken, async (req, res) => {
  try {
    const { section, sections, subject, topic, topic_title, steps } = req.body;
    const teacherId = req.user.id;

    const subjectResult = requireText(subject, 'Subject', 60);
    if (subjectResult.error) return res.status(400).json({ error: subjectResult.error });
    const topicResult = requireText(topic || topic_title, 'Topic title', 100);
    if (topicResult.error) return res.status(400).json({ error: topicResult.error });
    const sectionResult = normalizeSectionList(sections, section);
    if (sectionResult.error) return res.status(400).json({ error: sectionResult.error });
    const stepsResult = validateModuleSteps(steps);
    if (stepsResult.error) return res.status(400).json({ error: stepsResult.error });

    const cleanSubject = subjectResult.value;
    const cleanTopic = topicResult.value;
    const targetSections = sectionResult.value;
    const cleanSteps = stepsResult.value;

    // Get teacher name for display
    const teacherResult = await pool.query('SELECT name FROM teachers WHERE id = $1', [teacherId]);
    const teacherName = teacherResult.rows[0]?.name || 'Unknown';

    // Insert module with steps as JSONB - store first section in 'section' for backwards compatibility
    // and all sections in 'sections' JSONB array
    const query = `
      INSERT INTO modules (section, sections, subject, topic_title, teacher_id, teacher_name, step_count, steps) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
      RETURNING id
    `;
    const values = [targetSections[0], JSON.stringify(targetSections), cleanSubject, cleanTopic, teacherId, teacherName, cleanSteps.length, JSON.stringify(cleanSteps)];
    
    const result = await pool.query(query, values);
    const moduleId = result.rows[0].id;
    
    // NOTIFICATION: Send to all students in ALL target sections
    // Step 1: Create in-app notifications first (independent of email)
    try {
      const sectionPlaceholders = targetSections.map((_, i) => `$${i + 1}`).join(', ');
      const sectionStudentsResult = await pool.query(
        `SELECT DISTINCT id, name, email FROM students 
         WHERE LOWER(class_dept || ' ' || section) IN (${sectionPlaceholders})`,
        targetSections.map(s => s.toLowerCase())
      );
      const uniqueStudents = sectionStudentsResult.rows;

      for (const student of uniqueStudents) {
        await pool.query(`
          INSERT INTO in_app_notifications 
          (recipient_type, recipient_id, type, title, message, link, metadata, created_at)
          VALUES ('student', $1, 'module_published', $2, $3, $4, $5, CURRENT_TIMESTAMP)
        `, [
          student.id,
          'New Module Available',
          `${teacherName} published "${cleanTopic}". Start learning now!`,
          `/learning/${moduleId}`,
          JSON.stringify({
            module_id: moduleId,
            module_title: cleanTopic,
            teacher_name: teacherName,
            sections: targetSections,
            subject: cleanSubject,
            step_count: cleanSteps.length
          })
        ]);
      }
      console.log(`Created in-app notifications for ${uniqueStudents.length} students across ${targetSections.length} sections`);

      // Step 2: Try email notifications separately (non-blocking)
      try {
        const emailStudents = uniqueStudents.map(s => ({ id: s.id, type: 'student', email: s.email, name: s.name }));
        await notificationService.sendBatchEmails(
          'MODULE_PUBLISHED',
          emailStudents,
          (student) => ({
            student_name: student.name,
            section: targetSections.join(', '),
            topic_title: cleanTopic,
            subject: cleanSubject,
            teacher_name: teacherName,
            step_count: cleanSteps.length
          }),
          { module_id: moduleId, teacher_id: teacherId }
        );
      } catch (emailErr) {
        console.error('Email notification error (non-blocking):', emailErr.message);
      }
    } catch (notifErr) {
      console.error('Notification error (non-blocking):', notifErr);
    }
    
    // Invalidate cache for all target sections
    for (const sec of targetSections) {
      cache.invalidate(`modules_section_${sec.toLowerCase()}`);
    }
    
    res.status(201).json({ success: true, moduleId, sections: targetSections });
  } catch (err) {
    console.error("Module Upload Error:", err);
    res.status(500).json({ error: "Failed to publish module: " + err.message });
  }
});

// 11. Teacher: Fetch Modules for a Section (only shows teacher's own modules)
app.get('/api/teacher/modules/:section', authenticateToken, async (req, res) => {
  try {
    const section = req.params.section;
    const teacherId = req.user.id;
    
    // Match against either the legacy 'section' column OR the 'sections' JSONB array
    // ONLY return modules created by THIS teacher
    const result = await pool.query(
      `SELECT id, topic_title, section, sections, subject, teacher_name, step_count, created_at 
       FROM modules 
       WHERE teacher_id = $3 
         AND (LOWER(section) = LOWER($1) OR sections @> $2::jsonb)
       ORDER BY created_at DESC`,
      [section, JSON.stringify([section]), teacherId]
    );
    
    res.json(result.rows);
  } catch (err) {
    console.error("Fetch Modules Error:", err);
    res.status(500).json({ error: "Failed to load modules" });
  }
});

// 11a. Teacher: Fetch ALL modules created by this teacher (regardless of section)
app.get('/api/teacher/my-modules', authenticateToken, async (req, res) => {
  try {
    const teacherId = req.user.id;
    
    const result = await pool.query(
      `SELECT id, topic_title, section, sections, subject, teacher_name, step_count, created_at 
       FROM modules 
       WHERE teacher_id = $1 
       ORDER BY created_at DESC`,
      [teacherId]
    );
    
    res.json(result.rows);
  } catch (err) {
    console.error("Fetch My Modules Error:", err);
    res.status(500).json({ error: "Failed to load your modules" });
  }
});

// 11b. Teacher: Get Single Module (for editing)
app.get('/api/teacher/module/:moduleId', authenticateToken, async (req, res) => {
  try {
    const moduleId = req.params.moduleId;
    const teacherId = req.user.id;
    
    const result = await pool.query(
      'SELECT * FROM modules WHERE id = $1 AND teacher_id = $2',
      [moduleId, teacherId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Module not found" });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Fetch Module Error:", err);
    res.status(500).json({ error: "Failed to load module" });
  }
});

// 11c. Teacher: Update/Edit Module (supports multiple sections)
app.put('/api/teacher/module/:moduleId', authenticateToken, async (req, res) => {
  try {
    const moduleId = req.params.moduleId;
    const { topic, topic_title, subject, steps, section, sections } = req.body;
    const teacherId = req.user.id;

    if (!isPositiveInt(moduleId)) {
      return res.status(400).json({ error: 'Invalid module ID' });
    }

    const topicResult = requireText(topic || topic_title, 'Topic title', 100);
    if (topicResult.error) return res.status(400).json({ error: topicResult.error });
    const subjectResult = requireText(subject, 'Subject', 60);
    if (subjectResult.error) return res.status(400).json({ error: subjectResult.error });
    const stepsResult = validateModuleSteps(steps);
    if (stepsResult.error) return res.status(400).json({ error: stepsResult.error });
    
    // Verify teacher owns this module
    const checkOwner = await pool.query(
      'SELECT id, section, sections FROM modules WHERE id = $1 AND teacher_id = $2',
      [moduleId, teacherId]
    );
    
    if (checkOwner.rows.length === 0) {
      return res.status(403).json({ error: "Not authorized to edit this module" });
    }
    
    const sectionResult = normalizeSectionList(sections, section || checkOwner.rows[0].section);
    if (sectionResult.error) return res.status(400).json({ error: sectionResult.error });

    const sectionsArray = sectionResult.value;
    const cleanSteps = stepsResult.value;
    
    // Update module with sections support
    const query = `
      UPDATE modules 
      SET topic_title = $1, 
          subject = $2, 
          steps = $3, 
          step_count = $4, 
          section = $5,
          sections = $6
      WHERE id = $7
      RETURNING id
    `;
    const primarySection = sectionsArray.length > 0 ? sectionsArray[0] : (section || '');
    const params = [topicResult.value, subjectResult.value, JSON.stringify(cleanSteps), cleanSteps.length, primarySection, JSON.stringify(sectionsArray), moduleId];
    
    await pool.query(query, params);

    const oldSections = parseMaybeJsonArray(checkOwner.rows[0].sections);
    if (oldSections.length === 0 && checkOwner.rows[0].section) oldSections.push(checkOwner.rows[0].section);
    [...new Set([...oldSections, ...sectionsArray])].forEach((s) => cache.invalidate(`modules_section_${String(s).toLowerCase()}`));

    res.json({ success: true, message: "Module updated successfully", sections: sectionsArray });
  } catch (err) {
    console.error("Module Update Error:", err);
    res.status(500).json({ error: "Failed to update module: " + err.message });
  }
});

// 11c2. Teacher: Update Module Sections (supports multiple sections)
app.put('/api/teacher/module/:moduleId/section', authenticateToken, async (req, res) => {
  try {
    const moduleId = req.params.moduleId;
    const { section, sections } = req.body;
    const teacherId = req.user.id;
    
    if (!isPositiveInt(moduleId)) {
      return res.status(400).json({ error: 'Invalid module ID' });
    }

    // Verify teacher owns this module
    const checkOwner = await pool.query(
      'SELECT id FROM modules WHERE id = $1 AND teacher_id = $2',
      [moduleId, teacherId]
    );
    
    if (checkOwner.rows.length === 0) {
      return res.status(403).json({ error: "Not authorized to edit this module" });
    }
    
    const sectionResult = normalizeSectionList(sections, section);
    if (sectionResult.error) return res.status(400).json({ error: sectionResult.error });
    
    const sectionsArray = sectionResult.value;
    const primarySection = sectionsArray[0];
    
    await pool.query(
      'UPDATE modules SET section = $1, sections = $2 WHERE id = $3', 
      [primarySection, JSON.stringify(sectionsArray), moduleId]
    );
    
    // Invalidate cache for all affected sections
    sectionsArray.forEach(s => {
      cache.invalidate(`modules_section_${s.toLowerCase()}`);
    });
    
    res.json({ success: true, message: `Module sections updated to: ${sectionsArray.join(', ')}`, sections: sectionsArray });
  } catch (err) {
    console.error("Module Section Update Error:", err);
    res.status(500).json({ error: "Failed to update module section" });
  }
});

// 11d. Teacher: Delete Module
app.delete('/api/teacher/module/:moduleId', authenticateToken, async (req, res) => {
  try {
    const moduleId = req.params.moduleId;
    const teacherId = req.user.id;
    
    // Verify teacher owns this module
    const checkOwner = await pool.query(
      'SELECT id FROM modules WHERE id = $1 AND teacher_id = $2',
      [moduleId, teacherId]
    );
    
    if (checkOwner.rows.length === 0) {
      return res.status(403).json({ error: "Not authorized to delete this module" });
    }
    
    // Delete module
    await pool.query('DELETE FROM modules WHERE id = $1', [moduleId]);
    res.json({ success: true, message: "Module deleted successfully" });
  } catch (err) {
    console.error("Module Delete Error:", err);
    res.status(500).json({ error: "Failed to delete module: " + err.message });
  }
});

// 12. Student: Fetch My Modules (Based on Student's Section - supports multi-section modules)
app.get('/api/student/my-modules', authenticateToken, async (req, res) => {
  try {
    const studentId = req.user.id;
    
    // Get student's section
    const studentResult = await pool.query(
      'SELECT class_dept, section FROM students WHERE id = $1',
      [studentId]
    );
    
    if (studentResult.rows.length === 0) {
      return res.status(404).json({ error: "Student not found" });
    }
    
    const { class_dept, section } = studentResult.rows[0];
    // Normalize section: uppercase, replace hyphens/underscores with space, single spaces, trim
    const fullSection = `${class_dept} ${section}`.toUpperCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
    const cacheKey = `modules_section_${fullSection.toLowerCase()}`;
    
    console.log('[Student Modules] Looking for modules in section:', fullSection);
    
    // Check cache first
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }
    
    // Fetch modules for this section - check both old 'section' column AND new 'sections' JSONB array
    // Handle "CSE A", "CSE-A", "cse a", double spaces, etc.
    // Also include per-module completion progress for the current student
    const modulesResult = await pool.query(
      `SELECT m.id, m.topic_title, m.section, m.sections, m.subject, m.teacher_name, m.step_count, m.created_at,
        COALESCE(
          (SELECT COUNT(*) FROM module_completion mc 
           WHERE mc.module_id = m.id AND mc.student_id = $2 AND mc.is_completed = true), 
          0
        )::int as completed_steps,
        COALESCE(
          (SELECT MAX(mc.step_index) FROM module_completion mc 
           WHERE mc.module_id = m.id AND mc.student_id = $2), 
          -1
        )::int as last_step_index
       FROM modules m
       WHERE UPPER(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(m.section, '[-_]', ' ', 'g'), ' +', ' ', 'g'))) = $1
          OR EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(COALESCE(m.sections, '[]'::jsonb)) AS s 
            WHERE UPPER(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(s, '[-_]', ' ', 'g'), ' +', ' ', 'g'))) = $1
          )
       ORDER BY m.created_at DESC`,
      [fullSection, studentId]
    );
    
    console.log('[Student Modules] Found modules:', modulesResult.rows.length);
    
    // Don't cache since results include per-student progress
    res.json(modulesResult.rows);
  } catch (err) {
    console.error("Student Modules Error:", err);
    res.status(500).json({ error: "Failed to load your modules" });
  }
});

// 13. Student: Fetch Specific Module Content (All Steps)
app.get('/api/student/module/:moduleId', authenticateToken, async (req, res) => {
  try {
    const moduleId = req.params.moduleId;
    if (!isPositiveInt(moduleId)) return res.status(400).json({ error: 'Invalid module ID' });
    const studentId = req.user.id;

    // Verify student has access to this module's section
    const studentResult = await pool.query('SELECT class_dept, section FROM students WHERE id = $1', [studentId]);
    if (studentResult.rows.length === 0) return res.status(404).json({ error: 'Student not found' });
    const { class_dept, section } = studentResult.rows[0];
    const studentSection = `${class_dept} ${section}`.toUpperCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
    
    const result = await pool.query(
      `SELECT id, topic_title, subject, teacher_name, steps FROM modules WHERE id = $1 AND (
        UPPER(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(section, '[-_]', ' ', 'g'), ' +', ' ', 'g'))) = $2
        OR section = 'ALL'
        OR EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(COALESCE(sections, '[]'::jsonb)) AS s
          WHERE UPPER(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(s, '[-_]', ' ', 'g'), ' +', ' ', 'g'))) = $2
        )
      )`,
      [moduleId, studentSection]
    );
    
    if (result.rows.length === 0) return res.status(404).json({ error: "Module not found" });
    
    // Get completion status for all steps
    const completionResult = await pool.query(
      'SELECT step_index FROM module_completion WHERE module_id = $1 AND student_id = $2 AND is_completed = TRUE',
      [moduleId, studentId]
    );
    
    const completedSteps = completionResult.rows.map(row => row.step_index);
    
    // Log module access for teacher analytics
    await pool.query('SELECT track_module_access($1, $2)', [studentId, moduleId]);
    
    const steps = result.rows[0].steps;
    
    // Format steps for the frontend
    // Handle both old format (title/content) and new format (header/data)
    const formattedSteps = steps.map((step, index) => ({
      id: index + 1,
      module_id: result.rows[0].id,
      topic_title: result.rows[0].topic_title,
      subject: result.rows[0].subject,
      teacher_name: result.rows[0].teacher_name,
      step_type: step.type, // 'video', 'text', 'mcq', 'coding', 'jitsi', 'code', 'quiz', 'pdf'
      step_header: step.header || step.title, // Support both formats
      content: step.type === 'video' ? (step.data || step.content) : 
               step.type === 'text' ? (step.data || step.content) : 
               step.type === 'code' ? (step.data || step.content) :
               null, // For video URLs and text content
      mcq_data: step.type === 'mcq' ? (step.data || step.content) :
                step.type === 'quiz' ? (step.data || step.content) :
                step.type === 'coding' ? (step.data || step.content) :
                step.type === 'jitsi' ? (step.data || step.content) :
                step.type === 'pdf' ? (step.data || step.content) :
                null, // For structured data (MCQ, coding problems, jitsi, pdf)
      is_completed: completedSteps.includes(index)
    }));
    
    console.log("Formatted steps for student:", formattedSteps);
    
    res.json(formattedSteps);
  } catch (err) {
    res.status(500).json({ error: "Failed to load module content" });
  }
});

// 13b. Student: Mark Step/Module as Complete
app.post('/api/student/module/:moduleId/complete', authenticateToken, async (req, res) => {
  try {
    const moduleId = req.params.moduleId;
    if (!isPositiveInt(moduleId)) return res.status(400).json({ error: 'Invalid moduleId' });
    const studentId = req.user.id;
    const { stepIndex } = req.body;
    
    if (stepIndex !== undefined) {
      // Validate stepIndex is a non-negative integer within bounds
      const idx = parseInt(stepIndex, 10);
      if (!Number.isFinite(idx) || idx < 0 || idx > 200) {
        return res.status(400).json({ error: 'stepIndex must be a non-negative integer (max 200)' });
      }
      // Mark specific step as complete
      await pool.query(`
        INSERT INTO module_completion (module_id, student_id, step_index, is_completed)
        VALUES ($1, $2, $3, TRUE)
        ON CONFLICT (module_id, student_id, step_index)
        DO UPDATE SET is_completed = TRUE, completed_at = CURRENT_TIMESTAMP
      `, [moduleId, studentId, idx]);
      
      // Check if all steps are now complete
      const moduleQuery = await pool.query('SELECT step_count FROM modules WHERE id = $1', [moduleId]);
      const totalSteps = moduleQuery.rows[0]?.step_count || 0;
      
      const completedQuery = await pool.query(
        'SELECT COUNT(*) as completed FROM module_completion WHERE module_id = $1 AND student_id = $2 AND is_completed = TRUE',
        [moduleId, studentId]
      );
      const completedSteps = parseInt(completedQuery.rows[0]?.completed || 0);
      
      if (completedSteps >= totalSteps) {
        // All steps complete - mark entire module as complete
        await pool.query('SELECT mark_module_complete($1, $2)', [studentId, moduleId]);
        
        // Send notification to teacher about student completion
        try {
          // Get module and student info
          const moduleInfo = await pool.query(
            'SELECT m.topic_title, m.section, m.teacher_id, m.step_count FROM modules m WHERE m.id = $1',
            [moduleId]
          );
          
          const studentInfo = await pool.query(
            'SELECT name, reg_no FROM students WHERE id = $1',
            [studentId]
          );
          
          if (moduleInfo.rows.length > 0 && studentInfo.rows.length > 0) {
            const module = moduleInfo.rows[0];
            const student = studentInfo.rows[0];
            
            // Create in-app notification for teacher first
            await pool.query(`
              INSERT INTO in_app_notifications 
              (recipient_type, recipient_id, type, title, message, metadata, created_at)
              VALUES ('teacher', $1, 'module_completion', $2, $3, $4, CURRENT_TIMESTAMP)
            `, [
              module.teacher_id,
              'Student Completed Module',
              `${student.name} has completed the module "${module.topic_title}" with all ${module.step_count} steps.`,
              JSON.stringify({
                student_id: studentId,
                student_name: student.name,
                module_id: moduleId,
                module_title: module.topic_title,
                section: module.section
              })
            ]);

            // Also create achievement notification for the student
            await pool.query(`
              INSERT INTO in_app_notifications 
              (recipient_type, recipient_id, type, title, message, metadata, created_at)
              VALUES ('student', $1, 'module_achievement', $2, $3, $4, CURRENT_TIMESTAMP)
            `, [
              studentId,
              'Module Completed!',
              `Congratulations! You completed "${module.topic_title}" with all ${module.step_count} steps.`,
              JSON.stringify({
                module_id: moduleId,
                module_title: module.topic_title,
                section: module.section,
                completion_time: new Date().toISOString(),
                steps_completed: module.step_count
              })
            ]);
            
            // Try email separately (non-blocking)
            try {
              const teacher = await notificationService.getTeacherById(module.teacher_id);
              if (teacher) {
                await notificationService.sendEmail(
                  'MODULE_COMPLETED_BY_STUDENT',
                  teacher,
                  {
                    teacher_name: teacher.name,
                    student_name: student.name,
                    student_reg_no: student.reg_no,
                    module_title: module.topic_title,
                    section: module.section,
                    total_steps: module.step_count,
                    completion_time: new Date().toLocaleString()
                  }
                );
                console.log(`[OK] Sent module completion notification to teacher ${teacher.name}`);
              }
            } catch (emailErr) {
              console.error('Module completion email error (non-blocking):', emailErr.message);
            }
          }
        } catch (notifErr) {
          console.error('Failed to send teacher notification:', notifErr);
          // Don't fail the completion if notification fails
        }
        
        res.json({ success: true, message: "Module completed!", allComplete: true });
      } else {
        res.json({ success: true, message: "Step marked as complete", progress: completedSteps / totalSteps });
      }
    } else {
      // Mark entire module as complete
      await pool.query('SELECT mark_module_complete($1, $2)', [studentId, moduleId]);
      
      // Send notification to teacher about student completion
      try {
        // Get module and student info
        const moduleInfo = await pool.query(
          'SELECT m.topic_title, m.section, m.teacher_id, m.step_count FROM modules m WHERE m.id = $1',
          [moduleId]
        );
        
        const studentInfo = await pool.query(
          'SELECT name, reg_no FROM students WHERE id = $1',
          [studentId]
        );
        
        if (moduleInfo.rows.length > 0 && studentInfo.rows.length > 0) {
          const module = moduleInfo.rows[0];
          const student = studentInfo.rows[0];
          
          // Create in-app notification for teacher first
          await pool.query(`
            INSERT INTO in_app_notifications 
            (recipient_type, recipient_id, type, title, message, metadata, created_at)
            VALUES ('teacher', $1, 'module_completion', $2, $3, $4, CURRENT_TIMESTAMP)
          `, [
            module.teacher_id,
            'Student Completed Module',
            `${student.name} has completed the module "${module.topic_title}" with all ${module.step_count} steps.`,
            JSON.stringify({
              student_id: studentId,
              student_name: student.name,
              module_id: moduleId,
              module_title: module.topic_title,
              section: module.section
            })
          ]);

          // Also create achievement notification for the student
          await pool.query(`
            INSERT INTO in_app_notifications 
            (recipient_type, recipient_id, type, title, message, metadata, created_at)
            VALUES ('student', $1, 'module_achievement', $2, $3, $4, CURRENT_TIMESTAMP)
          `, [
            studentId,
            'Module Completed!',
            `Congratulations! You completed "${module.topic_title}" with all ${module.step_count} steps.`,
            JSON.stringify({
              module_id: moduleId,
              module_title: module.topic_title,
              section: module.section,
              completion_time: new Date().toISOString(),
              steps_completed: module.step_count
            })
          ]);
            
          // Try email separately (non-blocking)
          try {
            const teacher = await notificationService.getTeacherById(module.teacher_id);
            if (teacher) {
              await notificationService.sendEmail(
                'MODULE_COMPLETED_BY_STUDENT',
                teacher,
                {
                  teacher_name: teacher.name,
                  student_name: student.name,
                  student_reg_no: student.reg_no,
                  module_title: module.topic_title,
                  section: module.section,
                  total_steps: module.step_count,
                  completion_time: new Date().toLocaleString()
                }
              );
              console.log(`[OK] Sent module completion notification to teacher ${teacher.name}`);
            }
          } catch (emailErr) {
            console.error('Module completion email error (non-blocking):', emailErr.message);
          }
        }
      } catch (notifErr) {
        console.error('Failed to send teacher notification:', notifErr);
        // Don't fail the completion if notification fails
      }
      
      res.json({ success: true, message: "Module marked as complete" });
    }
  } catch (err) {
    console.error("Mark Complete Error:", err);
    res.status(500).json({ error: "Failed to mark module complete" });
  }
});

// 13c. Student: Time Tracking Endpoints
app.post('/api/student/start-session', authenticateToken, async (req, res) => {
  try {
    const studentId = req.user.id;
    const today = new Date().toISOString().split('T')[0];
    
    await pool.query(`
      INSERT INTO daily_study_time (student_id, study_date, session_start, last_activity)
      VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (student_id, study_date)
      DO UPDATE SET session_start = CURRENT_TIMESTAMP, last_activity = CURRENT_TIMESTAMP
    `, [studentId, today]);
    
    res.json({ success: true, message: 'Session started' });
  } catch (err) {
    console.error('Start session error:', err);
    res.status(500).json({ error: 'Failed to start session' });
  }
});

app.post('/api/student/update-time', authenticateToken, async (req, res) => {
  try {
    const studentId = req.user.id;
    const { seconds } = req.body;

    // Validate and cap seconds to prevent abuse
    const secs = parseInt(seconds, 10);
    if (!Number.isFinite(secs) || secs < 1 || secs > 3600) {
      return res.status(400).json({ error: 'seconds must be between 1 and 3600' });
    }
    const today = new Date().toISOString().split('T')[0];
    
    await pool.query(`
      INSERT INTO daily_study_time (student_id, study_date, total_seconds, last_activity)
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
      ON CONFLICT (student_id, study_date)
      DO UPDATE SET 
        total_seconds = LEAST(daily_study_time.total_seconds + $3, 86400),
        last_activity = CURRENT_TIMESTAMP
    `, [studentId, today, secs]);
    
    res.json({ success: true, message: 'Time updated' });
  } catch (err) {
    console.error('Update time error:', err);
    res.status(500).json({ error: 'Failed to update time' });
  }
});

app.get('/api/student/daily-time', authenticateToken, async (req, res) => {
  try {
    const studentId = req.user.id;
    const today = new Date().toISOString().split('T')[0];
    
    const result = await pool.query(
      'SELECT total_seconds, session_start FROM daily_study_time WHERE student_id = $1 AND study_date = $2',
      [studentId, today]
    );
    
    const data = result.rows[0] || { total_seconds: 0, session_start: null };
    res.json(data);
  } catch (err) {
    console.error('Get daily time error:', err);
    res.status(500).json({ error: 'Failed to get daily time' });
  }
});

// 13d. Student: Get My Module Progress
app.get('/api/student/module-progress', authenticateToken, async (req, res) => {
  try {
    const studentId = req.user.id;
    
    const result = await pool.query(
      'SELECT * FROM v_student_module_progress WHERE student_id = $1',
      [studentId]
    );
    
    if (result.rows.length === 0) {
      return res.json({
        total_modules: 0,
        completed_modules: 0,
        pending_modules: 0,
        completion_percentage: 0
      });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Module Progress Error:", err);
    res.status(500).json({ error: "Failed to load module progress" });
  }
});

// 13d. Teacher: Get Module Statistics
app.get('/api/teacher/module/:moduleId/statistics', authenticateToken, async (req, res) => {
  try {
    const moduleId = req.params.moduleId;
    const teacherId = req.user.id;
    if (req.user.role !== 'teacher' && req.user.role !== 'admin') {
      return res.status(403).json({ error: "Teacher access required" });
    }
    if (!isPositiveInt(moduleId)) {
      return res.status(400).json({ error: 'Invalid module ID' });
    }

    if (req.user.role === 'teacher') {
      const owner = await pool.query('SELECT id FROM modules WHERE id = $1 AND teacher_id = $2', [moduleId, teacherId]);
      if (owner.rows.length === 0) {
        return res.status(403).json({ error: "Not authorized to view this module's statistics" });
      }
    }
    
    const result = await pool.query(
      'SELECT * FROM v_module_statistics WHERE module_id = $1',
      [moduleId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Module not found" });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Module Statistics Error:", err);
    res.status(500).json({ error: "Failed to load module statistics" });
  }
});

// 13e. Teacher: Get Coding Submissions Dashboard
app.get('/api/teacher/coding-submissions', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'teacher') {
      return res.status(403).json({ error: "Teacher access required" });
    }
    const teacherId = req.user.id;
    
    // Get all coding submissions for modules created by this teacher
    const result = await pool.query(
      `SELECT 
        ss.id as submission_id,
        ss.student_id,
        s.name as student_name,
        s.email as student_email,
        s.class_dept || ' ' || s.section as section,
        m.id as module_id,
        m.topic_title,
        m.subject,
        ss.language,
        ss.test_cases_passed,
        ss.total_test_cases,
        ss.score,
        ss.submitted_at
       FROM student_submissions ss
       JOIN students s ON ss.student_id = s.id
       JOIN modules m ON ss.module_id = m.id
       WHERE m.teacher_id = $1
       ORDER BY ss.submitted_at DESC`,
      [teacherId]
    );
    
    res.json(result.rows);
  } catch (err) {
    console.error("Teacher Coding Submissions Error:", err);
    res.status(500).json({ error: "Failed to load coding submissions" });
  }
});

// 13f. Teacher: Get Coding Submissions for a Module
app.get('/api/teacher/module/:moduleId/coding-submissions', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'teacher') {
      return res.status(403).json({ error: "Teacher access required" });
    }
    const teacherId = req.user.id;
    const moduleId = req.params.moduleId;
    
    // Verify teacher owns this module
    const checkOwner = await pool.query(
      'SELECT id FROM modules WHERE id = $1 AND teacher_id = $2',
      [moduleId, teacherId]
    );
    
    if (checkOwner.rows.length === 0) {
      return res.status(403).json({ error: "Not authorized to view this module's submissions" });
    }
    
    const result = await pool.query(
      `SELECT 
        ss.id as submission_id,
        ss.student_id,
        s.name as student_name,
        s.email as student_email,
        s.class_dept || ' ' || s.section as section,
        ss.language,
        ss.submitted_code,
        ss.test_cases_passed,
        ss.total_test_cases,
        ss.score,
        ss.submitted_at
       FROM student_submissions ss
       JOIN students s ON ss.student_id = s.id
       WHERE ss.module_id = $1
       ORDER BY ss.submitted_at DESC`,
      [moduleId]
    );
    
    res.json(result.rows);
  } catch (err) {
    console.error("Module Coding Submissions Error:", err);
    res.status(500).json({ error: "Failed to load module submissions" });
  }
});

// NEW ENDPOINT: Execute code without saving (for "Run" button)
app.post('/api/student/execute-code', authenticateToken, codeExecutionLimiter, async (req, res) => {
    try {
        const { code, language, stdin } = req.body;

        // Validate inputs
        if (!code || typeof code !== 'string' || code.trim().length === 0) {
            return res.status(400).json({ error: 'Code is required' });
        }
        if (code.length > MAX_CODE_SIZE) {
            return res.status(400).json({ error: `Code too large (max ${MAX_CODE_SIZE} chars)` });
        }
        const lang = (language || 'python').toLowerCase();
        if (!VALID_LANGUAGES.includes(lang)) {
            return res.status(400).json({ error: `Unsupported language. Use: ${VALID_LANGUAGES.join(', ')}` });
        }
        if (stdin && typeof stdin !== 'string') {
            return res.status(400).json({ error: 'stdin must be a string' });
        }

        const result = await executeCode(code, lang, stdin || '');
        
        res.json({
            success: !result.error,
            output: result.stdout || '',
            stderr: result.stderr || '',
            error: result.error
        });

    } catch (err) {
        console.error("CODE EXECUTION ERROR:", err.message);
        res.status(500).json({ error: "Execution failed" });
    }
});

app.post('/api/student/submit-code', authenticateToken, codeExecutionLimiter, async (req, res) => {
    try {
        const { moduleId, code, language, testCases } = req.body;
        const studentId = req.user.id;
        const studentEmail = req.user.email;

        // Validate inputs
        if (!moduleId || !isPositiveInt(moduleId)) {
            return res.status(400).json({ error: 'Valid moduleId is required' });
        }
        if (!code || typeof code !== 'string' || code.trim().length === 0) {
            return res.status(400).json({ error: 'Code is required' });
        }
        if (code.length > MAX_CODE_SIZE) {
            return res.status(400).json({ error: `Code too large (max ${MAX_CODE_SIZE} chars)` });
        }
        const lang = (language || 'python').toLowerCase();
        if (!VALID_LANGUAGES.includes(lang)) {
            return res.status(400).json({ error: `Unsupported language. Use: ${VALID_LANGUAGES.join(', ')}` });
        }
        if (!testCases || !Array.isArray(testCases) || testCases.length === 0) {
            return res.status(400).json({ error: "No test cases provided." });
        }
        if (testCases.length > MAX_TEST_CASES) {
            return res.status(400).json({ error: `Too many test cases (max ${MAX_TEST_CASES})` });
        }

        // Verify student has access to this module's section and fetch limits
        const accessCheck = await pool.query(
          `SELECT m.id, m.steps FROM modules m
           JOIN students s ON s.id = $2
           WHERE m.id = $1 AND (
             UPPER(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(m.section, '[-_]', ' ', 'g'), ' +', ' ', 'g'))) =
               UPPER(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(s.class_dept || ' ' || s.section, '[-_]', ' ', 'g'), ' +', ' ', 'g')))
             OR EXISTS (
               SELECT 1 FROM jsonb_array_elements_text(COALESCE(m.sections, '[]'::jsonb)) AS sec
               WHERE UPPER(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(sec, '[-_]', ' ', 'g'), ' +', ' ', 'g'))) =
                 UPPER(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(s.class_dept || ' ' || s.section, '[-_]', ' ', 'g'), ' +', ' ', 'g')))
             )
           )`,
          [moduleId, studentId]
        );
        if (accessCheck.rows.length === 0) {
            return res.status(403).json({ error: 'You do not have access to this module' });
        }

        // Extract per-module time/memory limits set by the teacher
        let execLimits = {};
        try {
            const steps = JSON.parse(accessCheck.rows[0].steps || '[]');
            for (const step of steps) {
                if (step.timeLimit || step.memoryLimit) {
                    execLimits = { timeoutMs: step.timeLimit, memoryMb: step.memoryLimit };
                    break;
                }
            }
        } catch (_) { /* use defaults if steps unparseable */ }

        let passedCount = 0;

        // --- EVALUATION LOOP ---
        for (const tc of testCases) {
            if (!tc || typeof tc.expected !== 'string') continue;
            const result = await executeCode(code, lang, tc.input || '', execLimits);
            const actualOutput = (result.stdout || "").trim();
            
            if (actualOutput === tc.expected.trim()) {
                passedCount++;
            }
        }

        // --- CALCULATION ---
        const totalCases = testCases.length;
        const finalScore = ((passedCount / totalCases) * 100).toFixed(2);

        // --- DATABASE STORAGE ---
        const query = `
            INSERT INTO student_submissions 
            (student_id, student_email, module_id, submitted_code, language, test_cases_passed, total_test_cases, score) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
            RETURNING score, test_cases_passed, total_test_cases;
        `;
        
        const values = [studentId, studentEmail, moduleId, code, language, passedCount, totalCases, finalScore];
        const dbResult = await pool.query(query, values);

        // --- RESPONSE FOR POPUP ---
        res.json({ 
            success: true, 
            score: dbResult.rows[0].score, 
            passed: dbResult.rows[0].test_cases_passed, 
            total: dbResult.rows[0].total_test_cases 
        });

    } catch (err) {
        console.error("SERVER ERROR:", err.message);
        res.status(500).json({ error: "Internal Server Error: " + err.message });
    }
});

// 13e. Teacher: Get Student's Module Progress
app.get('/api/teacher/student/:studentId/module-progress', authenticateToken, async (req, res) => {
  try {
    const studentId = req.params.studentId;
    if (req.user.role !== 'teacher') {
      return res.status(403).json({ error: "Teacher access required" });
    }
    if (!isPositiveInt(studentId)) {
      return res.status(400).json({ error: 'Invalid student ID' });
    }
    if (!(await teacherCanAccessStudent(req.user.id, studentId))) {
      return res.status(403).json({ error: "Not authorized to view this student's module progress" });
    }
    
    const result = await pool.query(
      'SELECT * FROM v_student_module_progress WHERE student_id = $1',
      [studentId]
    );
    
    if (result.rows.length === 0) {
      return res.json({
        total_modules: 0,
        completed_modules: 0,
        pending_modules: 0,
        completion_percentage: 0
      });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Student Module Progress Error:", err);
    res.status(500).json({ error: "Failed to load student module progress" });
  }
});

// --- ROUTES: MCQ TEST SYSTEM ---

// 14. Teacher: Create MCQ Test (supports multiple sections)
app.post('/api/teacher/test/create', authenticateToken, async (req, res) => {
  try {
    const { section, sections, title, description, questions, start_date, deadline } = req.body;
    const teacher_id = req.user.id;
    const cleanTitle = typeof title === 'string' ? title.trim() : '';
    const cleanDescription = typeof description === 'string' ? description.trim() : '';
    
    if (!cleanTitle) {
      return res.status(400).json({ error: "Test title is required" });
    }
    if (cleanTitle.length > 200) {
      return res.status(400).json({ error: "Test title too long (max 200 characters)" });
    }
    let cleanQuestions;
    try {
      const questionResult = validateMcqQuestions(questions);
      if (questionResult.error) return res.status(400).json({ error: questionResult.error });
      cleanQuestions = questionResult.value;
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
    if (!deadline) {
      return res.status(400).json({ error: "Deadline is required" });
    }
    const startDate = start_date ? new Date(start_date) : new Date();
    const deadlineDate = new Date(deadline);
    if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(deadlineDate.getTime())) {
      return res.status(400).json({ error: "Invalid start date or deadline" });
    }
    if (startDate.getTime() < Date.now() - 60000 || deadlineDate.getTime() < Date.now() - 60000) {
      return res.status(400).json({ error: "Start date and deadline cannot be in the past" });
    }
    if (deadlineDate <= startDate) {
      return res.status(400).json({ error: "Deadline must be after start date" });
    }

    const sectionResult = normalizeSectionList(sections, section);
    if (sectionResult.error) return res.status(400).json({ error: sectionResult.error });
    const targetSections = sectionResult.value;
    
    // Get teacher name
    const teacherResult = await pool.query('SELECT name FROM teachers WHERE id = $1', [teacher_id]);
    const teacher_name = teacherResult.rows[0]?.name || 'Unknown';
    
    // Insert test with sections JSONB array
    const query = `
      INSERT INTO mcq_tests (teacher_id, teacher_name, section, sections, title, description, questions, total_questions, start_date, deadline)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;
    
    const result = await pool.query(query, [
      teacher_id, teacher_name, targetSections[0], JSON.stringify(targetSections), cleanTitle, cleanDescription,
      JSON.stringify(cleanQuestions), cleanQuestions.length, startDate.toISOString(), deadlineDate.toISOString()
    ]);
    
    const test = result.rows[0];
    
    // NOTIFICATION: Send to all students in ALL target sections
    // Step 1: Create in-app notifications first (independent of email)
    try {
      const sectionPlaceholders = targetSections.map((_, i) => `$${i + 1}`).join(', ');
      const sectionStudentsResult = await pool.query(
        `SELECT DISTINCT id, name, email FROM students 
         WHERE LOWER(class_dept || ' ' || section) IN (${sectionPlaceholders})`,
        targetSections.map(s => s.toLowerCase())
      );
      const uniqueStudents = sectionStudentsResult.rows;

      for (const student of uniqueStudents) {
        await pool.query(`
          INSERT INTO in_app_notifications 
          (recipient_type, recipient_id, type, title, message, link, metadata, created_at)
          VALUES ('student', $1, 'test_assigned', $2, $3, $4, $5, CURRENT_TIMESTAMP)
        `, [
          student.id,
          'New Test Assigned',
          `Test "${cleanTitle}" assigned by ${teacher_name}. Due: ${new Date(deadline).toLocaleDateString()}`,
          `/test`,
          JSON.stringify({
            test_id: test.id,
            test_title: cleanTitle,
            teacher_name: teacher_name,
            sections: targetSections,
            start_date: start_date,
            deadline: deadline,
            total_questions: cleanQuestions.length
          })
        ]);
      }
      console.log(`[OK] Created in-app TEST_ASSIGNED notifications for ${uniqueStudents.length} students`);

      // Step 2: Try email notifications separately (non-blocking)
      try {
        const emailStudents = uniqueStudents.map(s => ({ id: s.id, type: 'student', email: s.email, name: s.name }));
        await notificationService.sendBatchEmails(
          'TEST_ASSIGNED',
          emailStudents,
          (student) => ({
            student_name: student.name,
            section: targetSections.join(', '),
            test_title: cleanTitle,
            description: cleanDescription,
            total_questions: cleanQuestions.length,
            start_date: startDate.toISOString(),
            deadline: deadlineDate.toISOString()
          }),
          { test_id: test.id, teacher_id: teacher_id }
        );
      } catch (emailErr) {
        console.error('Email notification error (non-blocking):', emailErr.message);
      }
    } catch (notifErr) {
      console.error('Notification error (non-blocking):', notifErr);
    }
    
    res.status(201).json({ success: true, test, sections: targetSections });
  } catch (err) {
    console.error("Test Creation Error:", err);
    if (err.code === '23514' && err.constraint === 'chk_title_length') {
      return res.status(400).json({ error: "Test title is required and must be 200 characters or fewer" });
    }
    res.status(500).json({ error: "Failed to create test: " + err.message });
  }
});

// 15. Teacher: Get All Tests for Section (supports sections JSONB array)
// FIX: Only show tests created by THIS teacher (teacher isolation)
app.get('/api/teacher/tests/:section', authenticateToken, async (req, res) => {
  try {
    const section = req.params.section;
    const teacherId = req.user.id;
    
    // Direct query that handles both single section column and sections JSONB array
    const result = await pool.query(
      `SELECT t.id as test_id, t.title, t.section, t.sections, t.teacher_id, t.teacher_name,
        t.total_questions, t.start_date, t.deadline, t.created_at, t.is_active,
        COALESCE((SELECT COUNT(*) FROM test_submissions WHERE test_id = t.id), 0)::int as total_submissions,
        COALESCE((SELECT ROUND(AVG(percentage)::numeric, 2) FROM test_submissions WHERE test_id = t.id), 0) as average_score,
        COALESCE((SELECT COUNT(*) FROM test_submissions WHERE test_id = t.id AND percentage >= 50), 0)::int as passed_count
       FROM mcq_tests t
       WHERE (LOWER(t.section) = LOWER($1) OR t.sections @> $3::jsonb) AND t.teacher_id = $2
       ORDER BY t.deadline DESC`,
      [section, teacherId, JSON.stringify([section])]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Fetch Tests Error:", err);
    res.status(500).json({ error: "Failed to load tests" });
  }
});

// 16. Teacher: Get Test Submissions (who submitted)
app.get('/api/teacher/test/:testId/submissions', authenticateToken, async (req, res) => {
  try {
    const test_id = req.params.testId;
    
    const result = await pool.query(
      `SELECT 
        id, student_name, student_reg_no, score, percentage, status, submitted_at, time_taken
       FROM test_submissions
       WHERE test_id = $1
       ORDER BY submitted_at DESC`,
      [test_id]
    );
    
    res.json(result.rows);
  } catch (err) {
    console.error("Fetch Submissions Error:", err);
    res.status(500).json({ error: "Failed to load submissions" });
  }
});

// 16b. Teacher: Update MCQ Test (supports multiple sections)
app.put('/api/teacher/test/:testId', authenticateToken, async (req, res) => {
  try {
    const testId = req.params.testId;
    const { title, description, questions, section, sections, start_date, deadline } = req.body;
    const teacherId = req.user.id;

    if (!isPositiveInt(testId)) {
      return res.status(400).json({ error: 'Invalid test ID' });
    }
    const cleanTitle = cleanText(title, 200);
    if (!cleanTitle) return res.status(400).json({ error: 'Test title is required' });
    const cleanDescription = cleanText(description || '', 2000);
    let cleanQuestions;
    try {
      const questionResult = validateMcqQuestions(questions);
      if (questionResult.error) return res.status(400).json({ error: questionResult.error });
      cleanQuestions = questionResult.value;
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
    const startDate = start_date ? new Date(start_date) : new Date();
    const deadlineDate = new Date(deadline);
    if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(deadlineDate.getTime())) {
      return res.status(400).json({ error: 'Invalid start date or deadline' });
    }
    if (startDate.getTime() < Date.now() - 60000 || deadlineDate.getTime() < Date.now() - 60000) {
      return res.status(400).json({ error: 'Start date and deadline cannot be in the past' });
    }
    if (deadlineDate <= startDate) {
      return res.status(400).json({ error: 'Deadline must be after start date' });
    }
    
    // Verify teacher owns this test
    const checkOwner = await pool.query(
      'SELECT id FROM mcq_tests WHERE id = $1 AND teacher_id = $2',
      [testId, teacherId]
    );
    
    if (checkOwner.rows.length === 0) {
      return res.status(403).json({ error: "Not authorized to edit this test" });
    }
    
    const sectionResult = normalizeSectionList(sections, section);
    if (sectionResult.error) return res.status(400).json({ error: sectionResult.error });
    
    const sectionsArray = sectionResult.value;
    const primarySection = sectionsArray[0];
    
    // Update test
    const query = `
      UPDATE mcq_tests 
      SET title = $1, 
          description = $2, 
          questions = $3, 
          total_questions = $4, 
          section = $5,
          sections = $6,
          start_date = $7,
          deadline = $8
      WHERE id = $9
      RETURNING id
    `;
    
    const params = [
      cleanTitle, 
      cleanDescription, 
      JSON.stringify(cleanQuestions), 
      cleanQuestions.length, 
      primarySection, 
      JSON.stringify(sectionsArray),
      startDate.toISOString(),
      deadlineDate.toISOString(),
      testId
    ];
    
    await pool.query(query, params);
    res.json({ success: true, message: "Test updated successfully", sections: sectionsArray });
  } catch (err) {
    console.error("Test Update Error:", err);
    res.status(500).json({ error: "Failed to update test: " + err.message });
  }
});

// 16c. Teacher: Update Test Sections Only (supports multiple sections)
app.put('/api/teacher/test/:testId/section', authenticateToken, async (req, res) => {
  try {
    const testId = req.params.testId;
    const { section, sections } = req.body;
    const teacherId = req.user.id;

    if (!isPositiveInt(testId)) {
      return res.status(400).json({ error: 'Invalid test ID' });
    }
    
    // Verify teacher owns this test
    const checkOwner = await pool.query(
      'SELECT id FROM mcq_tests WHERE id = $1 AND teacher_id = $2',
      [testId, teacherId]
    );
    
    if (checkOwner.rows.length === 0) {
      return res.status(403).json({ error: "Not authorized to edit this test" });
    }
    
    const sectionResult = normalizeSectionList(sections, section);
    if (sectionResult.error) return res.status(400).json({ error: sectionResult.error });
    const sectionsArray = sectionResult.value;
    const primarySection = sectionsArray[0];
    
    await pool.query(
      'UPDATE mcq_tests SET section = $1, sections = $2 WHERE id = $3', 
      [primarySection, JSON.stringify(sectionsArray), testId]
    );
    
    res.json({ success: true, message: `Test sections updated to: ${sectionsArray.join(', ')}`, sections: sectionsArray });
  } catch (err) {
    console.error("Test Section Update Error:", err);
    res.status(500).json({ error: "Failed to update test section" });
  }
});

// 16d. Teacher: Delete MCQ Test
app.delete('/api/teacher/test/:testId', authenticateToken, async (req, res) => {
  try {
    const testId = req.params.testId;
    const teacherId = req.user.id;
    
    // Verify teacher owns this test
    const checkOwner = await pool.query(
      'SELECT id FROM mcq_tests WHERE id = $1 AND teacher_id = $2',
      [testId, teacherId]
    );
    
    if (checkOwner.rows.length === 0) {
      return res.status(403).json({ error: "Not authorized to delete this test" });
    }
    
    // Delete test (cascades to submissions)
    await pool.query('DELETE FROM mcq_tests WHERE id = $1', [testId]);
    res.json({ success: true, message: "Test deleted successfully" });
  } catch (err) {
    console.error("Test Delete Error:", err);
    res.status(500).json({ error: "Failed to delete test: " + err.message });
  }
});

// 17. Teacher: Get Student's Detailed Progress
app.get('/api/teacher/student/:studentId/progress', authenticateToken, async (req, res) => {
  try {
    const student_id = req.params.studentId;
    if (req.user.role !== 'teacher') {
      return res.status(403).json({ error: "Teacher access required" });
    }
    if (!isPositiveInt(student_id)) {
      return res.status(400).json({ error: 'Invalid student ID' });
    }
    if (!(await teacherCanAccessStudent(req.user.id, student_id))) {
      return res.status(403).json({ error: "Not authorized to view this student's progress" });
    }
    
    // Get student basic info
    const studentResult = await pool.query(
      'SELECT * FROM v_student_test_progress WHERE student_id = $1',
      [student_id]
    );
    
    if (studentResult.rows.length === 0) {
      return res.status(404).json({ error: "Student not found" });
    }
    
    // Get detailed test history
    const testsResult = await pool.query(
      'SELECT * FROM get_student_detailed_progress($1)',
      [student_id]
    );
    
    res.json({
      student: studentResult.rows[0],
      tests: testsResult.rows
    });
  } catch (err) {
    console.error("Student Progress Error:", err);
    res.status(500).json({ error: "Failed to load student progress" });
  }
});

// 18. Student: Get My Tests (Pending & Completed) - Case-insensitive section matching, supports multi-section
app.get('/api/student/tests', authenticateToken, async (req, res) => {
  try {
    const student_id = req.user.id;
    
    // Get student's section
    const studentResult = await pool.query(
      'SELECT class_dept, section FROM students WHERE id = $1',
      [student_id]
    );
    
    if (studentResult.rows.length === 0) {
      return res.status(404).json({ error: "Student not found" });
    }
    
    const { class_dept, section } = studentResult.rows[0];
    // Normalize section: uppercase, replace hyphens/underscores with space, single spaces, trim
    const full_section = `${class_dept} ${section}`.toUpperCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
    
    console.log('[Student Tests] Looking for tests in section:', full_section);
    
    // Get all tests with submission status - check both 'section' column AND 'sections' JSONB array
    const result = await pool.query(
      `SELECT 
        t.id,
        t.title,
        t.description,
        t.total_questions,
        t.deadline,
        t.teacher_name,
        t.section,
        t.sections,
        sub.id as submission_id,
        sub.score,
        sub.percentage,
        sub.status,
        sub.submitted_at,
        CASE 
          WHEN sub.id IS NULL THEN 'pending'
          ELSE 'completed'
        END as completion_status,
        CASE 
          WHEN t.deadline < CURRENT_TIMESTAMP AND sub.id IS NULL THEN true
          ELSE false
        END as is_overdue
       FROM mcq_tests t
       LEFT JOIN test_submissions sub ON t.id = sub.test_id AND sub.student_id = $1
       WHERE t.is_active = true 
         AND (
           UPPER(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(t.section, '[-_]', ' ', 'g'), ' +', ' ', 'g'))) = $2
           OR EXISTS (
             SELECT 1 FROM jsonb_array_elements_text(COALESCE(t.sections, '[]'::jsonb)) AS s 
             WHERE UPPER(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(s, '[-_]', ' ', 'g'), ' +', ' ', 'g'))) = $2
           )
         )
       ORDER BY t.deadline ASC`,
      [student_id, full_section]
    );
    
    console.log('[Student Tests] Found tests:', result.rows.length);
    res.json(result.rows);
  } catch (err) {
    console.error("Student Tests Error:", err);
    res.status(500).json({ error: "Failed to load tests" });
  }
});

// 19. Student: Get Test to Take
app.get('/api/student/test/:testId', authenticateToken, async (req, res) => {
  try {
    const test_id = req.params.testId;
    const student_id = req.user.id;
    
    // Check if already submitted
    const submissionCheck = await pool.query(
      'SELECT id FROM test_submissions WHERE test_id = $1 AND student_id = $2',
      [test_id, student_id]
    );
    
    if (submissionCheck.rows.length > 0) {
      return res.status(400).json({ error: "Test already submitted" });
    }
    
    // Get test details
    const result = await pool.query(
      'SELECT id, title, description, questions, total_questions, deadline FROM mcq_tests WHERE id = $1 AND is_active = true',
      [test_id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Test not found" });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Test Details Error:", err);
    res.status(500).json({ error: "Failed to load test" });
  }
});

// 20. Student: Submit Test
app.post('/api/student/test/submit', authenticateToken, async (req, res) => {
  try {
    const { test_id, answers, time_taken } = req.body;
    const student_id = req.user.id;
    
    // Get student info
    const studentResult = await pool.query(
      'SELECT name, reg_no FROM students WHERE id = $1',
      [student_id]
    );
    
    if (studentResult.rows.length === 0) {
      return res.status(404).json({ error: "Student not found" });
    }
    
    const { name, reg_no } = studentResult.rows[0];
    
    // Get test questions to calculate score
    const testResult = await pool.query(
      'SELECT questions, total_questions, deadline FROM mcq_tests WHERE id = $1',
      [test_id]
    );
    
    if (testResult.rows.length === 0) {
      return res.status(404).json({ error: "Test not found" });
    }
    
    const { questions, total_questions, deadline } = testResult.rows[0];
    const parsedQuestions = parseMaybeJson(questions, []);
    const submittedAnswers = parseMaybeJson(answers, {});
    if (!Array.isArray(parsedQuestions) || parsedQuestions.length === 0) {
      return res.status(400).json({ error: "Test has no valid questions" });
    }
    if (!submittedAnswers || typeof submittedAnswers !== 'object' || Array.isArray(submittedAnswers)) {
      return res.status(400).json({ error: "Answers must be an object keyed by question number" });
    }
    
    // CALCULATE SCORE IN BACKEND (more reliable than SQL trigger)
    let correct_count = 0;
    
    for (let i = 0; i < parsedQuestions.length; i++) {
      const question = parsedQuestions[i];
      const studentAnswer = submittedAnswers[i.toString()]; // answers is {"0": "A", "1": "B", ...}
      // Support both 'correct' and 'correctAnswer' field names
      const correctAnswer = question.correct !== undefined ? question.correct : question.correctAnswer;

      // Compare as numbers or strings (case-insensitive for strings)
      const studentVal = typeof studentAnswer === 'number' ? studentAnswer : String(studentAnswer || '').toUpperCase().trim();
      const correctVal = typeof correctAnswer === 'number' ? correctAnswer : String(correctAnswer || '').toUpperCase().trim();
      
      if (studentVal === correctVal) {
        correct_count++;
      }
    }
    
    const score = correct_count;
    const totalQuestions = Number(total_questions) || parsedQuestions.length;
    const percentage = totalQuestions > 0 ? ((correct_count / totalQuestions) * 100).toFixed(2) : 0;
    
    // Check if late submission
    const isLate = new Date() > new Date(deadline);
    const status = isLate ? 'late' : 'completed';
    
    // Insert submission with calculated score
    const query = `
      INSERT INTO test_submissions (test_id, student_id, student_name, student_reg_no, answers, score, percentage, status, time_taken)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;
    
    const result = await pool.query(query, [
      test_id, student_id, name, reg_no, JSON.stringify(answers), score, percentage, status, time_taken
    ]);
    
    const submission = result.rows[0];
    console.log("Submission saved:", submission);
    
    // NOTIFICATION 1: Notify teacher about submission
    try {
      const testInfo = await pool.query(
        'SELECT teacher_id, teacher_name, section, title FROM mcq_tests WHERE id = $1',
        [test_id]
      );
      
      if (testInfo.rows.length > 0) {
        const testData = testInfo.rows[0];
        const teacher = await notificationService.getTeacherById(testData.teacher_id);
        
        if (teacher) {
          await notificationService.sendEmail(
            'TEST_SUBMITTED',
            teacher,
            {
              teacher_name: teacher.name,
              student_name: name,
              student_reg_no: reg_no,
              test_title: testData.title,
              score: score,
              total_questions: total_questions,
              percentage: percentage,
              status: status,
              submitted_at: new Date().toISOString(),
              test_id: test_id
            },
            { test_id, student_id, submission_id: submission.id }
          );
          console.log(`[OK] Sent TEST_SUBMITTED notification to teacher ${teacher.name}`);
        }
      }
    } catch (notifErr) {
      console.error('Teacher notification error (non-blocking):', notifErr);
    }
    
    // NOTIFICATION 2: Notify student about grade
    try {
      const studentInfo = await pool.query(
        'SELECT email FROM students WHERE id = $1',
        [student_id]
      );
      
      const testInfo = await pool.query(
        'SELECT title FROM mcq_tests WHERE id = $1',
        [test_id]
      );
      
      if (studentInfo.rows.length > 0 && testInfo.rows.length > 0) {
        // Create in-app notification first (always works)
        await pool.query(`
          INSERT INTO in_app_notifications 
          (recipient_type, recipient_id, type, title, message, metadata, created_at)
          VALUES ('student', $1, 'grade_posted', $2, $3, $4, CURRENT_TIMESTAMP)
        `, [
          student_id,
          'Grade Posted',
          `Your grade for "${testInfo.rows[0].title}" is ready: ${score}/${total_questions} (${percentage}%)`,
          JSON.stringify({
            test_id: test_id,
            test_title: testInfo.rows[0].title,
            score: score,
            total_questions: total_questions,
            percentage: percentage,
            status: status,
            graded_at: new Date().toISOString()
          })
        ]);
        
        console.log(`Sent GRADE_POSTED notification to student ${name}`);

        // Try email separately (non-blocking)
        try {
          const student = {
            id: student_id,
            type: 'student',
            email: studentInfo.rows[0].email,
            name: name
          };
          await notificationService.sendEmail(
            'GRADE_POSTED',
            student,
            {
              student_name: name,
              test_title: testInfo.rows[0].title,
              score: score,
              total_questions: total_questions,
              percentage: percentage,
              status: status
            },
            { test_id, submission_id: submission.id }
          );
        } catch (emailErr) {
          console.error('Grade email notification error (non-blocking):', emailErr.message);
        }
      }
    } catch (notifErr) {
      console.error('Student grade notification error (non-blocking):', notifErr);
    }
    
    // Include total_questions in response for frontend display
    res.json({ 
      success: true, 
      submission: {
        ...submission,
        total_questions: total_questions
      }
    });
  } catch (err) {
    console.error("Test Submission Error:", err);
    res.status(500).json({ error: "Failed to submit test: " + err.message });
  }
});

// 21. Student: Get My Progress Overview
app.get('/api/student/progress', authenticateToken, async (req, res) => {
  try {
    const student_id = req.user.id;
    
    const result = await pool.query(
      'SELECT * FROM v_student_test_progress WHERE student_id = $1',
      [student_id]
    );
    
    if (result.rows.length === 0) {
      return res.json({
        total_tests_assigned: 0,
        tests_completed: 0,
        tests_overdue: 0,
        average_score: 0
      });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Progress Error:", err);
    res.status(500).json({ error: "Failed to load progress" });
  }
});

// --- ROUTES: CODING WORKBENCH ---

// ============================================================
// NOTIFICATION SYSTEM ENDPOINTS
// ============================================================

// Get user notification preferences
app.get('/api/notifications/preferences', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const userType = req.user.role;
    
    const result = await pool.query(
      `SELECT * FROM v_user_notification_settings 
       WHERE user_id = $1 AND user_type = $2
       ORDER BY category, event_name`,
      [userId, userType]
    );
    
    res.json(result.rows);
  } catch (err) {
    console.error('Get Notification Preferences Error:', err);
    res.status(500).json({ error: 'Failed to load notification preferences' });
  }
});

// Update notification preference
app.put('/api/notifications/preferences/:eventCode', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const userType = req.user.role;
    const eventCode = req.params.eventCode;
    const { email_enabled, sms_enabled } = req.body;
    
    const result = await pool.query(
      `INSERT INTO notification_preferences (user_id, user_type, event_code, email_enabled, sms_enabled)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, user_type, event_code) 
       DO UPDATE SET 
         email_enabled = EXCLUDED.email_enabled,
         sms_enabled = EXCLUDED.sms_enabled,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [userId, userType, eventCode, email_enabled, sms_enabled]
    );
    
    res.json({ success: true, preference: result.rows[0] });
  } catch (err) {
    console.error('Update Notification Preference Error:', err);
    res.status(500).json({ error: 'Failed to update notification preference' });
  }
});

// Get user notification history
app.get('/api/notifications/history', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const userType = req.user.role;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    
    const result = await pool.query(
      `SELECT * FROM v_recent_notifications 
       WHERE recipient_id = $1 AND recipient_type = $2
       ORDER BY created_at DESC
       LIMIT $3 OFFSET $4`,
      [userId, userType, limit, offset]
    );
    
    res.json(result.rows);
  } catch (err) {
    console.error('Get Notification History Error:', err);
    res.status(500).json({ error: 'Failed to load notification history' });
  }
});

// ============================================================
// IN-APP NOTIFICATIONS API
// ============================================================

// Get user's notification inbox
app.get('/api/notifications/inbox', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const userType = req.user.role;
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;

    // First check if table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'in_app_notifications'
      );
    `);
    
    if (!tableCheck.rows[0].exists) {
      console.log('[NOTIFICATIONS] in_app_notifications table does not exist, creating...');
      await pool.query(`
        CREATE TABLE IF NOT EXISTS in_app_notifications (
          id SERIAL PRIMARY KEY,
          recipient_type VARCHAR(20) NOT NULL,
          recipient_id INTEGER NOT NULL,
          type VARCHAR(50) NOT NULL DEFAULT 'general',
          title VARCHAR(255) NOT NULL,
          message TEXT,
          metadata JSONB DEFAULT '{}',
          link VARCHAR(255),
          action_url VARCHAR(255),
          is_read BOOLEAN DEFAULT false,
          read_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_inapp_recipient ON in_app_notifications(recipient_id, recipient_type);
        CREATE INDEX IF NOT EXISTS idx_inapp_unread ON in_app_notifications(recipient_id, recipient_type, is_read);
      `);
    }

    const result = await pool.query(
      `SELECT id, recipient_type, recipient_id, type as event_code, title, message, 
              COALESCE(link, action_url) as link, is_read, created_at, metadata
       FROM in_app_notifications 
       WHERE recipient_id = $1 AND recipient_type = $2
       ORDER BY created_at DESC
       LIMIT $3 OFFSET $4`,
      [userId, userType, limit, offset]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Get Inbox Error:', err);
    res.status(500).json({ error: 'Failed to load notifications' });
  }
});

// Get unread notification count
app.get('/api/notifications/unread-count', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const userType = req.user.role;

    const result = await pool.query(
      `SELECT COUNT(*) as count FROM in_app_notifications 
       WHERE recipient_id = $1 AND recipient_type = $2 AND is_read = false`,
      [userId, userType]
    );

    res.json({ count: parseInt(result.rows[0].count) });
  } catch (err) {
    console.error('Get Unread Count Error:', err);
    res.status(500).json({ error: 'Failed to get unread count' });
  }
});

// Mark single notification as read
app.patch('/api/notifications/:id/read', authenticateToken, async (req, res) => {
  try {
    const notificationId = req.params.id;
    const userId = req.user.id;
    const userType = req.user.role;

    await pool.query(
      `UPDATE in_app_notifications 
       SET is_read = true, read_at = NOW()
       WHERE id = $1 AND recipient_id = $2 AND recipient_type = $3`,
      [notificationId, userId, userType]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Mark Read Error:', err);
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

// Mark all notifications as read
app.patch('/api/notifications/read-all', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const userType = req.user.role;

    await pool.query(
      `UPDATE in_app_notifications 
       SET is_read = true, read_at = NOW()
       WHERE recipient_id = $1 AND recipient_type = $2 AND is_read = false`,
      [userId, userType]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Mark All Read Error:', err);
    res.status(500).json({ error: 'Failed to mark all as read' });
  }
});

// Get notification statistics (admin/teacher)
app.get('/api/notifications/stats', authenticateToken, async (req, res) => {
  try {
    // Only allow teachers and admins
    if (req.user.role !== 'admin' && req.user.role !== 'teacher') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    
    const result = await pool.query(
      `SELECT * FROM v_notification_stats 
       WHERE date >= CURRENT_DATE - INTERVAL '30 days'
       ORDER BY date DESC, event_code`
    );
    
    res.json(result.rows);
  } catch (err) {
    console.error('Get Notification Stats Error:', err);
    res.status(500).json({ error: 'Failed to load notification statistics' });
  }
});

// Manual test notification (development only)
if (process.env.ENABLE_DEV_ENDPOINTS === 'true' || process.env.NODE_ENV !== 'production') {
  app.post('/api/notifications/test', authenticateToken, async (req, res) => {
    try {
      const { eventCode, data } = req.body;
      
      const recipient = {
        id: req.user.id,
        type: req.user.role,
        email: req.user.email,
        name: req.user.name || 'User'
      };
      
      const result = await notificationService.sendEmail(eventCode, recipient, data, { test: true });
      res.json({ success: true, result });
    } catch (err) {
      console.error('Test Notification Error:', err);
      res.status(500).json({ error: err.message });
    }
  });
}

app.post('/api/reports', authenticateToken, async (req, res) => {
  try {
    const { targetType, targetId, reason, details, stepIndex } = req.body;
    const normalizedTargetType = cleanText(targetType, 40).toLowerCase();
    const cleanReason = cleanText(reason, 1000);
    const cleanDetails = cleanText(details, 1000);

    if (!REPORT_TARGET_TYPES.has(normalizedTargetType)) {
      return res.status(400).json({ error: 'Invalid report target type' });
    }
    if (!isPositiveInt(targetId)) {
      return res.status(400).json({ error: 'Invalid report target ID' });
    }
    if (!cleanReason) {
      return res.status(400).json({ error: 'Report reason is required' });
    }

    const numericTargetId = parseInt(targetId, 10);
    const context = {};

    if (normalizedTargetType === 'module') {
      if (req.user.role !== 'student') {
        return res.status(403).json({ error: 'Only students can report modules' });
      }
      const module = await getStudentAccessibleModule(req.user.id, numericTargetId);
      if (!module) {
        return res.status(404).json({ error: 'Module not found or not assigned to you' });
      }
      context.module = {
        id: module.id,
        title: module.topic_title,
        teacher_id: module.teacher_id,
        teacher_name: module.teacher_name,
        subject: module.subject,
        section: module.section,
        step_index: Number.isFinite(parseInt(stepIndex, 10)) ? parseInt(stepIndex, 10) : null
      };
    }

    if (normalizedTargetType === 'chat_message') {
      const messageResult = await pool.query(
        `SELECT cm.id, cm.room_id, cm.sender_id, cm.sender_role, cm.sender_name, cm.message, cm.created_at
         FROM chat_messages cm
         JOIN chat_participants cp ON cp.room_id = cm.room_id
         WHERE cm.id = $1
           AND cp.user_id = $2
           AND cp.user_role = $3
           AND cm.is_deleted = FALSE
         LIMIT 1`,
        [numericTargetId, req.user.id, req.user.role]
      );
      const message = messageResult.rows[0];
      if (!message) {
        return res.status(404).json({ error: 'Message not found or not visible to you' });
      }
      if (message.sender_id === req.user.id && message.sender_role === req.user.role) {
        return res.status(400).json({ error: 'You cannot report your own message' });
      }
      context.chat_message = {
        id: message.id,
        room_id: message.room_id,
        sender_id: message.sender_id,
        sender_role: message.sender_role,
        sender_name: message.sender_name,
        preview: cleanText(message.message, 500),
        created_at: message.created_at
      };
    }

    const result = await pool.query(
      `INSERT INTO content_reports
       (reporter_role, reporter_id, target_type, target_id, reason, details, target_context)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        req.user.role,
        req.user.id || 0,
        normalizedTargetType,
        numericTargetId,
        cleanReason,
        cleanDetails || null,
        JSON.stringify(context)
      ]
    );

    res.status(201).json({
      success: true,
      reportId: result.rows[0]?.id,
      created_at: result.rows[0]?.created_at
    });
  } catch (err) {
    console.error('Create content report error:', err);
    res.status(500).json({ error: 'Failed to submit report' });
  }
});

app.get('/api/admin/reports', authenticateToken, adminOnly, async (req, res) => {
  try {
    const status = cleanText(req.query.status || 'open', 20).toLowerCase();
    const limit = Math.min(Math.max(parseInt(req.query.limit || '100', 10) || 100, 1), 200);
    const params = [];
    let where = '';

    if (REPORT_STATUSES.has(status)) {
      params.push(status);
      where = 'WHERE status = $1';
    }

    params.push(limit);
    const result = await pool.query(
      `SELECT *
       FROM content_reports
       ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length}`,
      params
    );

    res.json(result.rows.map((row) => ({
      ...row,
      target_context: typeof row.target_context === 'string'
        ? (() => {
            try { return JSON.parse(row.target_context); } catch (_) { return {}; }
          })()
        : row.target_context
    })));
  } catch (err) {
    console.error('List reports error:', err);
    res.status(500).json({ error: 'Failed to load reports' });
  }
});

app.patch('/api/admin/reports/:reportId', authenticateToken, adminOnly, async (req, res) => {
  try {
    const reportId = req.params.reportId;
    const status = cleanText(req.body.status, 20).toLowerCase();

    if (!isPositiveInt(reportId)) {
      return res.status(400).json({ error: 'Invalid report ID' });
    }
    if (!REPORT_STATUSES.has(status)) {
      return res.status(400).json({ error: 'Invalid report status' });
    }

    const result = await pool.query(
      `UPDATE content_reports
       SET status = $1, reviewed_at = CURRENT_TIMESTAMP, reviewed_by = $2
       WHERE id = $3
       RETURNING *`,
      [status, req.user.email || 'admin', reportId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }

    res.json({ success: true, report: result.rows[0] });
  } catch (err) {
    console.error('Update report error:', err);
    res.status(500).json({ error: 'Failed to update report' });
  }
});

// Send deadline reminders for upcoming tests (can be called via cron job)
app.post('/api/admin/send-deadline-reminders', authenticateToken, async (req, res) => {
  try {
    // Check if user is admin (for security)
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Find tests with deadlines in next 24 hours that haven't been submitted
    const upcomingTests = await pool.query(`
      SELECT DISTINCT t.id, t.title, t.section, t.teacher_name, t.deadline, t.total_questions
      FROM mcq_tests t
      WHERE t.deadline > NOW() 
        AND t.deadline <= NOW() + INTERVAL '24 hours'
        AND t.is_active = true
    `);

    let remindersSent = 0;

    for (const test of upcomingTests.rows) {
      try {
        // Get students in this section who haven't submitted
        const students = await notificationService.getStudentsInSection(test.section, 'TEST_DEADLINE_REMINDER');
        
        // Filter out students who already submitted
        const unsubmittedStudents = [];
        for (const student of students) {
          const submissionCheck = await pool.query(
            'SELECT id FROM mcq_submissions WHERE test_id = $1 AND student_id = $2',
            [test.id, student.id]
          );
          if (submissionCheck.rows.length === 0) {
            unsubmittedStudents.push(student);
          }
        }

        if (unsubmittedStudents.length > 0) {
          // Send email reminders
          await notificationService.sendBatchEmails(
            'TEST_DEADLINE_REMINDER',
            unsubmittedStudents,
            (student) => ({
              student_name: student.name,
              test_title: test.title,
              teacher_name: test.teacher_name,
              section: test.section,
              deadline: new Date(test.deadline).toLocaleString(),
              hours_remaining: Math.ceil((new Date(test.deadline) - new Date()) / (1000 * 60 * 60)),
              total_questions: test.total_questions
            }),
            { test_id: test.id }
          );

          // Send in-app notifications
          for (const student of unsubmittedStudents) {
            await pool.query(`
              INSERT INTO in_app_notifications 
              (recipient_type, recipient_id, type, title, message, metadata, created_at)
              VALUES ('student', $1, 'test_deadline_reminder', $2, $3, $4, CURRENT_TIMESTAMP)
            `, [
              student.id,
              'Test Deadline Reminder',
              `"${test.title}" is due in ${Math.ceil((new Date(test.deadline) - new Date()) / (1000 * 60 * 60))} hours! Don't forget to submit.`,
              JSON.stringify({
                test_id: test.id,
                test_title: test.title,
                teacher_name: test.teacher_name,
                section: test.section,
                deadline: test.deadline,
                priority: 'high'
              })
            ]);
          }

          remindersSent += unsubmittedStudents.length;
          console.log(`[OK] Sent deadline reminders for "${test.title}" to ${unsubmittedStudents.length} students`);
        }
      } catch (testErr) {
        console.error(`Error sending reminders for test ${test.id}:`, testErr);
      }
    }

    res.json({ 
      success: true, 
      tests_processed: upcomingTests.rows.length,
      reminders_sent: remindersSent 
    });
  } catch (err) {
    console.error('Send Deadline Reminders Error:', err);
    res.status(500).json({ error: 'Failed to send deadline reminders' });
  }
});

// =============================================================================
// LIVE SESSIONS (JITSI) CALENDAR API
// =============================================================================

// Get scheduled live sessions for student
app.get('/api/student/live-sessions', authenticateToken, async (req, res) => {
  try {
    const studentId = req.user.id;
    
    // Get student's section
    const studentResult = await pool.query(
      'SELECT class_dept, section FROM students WHERE id = $1',
      [studentId]
    );
    
    if (studentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }
    
    const { class_dept, section } = studentResult.rows[0];
    const fullSection = `${class_dept} ${section}`;
    // Normalize for matching
    const normalizedSection = fullSection.toUpperCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
    
    // Get modules with jitsi steps - match multiple section formats
    // FIX: Use flexible matching to handle "CSE A", "CSE-A", "cse a", double spaces, etc.
    const result = await pool.query(`
      SELECT m.id as module_id, m.topic_title, m.teacher_name, m.section, m.subject, m.steps
      FROM modules m
      WHERE UPPER(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(m.section, '[-_]', ' ', 'g'), ' +', ' ', 'g'))) = $1
         OR EXISTS (
           SELECT 1 FROM jsonb_array_elements_text(COALESCE(m.sections, '[]'::jsonb)) AS s
           WHERE UPPER(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(s, '[-_]', ' ', 'g'), ' +', ' ', 'g'))) = $1
         )
      ORDER BY m.created_at DESC
    `, [normalizedSection]);
    
    // Extract jitsi sessions from modules
    const sessions = [];
    for (const module of result.rows) {
      if (module.steps && Array.isArray(module.steps)) {
        module.steps.forEach((step, index) => {
          if (step.type === 'jitsi' && step.data) {
            const sessionData = typeof step.data === 'string' ? JSON.parse(step.data) : step.data;
            
            // Use local Jitsi server for offline mode
            const jitsiServerUrl = process.env.JITSI_SERVER_URL || 'https://localhost:8443';
            const meetingUrl = `${jitsiServerUrl}/${sessionData.roomName}`;
            
            sessions.push({
              id: `${module.module_id}-${index}`,
              module_id: module.module_id,
              topic: module.topic_title,
              step_title: step.header,
              teacher_name: module.teacher_name,
              section: module.section,
              subject: module.subject,
              room_name: sessionData.roomName,
              scheduled_time: sessionData.scheduledTime,
              duration: sessionData.duration || 60,
              meeting_url: meetingUrl
            });
          }
        });
      }
    }
    
    // Sort by scheduled time
    sessions.sort((a, b) => new Date(a.scheduled_time) - new Date(b.scheduled_time));
    
    res.json(sessions);
  } catch (err) {
    console.error('Live Sessions Error:', err);
    res.status(500).json({ error: 'Failed to fetch live sessions' });
  }
});

// Get scheduled live sessions for teacher
app.get('/api/teacher/live-sessions', authenticateToken, async (req, res) => {
  try {
    const teacherId = req.user.id;
    
    // Get modules created by this teacher with jitsi steps
    const result = await pool.query(`
      SELECT m.id as module_id, m.topic_title, m.teacher_name, m.section, m.subject, m.steps
      FROM modules m
      WHERE m.teacher_id = $1
      ORDER BY m.created_at DESC
    `, [teacherId]);
    
    // Extract jitsi sessions from modules
    const sessions = [];
    for (const module of result.rows) {
      if (module.steps && Array.isArray(module.steps)) {
        module.steps.forEach((step, index) => {
          if (step.type === 'jitsi' && step.data) {
            const sessionData = typeof step.data === 'string' ? JSON.parse(step.data) : step.data;
            // Use local Jitsi server for offline mode
            const jitsiServerUrl = process.env.JITSI_SERVER_URL || 'https://localhost:8443';
            const meetingUrl = `${jitsiServerUrl}/${sessionData.roomName}`;
            
            sessions.push({
              id: `${module.module_id}-${index}`,
              module_id: module.module_id,
              topic: module.topic_title,
              step_title: step.header,
              section: module.section,
              subject: module.subject,
              room_name: sessionData.roomName,
              scheduled_time: sessionData.scheduledTime,
              duration: sessionData.duration || 60,
              meeting_url: meetingUrl
            });
          }
        });
      }
    }
    
    // Sort by scheduled time
    sessions.sort((a, b) => new Date(a.scheduled_time) - new Date(b.scheduled_time));
    
    res.json(sessions);
  } catch (err) {
    console.error('Teacher Live Sessions Error:', err);
    res.status(500).json({ error: 'Failed to fetch live sessions' });
  }
});

// =============================================================================
// CHAT SYSTEM - Real-time Faculty-Student Communication
// =============================================================================

// Initialize chat tables
const initChatTables = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS chat_rooms (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(50) DEFAULT 'direct',
        section VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS chat_participants (
        id SERIAL PRIMARY KEY,
        room_id INTEGER REFERENCES chat_rooms(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL,
        user_role VARCHAR(20) NOT NULL,
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(room_id, user_id, user_role)
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id SERIAL PRIMARY KEY,
        room_id INTEGER REFERENCES chat_rooms(id) ON DELETE CASCADE,
        sender_id INTEGER NOT NULL,
        sender_role VARCHAR(20) NOT NULL,
        sender_name VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        message_type VARCHAR(20) DEFAULT 'text',
        file_url VARCHAR(500),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_deleted BOOLEAN DEFAULT FALSE
      )
    `);
    console.log('[CHAT] Tables initialized');
  } catch (err) {
    console.error('[CHAT] Table init error:', err.message);
  }
};

// Initialize chat tables on startup
initChatTables();

// Get or create direct chat room between teacher and student
app.post('/api/chat/room', authenticateToken, async (req, res) => {
  try {
    const { targetId, targetRole } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Validate targetRole
    if (!targetId || !targetRole) {
      return res.status(400).json({ error: 'targetId and targetRole are required' });
    }
    const targetTable = roleToTable(targetRole);
    if (!targetTable) {
      return res.status(400).json({ error: "targetRole must be 'student' or 'teacher'" });
    }

    // Validate: teachers can chat with students, students can chat with teachers
    if (userRole === targetRole) {
      return res.status(400).json({ error: 'Cannot create chat with same role' });
    }

    const teacherId = userRole === 'teacher' ? userId : targetId;
    const studentId = userRole === 'student' ? userId : targetId;
    if (!(await teacherCanAccessStudent(teacherId, studentId))) {
      return res.status(403).json({ error: 'Chat is only available between allocated teachers and students' });
    }

    // Check if room already exists
    const existingRoom = await pool.query(`
      SELECT cr.* FROM chat_rooms cr
      JOIN chat_participants cp1 ON cr.id = cp1.room_id
      JOIN chat_participants cp2 ON cr.id = cp2.room_id
      WHERE cr.type = 'direct'
        AND cp1.user_id = $1 AND cp1.user_role = $2
        AND cp2.user_id = $3 AND cp2.user_role = $4
    `, [userId, userRole, targetId, targetRole]);

    if (existingRoom.rows.length > 0) {
      return res.json({ room: existingRoom.rows[0] });
    }

    // Get names for room name
    const userTable = roleToTable(userRole);
    
    const userData = await pool.query(`SELECT name FROM ${userTable} WHERE id = $1`, [userId]);
    const targetData = await pool.query(`SELECT name FROM ${targetTable} WHERE id = $1`, [targetId]);

    const roomName = `${userData.rows[0]?.name || 'User'} - ${targetData.rows[0]?.name || 'User'}`;

    // Create new room
    const newRoom = await pool.query(
      `INSERT INTO chat_rooms (name, type) VALUES ($1, 'direct') RETURNING *`,
      [roomName]
    );

    // Add participants
    await pool.query(
      `INSERT INTO chat_participants (room_id, user_id, user_role) VALUES ($1, $2, $3), ($1, $4, $5)`,
      [newRoom.rows[0].id, userId, userRole, targetId, targetRole]
    );

    res.json({ room: newRoom.rows[0] });
  } catch (err) {
    console.error('Create chat room error:', err);
    res.status(500).json({ error: 'Failed to create chat room' });
  }
});

// Get user's chat rooms
app.get('/api/chat/rooms', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    const rooms = await pool.query(`
      SELECT cr.*, 
        cp.last_read_at,
        (SELECT COUNT(*) FROM chat_messages cm 
         WHERE cm.room_id = cr.id AND cm.created_at > cp.last_read_at
         AND NOT (cm.sender_id = $1 AND cm.sender_role = $2)) as unread_count,
        (SELECT cm.message FROM chat_messages cm 
         WHERE cm.room_id = cr.id ORDER BY cm.created_at DESC LIMIT 1) as last_message,
        (SELECT cm.created_at FROM chat_messages cm 
         WHERE cm.room_id = cr.id ORDER BY cm.created_at DESC LIMIT 1) as last_message_at
      FROM chat_rooms cr
      JOIN chat_participants cp ON cr.id = cp.room_id
      WHERE cp.user_id = $1 AND cp.user_role = $2
      ORDER BY last_message_at DESC NULLS LAST
    `, [userId, userRole]);

    // Get other participant info for each room
    const roomsWithParticipants = await Promise.all(rooms.rows.map(async (room) => {
      const otherParticipant = await pool.query(`
        SELECT cp.user_id, cp.user_role,
          CASE 
            WHEN cp.user_role = 'student' THEN (SELECT name FROM students WHERE id = cp.user_id)
            ELSE (SELECT name FROM teachers WHERE id = cp.user_id)
          END as name
        FROM chat_participants cp
        WHERE cp.room_id = $1 AND NOT (cp.user_id = $2 AND cp.user_role = $3)
        LIMIT 1
      `, [room.id, userId, userRole]);

      return {
        ...room,
        other_participant: otherParticipant.rows[0] || null
      };
    }));

    res.json(roomsWithParticipants);
  } catch (err) {
    console.error('Get chat rooms error:', err);
    res.status(500).json({ error: 'Failed to fetch chat rooms' });
  }
});

// Get messages for a room
app.get('/api/chat/rooms/:roomId/messages', authenticateToken, async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;
    const { limit = 50, before } = req.query;

    // Verify user is participant
    const participant = await pool.query(
      `SELECT * FROM chat_participants WHERE room_id = $1 AND user_id = $2 AND user_role = $3`,
      [roomId, userId, userRole]
    );

    if (participant.rows.length === 0) {
      return res.status(403).json({ error: 'Not a participant of this room' });
    }

    let query = `
      SELECT * FROM chat_messages 
      WHERE room_id = $1 AND is_deleted = FALSE
    `;
    const params = [roomId];

    if (before) {
      query += ` AND created_at < $2`;
      params.push(before);
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
    params.push(parseInt(limit));

    const messages = await pool.query(query, params);

    // Update last read
    await pool.query(
      `UPDATE chat_participants SET last_read_at = CURRENT_TIMESTAMP 
       WHERE room_id = $1 AND user_id = $2 AND user_role = $3`,
      [roomId, userId, userRole]
    );

    res.json(messages.rows.reverse());
  } catch (err) {
    console.error('Get messages error:', err);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Send message (REST fallback - Socket.io preferred)
app.post('/api/chat/rooms/:roomId/messages', authenticateToken, async (req, res) => {
  try {
    const { roomId } = req.params;
    const { message } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Validate message
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message cannot be empty' });
    }
    if (message.length > 5000) {
      return res.status(400).json({ error: 'Message too long (max 5000 chars)' });
    }

    // Verify user is participant
    const participant = await pool.query(
      `SELECT * FROM chat_participants WHERE room_id = $1 AND user_id = $2 AND user_role = $3`,
      [roomId, userId, userRole]
    );

    if (participant.rows.length === 0) {
      return res.status(403).json({ error: 'Not a participant of this room' });
    }

    // Get sender name
    const senderTable = roleToTable(userRole);
    if (!senderTable) return res.status(400).json({ error: 'Invalid role' });
    const userData = await pool.query(`SELECT name FROM ${senderTable} WHERE id = $1`, [userId]);
    const senderName = userData.rows[0]?.name || 'Unknown';

    // Insert message
    const newMessage = await pool.query(
      `INSERT INTO chat_messages (room_id, sender_id, sender_role, sender_name, message)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [roomId, userId, userRole, senderName, message.trim()]
    );

    res.json(newMessage.rows[0]);
  } catch (err) {
    console.error('Send message error:', err);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Get list of users available to chat (for initiating new conversations)
app.get('/api/chat/available-users', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    if (userRole === 'student') {
      // Students can see teachers who:
      // 1. Created modules/tests for their section
      // 2. Are directly allocated to them via teacher_student_allocations
      const studentData = await pool.query(
        `SELECT id, class_dept, section FROM students WHERE id = $1`, [userId]
      );
      
      if (studentData.rows.length === 0) {
        return res.json([]);
      }

      const { class_dept, section } = studentData.rows[0];
      // Normalize section format for matching (handles "CSE A", "CSE-A", "cse a", multiple spaces, etc.)
      const normalizedSection = `${class_dept} ${section}`.toUpperCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
      console.log('[Chat] Student looking for teachers, normalized section:', normalizedSection);

      // Find teachers from modules for this section OR directly allocated
      // Using DISTINCT ON to avoid duplicate teachers when they have multiple modules
      const teachers = await pool.query(`
        SELECT DISTINCT ON (t.id) t.id, t.name, t.email, 
          COALESCE(m.subject, tsa.subject, 'Teacher') as subject
        FROM teachers t
        LEFT JOIN modules m ON t.id = m.teacher_id 
          AND (
            UPPER(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(m.section, '[-_]', ' ', 'g'), ' +', ' ', 'g'))) = $1
            OR EXISTS (
              SELECT 1 FROM jsonb_array_elements_text(COALESCE(m.sections, '[]'::jsonb)) AS s
              WHERE UPPER(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(s, '[-_]', ' ', 'g'), ' +', ' ', 'g'))) = $1
            )
          )
        LEFT JOIN mcq_tests mt ON t.id = mt.teacher_id 
          AND UPPER(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(mt.section, '[-_]', ' ', 'g'), ' +', ' ', 'g'))) = $1
        LEFT JOIN teacher_student_allocations tsa ON t.id = tsa.teacher_id AND tsa.student_id = $2
        WHERE m.teacher_id IS NOT NULL OR mt.teacher_id IS NOT NULL OR tsa.teacher_id IS NOT NULL
        ORDER BY t.id, m.created_at DESC NULLS LAST
      `, [normalizedSection, userId]);

      console.log('[Chat] Found teachers for student:', teachers.rows.length);
      res.json(teachers.rows.map(t => ({ ...t, role: 'teacher' })));
      
    } else if (userRole === 'teacher') {
      // Teachers can see students from:
      // 1. Sections where they've created modules/tests
      // 2. Directly allocated students via teacher_student_allocations
      // 3. Sections from their allocated_sections JSONB column
      
      // Get sections from modules this teacher created (both legacy and JSONB)
      const moduleSections = await pool.query(
        `SELECT DISTINCT norm_section as section FROM (
           SELECT UPPER(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(section, '[-_]', ' ', 'g'), ' +', ' ', 'g'))) as norm_section 
           FROM modules WHERE teacher_id = $1
           UNION
           SELECT UPPER(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(s, '[-_]', ' ', 'g'), ' +', ' ', 'g'))) as norm_section
           FROM modules, jsonb_array_elements_text(COALESCE(sections, '[]'::jsonb)) AS s
           WHERE teacher_id = $1
         ) sub`, [userId]
      );

      // Get sections from tests this teacher created
      const testSections = await pool.query(
        `SELECT DISTINCT UPPER(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(section, '[-_]', ' ', 'g'), ' +', ' ', 'g'))) as section 
         FROM mcq_tests WHERE teacher_id = $1`, [userId]
      );

      // Get directly allocated students
      const directlyAllocated = await pool.query(
        `SELECT s.id, s.name, s.email, s.class_dept, s.section
         FROM students s
         INNER JOIN teacher_student_allocations tsa ON s.id = tsa.student_id
         WHERE tsa.teacher_id = $1`, [userId]
      );

      // Get allocated_sections JSONB column on teachers table
      const teacherData = await pool.query(
        `SELECT allocated_sections FROM teachers WHERE id = $1`, [userId]
      );
      
      let allocatedSectionsFromColumn = [];
      if (teacherData.rows[0]?.allocated_sections) {
        let sections = teacherData.rows[0].allocated_sections;
        if (typeof sections === 'string') {
          try { sections = JSON.parse(sections); } catch(e) { sections = []; }
        }
        if (Array.isArray(sections)) {
          allocatedSectionsFromColumn = sections.map(s => 
            s.toUpperCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim()
          );
        }
      }

      // Combine all section sources
      const allSections = new Set([
        ...moduleSections.rows.map(m => m.section).filter(Boolean),
        ...testSections.rows.map(t => t.section).filter(Boolean),
        ...allocatedSectionsFromColumn
      ]);
      
      const sections = Array.from(allSections);
      console.log('[Chat] Teacher sections from modules/tests:', sections);
      console.log('[Chat] Teacher directly allocated students:', directlyAllocated.rows.length);
      
      // Get students matching sections
      let sectionStudents = [];
      if (sections.length > 0) {
        const result = await pool.query(`
          SELECT id, name, email, class_dept, section
          FROM students
          WHERE UPPER(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(class_dept || ' ' || section, '[-_]', ' ', 'g'), ' +', ' ', 'g'))) = ANY($1::text[])
          ORDER BY class_dept, section, name
        `, [sections]);
        sectionStudents = result.rows;
      }

      // Combine direct allocations and section-based students, removing duplicates
      const studentMap = new Map();
      [...directlyAllocated.rows, ...sectionStudents].forEach(s => {
        if (!studentMap.has(s.id)) {
          studentMap.set(s.id, s);
        }
      });

      const allStudents = Array.from(studentMap.values());
      console.log('[Chat] Total students for teacher:', allStudents.length);
      
      if (allStudents.length === 0) {
        // If no allocations and no modules, show all students (for new teachers)
        const fallbackStudents = await pool.query(`
          SELECT id, name, email, class_dept, section
          FROM students
          ORDER BY class_dept, section, name
          LIMIT 100
        `);
        return res.json(fallbackStudents.rows.map(s => ({ ...s, role: 'student' })));
      }

      res.json(allStudents.map(s => ({ ...s, role: 'student' })));
    } else {
      res.json([]);
    }
  } catch (err) {
    console.error('Get available users error:', err);
    res.status(500).json({ error: 'Failed to fetch available users' });
  }
});

// =============================================================================
// GLOBAL ERROR HANDLER - Must be last middleware
// =============================================================================
app.use((err, req, res, next) => {
  console.error('Global Error Handler:', {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString()
  });
  
  // Handle specific error types
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ error: 'Invalid token' });
  }
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ error: 'Token expired' });
  }
  if (err.code === '23505') { // PostgreSQL unique violation
    return res.status(409).json({ error: 'Duplicate entry' });
  }
  if (err.code === '23503') { // PostgreSQL foreign key violation
    return res.status(400).json({ error: 'Referenced record not found' });
  }
  
  // Generic error response
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message
  });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

// SPA fallback - serve index.html for any non-API routes
app.get('*', (req, res) => {
  // Only serve index.html for non-API routes
  if (!req.path.startsWith('/api/')) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  } else {
    res.status(404).json({ error: 'API endpoint not found' });
  }
});

function startServer() {
  const PORT = process.env.PORT || 5000;
  
  // Create HTTP server for Socket.io
  const server = http.createServer(app);
  
  // Initialize Socket.io
  const io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL || true,
      methods: ['GET', 'POST'],
      credentials: true
    }
  });

  // Socket.io authentication middleware
  io.use(async (socket, next) => {
    const authToken = socket.handshake.auth?.token;
    const cookieToken = parseCookieHeader(socket.handshake.headers?.cookie)[AUTH_COOKIE_NAME];
    const token = authToken && !['null', 'undefined', 'cookie-session'].includes(authToken)
      ? authToken
      : cookieToken;
    if (!token) {
      return next(new Error('Authentication required'));
    }
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (await isSessionTokenRevoked(token)) {
        return next(new Error('Session expired'));
      }
      socket.user = decoded;
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  // Socket.io connection handler
  io.on('connection', (socket) => {
    const user = socket.user;
    console.log(`[SOCKET] User connected: ${user.email} (${user.role})`);

    // Join user's personal room for direct messages
    socket.join(`user:${user.role}:${user.id}`);

    // Join chat room
    socket.on('join-room', async (roomId) => {
      try {
        // Verify user is participant
        const participant = await pool.query(
          `SELECT * FROM chat_participants WHERE room_id = $1 AND user_id = $2 AND user_role = $3`,
          [roomId, user.id, user.role]
        );
        
        if (participant.rows.length > 0) {
          socket.join(`room:${roomId}`);
          console.log(`[SOCKET] ${user.email} joined room ${roomId}`);
        }
      } catch (err) {
        console.error('[SOCKET] Join room error:', err);
      }
    });

    // Leave chat room
    socket.on('leave-room', (roomId) => {
      socket.leave(`room:${roomId}`);
    });

    // Send message
    socket.on('send-message', async (data) => {
      try {
        const { roomId, message } = data;

        // Verify user is participant
        const participant = await pool.query(
          `SELECT * FROM chat_participants WHERE room_id = $1 AND user_id = $2 AND user_role = $3`,
          [roomId, user.id, user.role]
        );

        if (participant.rows.length === 0) {
          socket.emit('error', { message: 'Not authorized' });
          return;
        }

        // Get sender name
        const table = user.role === 'student' ? 'students' : 'teachers';
        const userData = await pool.query(`SELECT name FROM ${table} WHERE id = $1`, [user.id]);
        const senderName = userData.rows[0]?.name || 'Unknown';

        // Save message
        const newMessage = await pool.query(
          `INSERT INTO chat_messages (room_id, sender_id, sender_role, sender_name, message)
           VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [roomId, user.id, user.role, senderName, message]
        );

        // Broadcast to room
        io.to(`room:${roomId}`).emit('new-message', newMessage.rows[0]);

        // Also notify other participant if not in room
        const otherParticipants = await pool.query(
          `SELECT user_id, user_role FROM chat_participants 
           WHERE room_id = $1 AND NOT (user_id = $2 AND user_role = $3)`,
          [roomId, user.id, user.role]
        );

        otherParticipants.rows.forEach(p => {
          io.to(`user:${p.user_role}:${p.user_id}`).emit('message-notification', {
            roomId,
            message: newMessage.rows[0],
            from: senderName
          });
        });

      } catch (err) {
        console.error('[SOCKET] Send message error:', err);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Typing indicator
    socket.on('typing', (roomId) => {
      socket.to(`room:${roomId}`).emit('user-typing', {
        userId: user.id,
        userRole: user.role,
        roomId
      });
    });

    // Stop typing indicator
    socket.on('stop-typing', (roomId) => {
      socket.to(`room:${roomId}`).emit('user-stopped-typing', {
        userId: user.id,
        userRole: user.role,
        roomId
      });
    });

    // Disconnect
    socket.on('disconnect', () => {
      console.log(`[SOCKET] User disconnected: ${user.email}`);
    });
  });

  server.listen(PORT, () => console.log(`SERVER ACTIVE ON PORT ${PORT}`));
  return { server, io };
}

// Export app for testing, only listen if run directly
if (require.main === module) {
  startServer();
}

module.exports = app;
module.exports.startServer = startServer;
