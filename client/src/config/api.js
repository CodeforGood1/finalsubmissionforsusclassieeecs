// API Configuration
// In production (Docker), frontend is served from the same origin as the API
// In development, we use the Vite proxy or localhost:5000

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

// Named export for compatibility with NotificationBell
export const API_URL = API_BASE_URL;

const AUTH_MARKER = 'cookie-session';
const CSRF_STORAGE_KEY = 'susclass_csrf_token';

let originalFetch = null;
let csrfRequest = null;

const stateChangingMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const csrfExemptPaths = new Set([
  '/api/csrf-token',
  '/api/logout',
  '/api/login',
  '/api/admin/login',
  '/api/admin/change-password',
  '/api/verify-totp',
  '/api/password-reset/request',
  '/api/password-reset/confirm'
]);

function toUrl(input) {
  const raw = typeof input === 'string' ? input : input?.url;
  if (!raw) return null;
  try {
    return new URL(raw, window.location.origin);
  } catch {
    return null;
  }
}

function isApiRequest(url) {
  if (!url || !url.pathname.startsWith('/api/')) return false;
  if (!API_BASE_URL) return url.origin === window.location.origin;
  const apiBase = new URL(API_BASE_URL, window.location.origin);
  return url.origin === apiBase.origin;
}

export function hasAuthSession() {
  return localStorage.getItem('authenticated') === 'true' || Boolean(localStorage.getItem('token'));
}

export function clearAuthSession() {
  localStorage.removeItem('token');
  localStorage.removeItem('authenticated');
  localStorage.removeItem('user_role');
  localStorage.removeItem('user_data');
  sessionStorage.removeItem(CSRF_STORAGE_KEY);
  fetch(`${API_BASE_URL}/api/logout`, { method: 'POST', credentials: 'include' }).catch(() => {});
}

export async function getCsrfToken(force = false) {
  if (!force) {
    const cached = sessionStorage.getItem(CSRF_STORAGE_KEY);
    if (cached) return cached;
  }
  if (!csrfRequest) {
    const fetchImpl = originalFetch || window.fetch.bind(window);
    csrfRequest = fetchImpl(`${API_BASE_URL}/api/csrf-token`, {
      credentials: 'include'
    })
      .then(async (res) => {
        if (!res.ok) throw new Error('CSRF token request failed');
        const data = await res.json();
        sessionStorage.setItem(CSRF_STORAGE_KEY, data.csrfToken);
        return data.csrfToken;
      })
      .finally(() => {
        csrfRequest = null;
      });
  }
  return csrfRequest;
}

function installLocalStorageCompatibility() {
  if (window.__susclassStoragePatched) return;
  window.__susclassStoragePatched = true;
  const nativeGetItem = Storage.prototype.getItem;
  const nativeRemoveItem = Storage.prototype.removeItem;

  Storage.prototype.getItem = function getItem(key) {
    const value = nativeGetItem.call(this, key);
    if (key === 'token' && !value && nativeGetItem.call(this, 'authenticated') === 'true') {
      return AUTH_MARKER;
    }
    return value;
  };

  Storage.prototype.removeItem = function removeItem(key) {
    if (key === 'token') {
      nativeRemoveItem.call(this, 'authenticated');
      sessionStorage.removeItem(CSRF_STORAGE_KEY);
    }
    return nativeRemoveItem.call(this, key);
  };
}

export function installApiFetchInterceptor() {
  if (window.__susclassFetchPatched) return;
  window.__susclassFetchPatched = true;
  installLocalStorageCompatibility();
  originalFetch = window.fetch.bind(window);

  window.fetch = async (input, init = {}) => {
    const url = toUrl(input);
    if (!isApiRequest(url)) {
      return originalFetch(input, init);
    }

    const method = (init.method || (typeof input !== 'string' ? input?.method : 'GET') || 'GET').toUpperCase();
    const headers = new Headers(init.headers || (typeof input !== 'string' ? input?.headers : undefined));
    const authorization = headers.get('Authorization') || '';
    if (/^Bearer\s*(null|undefined|cookie-session)?$/i.test(authorization.trim())) {
      headers.delete('Authorization');
    }

    if (stateChangingMethods.has(method) && !csrfExemptPaths.has(url.pathname) && !headers.has('X-CSRF-Token')) {
      headers.set('X-CSRF-Token', await getCsrfToken());
    }

    return originalFetch(input, {
      ...init,
      credentials: init.credentials || 'include',
      headers
    });
  };
}

export default API_BASE_URL;
