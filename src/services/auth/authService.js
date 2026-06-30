import { supabase } from '../supabase/client.js';
import { setLoginPortal } from './profileService.js';
import { normalizeRole } from './roleRedirectService.js';

let oauthStartPromise = null;
let sessionRequest = null;
let sessionCache = null;
const callbackRequests = new Map();
const SUPPRESS_INTRO_ONCE_KEY = 'aimeasy:suppress_intro_once';
const SESSION_CACHE_TTL = 5000;
const AUTH_REQUEST_TIMEOUT_MS = 15000;

export function withAuthTimeout(promise, label, timeoutMs = AUTH_REQUEST_TIMEOUT_MS) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    window.clearTimeout(timeoutId);
  });
}

export function hasAuthClient() {
  return Boolean(supabase);
}

export function signInWithGoogle(selectedRole) {
  if (!supabase) return Promise.reject(new Error('Supabase Auth is not configured.'));
  if (oauthStartPromise) return oauthStartPromise;

  const isLiveWorkshop = selectedRole === 'live_workshop';
  const role = isLiveWorkshop ? 'live_workshop' : normalizeRole(selectedRole);
  if (!role) return Promise.reject(new Error('Select a valid login role.'));
  setLoginPortal(role);
  invalidateSessionCache();
  if (isLiveWorkshop) {
    try {
      sessionStorage.setItem('aiiens_live_workshop_auth', '1');
    } catch {
      /* ignore */
    }
  }
  try {
    // Ensure intro never plays after OAuth redirects (even if redirected into a new tab).
    localStorage.setItem(SUPPRESS_INTRO_ONCE_KEY, 'true');
    sessionStorage.setItem('aimeasy:intro_suppressed_for_auth', 'true');
  } catch {
    /* ignore */
  }

  oauthStartPromise = supabase.auth
    .signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}${window.location.pathname}#/auth`,
        queryParams: {
          prompt: 'consent select_account',
          access_type: 'offline',
        },
      },
    })
    .then(({ data, error }) => {
      if (error) throw error;
      console.log('[AUTH] OAuth Started', {
        role,
        redirectTo: `${window.location.origin}${window.location.pathname}#/auth`,
        note:
          'Google was asked to show account selection and consent; Google may still skip consent for trusted/previously granted sessions.',
      });
      return data;
    })
    .catch((error) => {
      oauthStartPromise = null;
      throw error;
    });

  return oauthStartPromise;
}

export function exchangeOAuthCodeOnce(code) {
  if (!supabase) return Promise.reject(new Error('Supabase Auth is not configured.'));
  if (!code) return Promise.resolve();
  if (callbackRequests.has(code)) return callbackRequests.get(code);

  const request = withAuthTimeout(
    supabase.auth.exchangeCodeForSession(code),
    'exchangeCodeForSession',
  ).then(({ error }) => {
    if (error) throw error;
    invalidateSessionCache();
    console.log('[AUTH] OAuth callback session restored', { source: 'exchangeCodeForSession' });
  });
  callbackRequests.set(code, request);
  return request;
}

export function getSessionOnce() {
  if (!supabase) return Promise.resolve({ data: { session: null }, error: null });
  const now = Date.now();
  if (sessionCache && now - sessionCache.resolvedAt < SESSION_CACHE_TTL) {
    return Promise.resolve(sessionCache.result);
  }
  if (sessionRequest) return sessionRequest;

  sessionRequest = withAuthTimeout(supabase.auth.getSession(), 'getSession')
    .then((result) => {
      sessionCache = { result, resolvedAt: Date.now() };
      console.log('[AUTH] getSessionOnce complete', {
        hasSession: Boolean(result.data?.session),
        userId: result.data?.session?.user?.id || null,
      });
      return result;
    })
    .finally(() => {
      sessionRequest = null;
    });
  return sessionRequest;
}

export function invalidateSessionCache() {
  sessionCache = null;
  sessionRequest = null;
}
