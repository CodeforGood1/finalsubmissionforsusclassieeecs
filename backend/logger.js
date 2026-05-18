const originalConsole = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

const REDACTED = '[REDACTED]';

function redactString(value) {
  return String(value)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, REDACTED)
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, `$1${REDACTED}`)
    .replace(/\b(eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b/g, REDACTED)
    .replace(/(["']?(?:password|newPassword|currentPassword|otp|otp_code|totp_secret|token|secret)["']?\s*[:=]\s*)["']?[^"',\s}]+["']?/gi, `$1${REDACTED}`)
    .replace(/\b(password|otp|token|secret)\s+(?:for testing|is|=|:)\s*[^\s,;]+/gi, `$1 ${REDACTED}`);
}

function redact(value) {
  if (value instanceof Error) {
    return redactString(value.stack || value.message);
  }
  if (typeof value === 'string') {
    return redactString(value);
  }
  if (value && typeof value === 'object') {
    try {
      return redactString(JSON.stringify(value));
    } catch (_) {
      return REDACTED;
    }
  }
  return value;
}

function patchConsole() {
  ['log', 'info', 'warn', 'error'].forEach((method) => {
    console[method] = (...args) => originalConsole[method](...args.map(redact));
  });
}

patchConsole();

module.exports = {
  redact,
  info: (...args) => originalConsole.info(...args.map(redact)),
  warn: (...args) => originalConsole.warn(...args.map(redact)),
  error: (...args) => originalConsole.error(...args.map(redact)),
};
