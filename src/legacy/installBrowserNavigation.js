import { appPages, getPageByPath, getPageByScreenId } from '../pages/pageRegistry.js';
import { applyDashboardRedirect, normalizeRole, roleCanAccess } from '../services/auth/roleRedirectService.js';

const HOME_PATH = '/landing';
const INTRO_PATH = '/intro';
const INTRO_PLAYED_KEY = 'introPlayed';
const ONBOARDING_PATHS = new Set(['/personal-details', '/academic-details']);
const PRESERVED_ROUTE_RE = /^\/(student|creator|subadmin|admin)(\/|$)/;
const STUDENT_INNER_PAGES = new Set([
  'dashboard',
  'subjects',
  'units',
  'unit-content',
  'calculator',
  'backlog',
  'skills',
]);

let suppressRouteUpdate = false;
let oauthNavigationHandled = false;
let bootstrapSessionRestoreAttempted = false;

function isOAuthCallbackHash() {
  const hash = window.location.hash || '';
  const search = window.location.search || '';
  return (
    hash.includes('access_token') ||
    hash.includes('refresh_token') ||
    hash.includes('code=') ||
    search.includes('code=')
  );
}

function normalizeHash() {
  const raw = window.location.hash.replace(/^#/, '');
  if (!raw || raw === '/') return HOME_PATH;
  if (isOAuthCallbackHash()) return '/auth';
  if (!raw.startsWith('/') && !raw.includes('=')) {
    const normalized = `/${raw}`;
    return window.aiiensNormalizeAdminRoute?.(normalized) || normalized;
  }
  if (raw.includes('access_token') || raw.includes('refresh_token')) return '/auth';
  const normalized = raw.startsWith('/') ? raw : `/${raw}`;
  return window.aiiensNormalizeAdminRoute?.(normalized) || normalized;
}

function hasIntroPlayedThisTab() {
  return (
    window.__aimeasyIntroPlayedInMem === true ||
    sessionStorage.getItem('aimeasy:intro_suppressed_for_auth') === 'true'
  );
}

function markIntroPlayedThisTab() {
  window.__aimeasyIntroPlayedInMem = true;
}

function isAuthBootstrapLocked() {
  return Boolean(window.__aimeasyAuthRestoring) || window.__aimeasyAuthBootstrapComplete === false;
}

function isOnboardingRoute(path) {
  return ONBOARDING_PATHS.has(path);
}

function isDashboardRoute(path) {
  return PRESERVED_ROUTE_RE.test(path);
}

function isProtectedAppRoute(path) {
  return PRESERVED_ROUTE_RE.test(path) || ONBOARDING_PATHS.has(path);
}

function navigationType() {
  return performance?.getEntriesByType?.('navigation')?.[0]?.type || '';
}

function isOnboardingLocked() {
  return Boolean(window.__aimeasyOnboardingRouteLock);
}

function isCentralAuthRouting() {
  return Boolean(window.__aimeasyRoutingInProgress);
}

function shouldBlockLandingOverride(path) {
  return path === HOME_PATH && (isAuthBootstrapLocked() || isOnboardingLocked() || isCentralAuthRouting());
}

async function requestAuthSync(options) {
  if (typeof window.syncSessionFromSupabase !== 'function') return false;
  return window.syncSessionFromSupabase(options);
}

function hashFor(path) {
  return `#${path}`;
}

function replaceRoute(path) {
  path = window.aiiensNormalizeAdminRoute?.(path) || path;
  const nextHash = hashFor(path);
  if (window.location.hash !== nextHash) {
    const currentIndex = window.history.state?.aimeasyIndex ?? 0;
    window.history.replaceState({ aimeasyPath: path, aimeasyIndex: currentIndex }, '', nextHash);
  }
}

function pushRoute(path) {
  path = window.aiiensNormalizeAdminRoute?.(path) || path;
  const nextHash = hashFor(path);
  if (window.location.hash !== nextHash) {
    const nextIndex = (window.history.state?.aimeasyIndex ?? 0) + 1;
    window.history.pushState({ aimeasyPath: path, aimeasyIndex: nextIndex }, '', nextHash);
  }
}

function activeScreenId() {
  return document.querySelector('.screen.active')?.id || 'screen-landing';
}

function encodeRoutePart(value) {
  return encodeURIComponent(String(value || '').trim());
}

function decodeRoutePart(value) {
  try {
    return decodeURIComponent(String(value || ''));
  } catch {
    return String(value || '');
  }
}
function showOnlyScreen(screenId) {
  document.querySelectorAll('.screen').forEach((screen) => {
    screen.classList.remove('active');
  });

  document.getElementById(screenId)?.classList.add('active');
}

function showStudentInnerPage(pageName) {
  document.querySelectorAll('[id^="page-"]').forEach((page) => {
    page.style.display = 'none';
  });

  const page = document.getElementById(`page-${pageName}`);
  if (page) page.style.display = 'block';
}

function currentAuthRole() {
  if (typeof APP === 'undefined') return null;
  return normalizeRole(APP.adminType || APP.user?.role || APP.role);
}

function syncProfileStepFromPath(path) {
  if (path !== '/personal-details' && path !== '/academic-details') return;
  const step1 = document.getElementById('profile-step1');
  const step2 = document.getElementById('profile-step2');
  const s1 = document.getElementById('step1');
  const s2 = document.getElementById('step2');
  if (path === '/personal-details') {
    if (step1) step1.style.display = 'block';
    if (step2) step2.style.display = 'none';
    s1?.classList.add('active');
    s1?.classList.remove('done');
    s2?.classList.remove('active', 'done');
  } else {
    if (step1) step1.style.display = 'none';
    if (step2) step2.style.display = 'block';
    s1?.classList.add('done');
    s1?.classList.remove('active');
    s2?.classList.add('active');
  }
}

function pageForRoute(path) {
  if (ONBOARDING_PATHS.has(path)) return getPageByPath('/profile');
  return getPageByPath(path);
}

function normalizedMainPathFor(path) {
  if (ONBOARDING_PATHS.has(path)) return path;
  const [mainPath] = path.split('/').filter(Boolean);
  return mainPath ? `/${mainPath}` : HOME_PATH;
}

function isValidStudentRoute(path) {
  return (
    STUDENT_INNER_PAGES.has(path.replace(/^\/student\/?/, '')) ||
    path === '/student' ||
    /^\/student\/subjects\/[^/]+$/.test(path) ||
    /^\/student\/units\/[^/]+$/.test(path) ||
    /^\/student\/unit-content\/[^/]+\/[^/]+$/.test(path)
  );
}

function routeExists(path) {
  return (
    ONBOARDING_PATHS.has(path) ||
    isValidStudentRoute(path) ||
    /^\/creator(\/|$)/.test(path) ||
    /^\/subadmin(\/|$)/.test(path) ||
    /^\/admin(\/|$)/.test(path) ||
    path.startsWith('/creator/') ||
    path.startsWith('/subadmin/') ||
    path.startsWith('/admin/') || 
    Boolean(getPageByPath(path))
  );
}

async function applyRoute(path) {
  path = window.aiiensNormalizeAdminRoute?.(path) || path;
  console.log('[ROUTE] Route Requested', {
    requestedRoute: path,
    hasSession: Boolean(typeof APP !== 'undefined' && (APP.session || APP.adminType)),
    restoring: Boolean(window.__aimeasyAuthRestoring),
  });

  if (shouldBlockLandingOverride(path) || (isAuthBootstrapLocked() && path === INTRO_PATH)) {
    console.log('[ROUTE] Route Blocked', {
      requestedRoute: path,
      reason: isOnboardingLocked() ? 'onboarding-route-lock' : 'auth-bootstrap-lock',
    });
    return;
  }

  if (path === INTRO_PATH && hasIntroPlayedThisTab()) {
    if (isAuthBootstrapLocked()) return;
    applyRoute(HOME_PATH);
    replaceRoute(HOME_PATH);
    return;
  }

  if (path === '/auth' && window.APP?.session && window.APP?.user) {
    await requestAuthSync({ reason: 'auth-route-authenticated' });
    return;
  }

  if (path === '/auth' && isOAuthCallbackHash()) {
    oauthNavigationHandled = true;
    window.showScreen?.('screen-setting-up-profile');
    await requestAuthSync({ reason: 'navigation-oauth-callback' });
    return;
  }


  const [, childPath, subjectId, unitId] = path.split('/').filter(Boolean);
  const normalizedMainPath = normalizedMainPathFor(path);
  const page = pageForRoute(normalizedMainPath) || getPageByPath(HOME_PATH);
  const hasSession = (typeof APP !== 'undefined' && (APP.session || APP.adminType));
  if (hasSession && isOnboardingLocked() && path === HOME_PATH) {
    console.log('[ROUTE] Route Blocked', { requestedRoute: path, reason: 'onboarding-route-lock' });
    return;
  }
  const isOnboardingPath = ONBOARDING_PATHS.has(normalizedMainPath);
  if (!hasSession && isOnboardingPath && (isOnboardingLocked() || isAuthBootstrapLocked())) {
    console.log('[ROUTE] Route Allowed', { path, reason: 'onboarding' });
  } else
  if (!hasSession && page.role !== 'public') {
    if (isAuthBootstrapLocked()) {
      console.log('[ROUTE] Route pending', { requestedRoute: path, reason: 'session-restore-in-flight' });
      return;
    }
    if ((isOnboardingRoute(normalizedMainPath) || isDashboardRoute(path)) && window.__AIMEASY_SUPABASE__) {
      console.log('[AUTH] Session restore requested before protected routing', { route: path });
      await requestAuthSync({ reason: `protected-route-restore:${path}` });
      return;
    }
    console.log('[ROUTE] Route Blocked', { requestedRoute: path, reason: 'missing-session' });
    suppressRouteUpdate = true;
    if (typeof window.showScreen === 'function') {
      window.showScreen(getPageByPath(HOME_PATH).screenId);
    } else {
      showOnlyScreen(getPageByPath(HOME_PATH).screenId);
    }
    replaceRoute(HOME_PATH);
    suppressRouteUpdate = false;
    return;
  }

  if (hasSession && page.role !== 'public' && !roleCanAccess(currentAuthRole(), page.role)) {
    console.log('[ROUTE] Route Blocked', {
      requestedRoute: path,
      reason: 'role-mismatch',
      role: currentAuthRole(),
      allow: page.role,
    });
    suppressRouteUpdate = true;
    applyDashboardRedirect({ role: currentAuthRole() });
    suppressRouteUpdate = false;
    return;
  }

  suppressRouteUpdate = true;

  if (typeof window.showScreen === 'function') {
    window.showScreen(page.screenId);
  } else {
    showOnlyScreen(page.screenId);
  }
  syncProfileStepFromPath(normalizedMainPath);

  if (page.screenId === 'screen-app') {
    window.updateSidebarProfile?.();
  }

  if (page.screenId === 'screen-app' && childPath && STUDENT_INNER_PAGES.has(childPath)) {
    if (childPath === 'subjects' && subjectId && typeof window.openSubject === 'function') {
      window.navigateTo?.('subjects');
      await window.openSubject(decodeRoutePart(subjectId));
    } else if ((childPath === 'units' || childPath === 'unit-content') && subjectId && typeof window.openSubject === 'function') {
      window.navigateTo?.('subjects');
      await window.openSubject(decodeRoutePart(subjectId));
      if (unitId && typeof window.openUnit === 'function') {
        window.openUnit(Number(decodeRoutePart(unitId)), decodeRoutePart(subjectId));
      }
    } else if (typeof window.navigateTo === 'function') {
      window.navigateTo(childPath);
    } else {
      showStudentInnerPage(childPath);
    }
  } else if (page.screenId === 'screen-subadmin' && childPath && typeof window.switchSASection === 'function') {
    window.switchSASection(decodeRoutePart(childPath));
  } else if (page.screenId === 'screen-admin' && childPath && typeof window.switchAdminSection === 'function') {
    window.switchAdminSection(decodeRoutePart(childPath));
  } else if (page.screenId === 'screen-creator' && childPath && typeof window.switchCRSection === 'function') {
    window.switchCRSection(decodeRoutePart(childPath));
  }

  suppressRouteUpdate = false;
  console.log('[ROUTE] Route Allowed', { requestedRoute: path, screenId: page.screenId });
  console.log('[ROUTE] Final Route', { route: path, screenId: page.screenId });
}

function pathForScreen(screenId) {
  return getPageByScreenId(screenId)?.path || HOME_PATH;
}

function patchLegacyNavigators() {
  if (window.__aimeasyNavigationPatched) return;

  const originalShowScreen = window.showScreen;
  if (typeof originalShowScreen === 'function') {
    window.showScreen = function routedShowScreen(screenId, role) {
      if (screenId === 'screen-landing' && (isOnboardingLocked() || isCentralAuthRouting())) {
        console.log('[ROUTE] Route Blocked', {
          requestedRoute: HOME_PATH,
          reason: isOnboardingLocked() ? 'onboarding-route-lock' : 'central-auth-routing',
          source: 'showScreen',
        });
        return undefined;
      }

      const result = originalShowScreen.call(this, screenId, role);

      if (!suppressRouteUpdate && !isCentralAuthRouting() && activeScreenId() === screenId) {
        pushRoute(pathForScreen(screenId));
      }

      return result;
    };
  }

  const originalNavigateTo = window.navigateTo;
  if (typeof originalNavigateTo === 'function') {
    window.navigateTo = function routedNavigateTo(pageName) {
        console.log('[PATCHED NAVIGATE]', pageName);
        console.log('[SUPPRESS]', suppressRouteUpdate);
      const result = originalNavigateTo.call(this, pageName);

      if (!suppressRouteUpdate && STUDENT_INNER_PAGES.has(pageName)) {
        pushRoute(`/student/${pageName}`);
         console.log('[URL UPDATED]', `/student/${pageName}`);
      }

      return result;
    };
  }

  const originalOpenSubject = window.openSubject;
  if (typeof originalOpenSubject === 'function') {
    window.openSubject = function routedOpenSubject(subjectId, ...args) {
      const result = originalOpenSubject.call(this, subjectId, ...args);

      if (!suppressRouteUpdate && subjectId) {
        pushRoute(`/student/subjects/${encodeRoutePart(subjectId)}`);
      }

      return result;
    };
  }

  const originalOpenUnit = window.openUnit;
  if (typeof originalOpenUnit === 'function') {
    window.openUnit = function routedOpenUnit(unitNum, subjectId, ...args) {
      const result = originalOpenUnit.call(this, unitNum, subjectId, ...args);
      const resolvedSubject = subjectId || window.APP?.currentSubject?.id || window.APP?.currentSubject?.rawId;

      if (!suppressRouteUpdate && resolvedSubject && unitNum) {
        pushRoute(`/student/unit-content/${encodeRoutePart(resolvedSubject)}/${encodeRoutePart(unitNum)}`);
      }

      return result;
    };
  }

  const originalSwitchSASection = window.switchSASection;
  if (typeof originalSwitchSASection === 'function') {
    window.switchSASection = function routedSwitchSASection(section) {
      const result = originalSwitchSASection.call(this, section);

      if (!suppressRouteUpdate && section) {
        const SA_SECTION_TO_ROUTE = {
          dashboard: 'dashboard',
          subjects: 'create-subject',
          view: 'manage-content',
          curriculum: 'curriculum',
          skillup: 'skillup',
          urls: 'url-approvals'
        };
        const route = SA_SECTION_TO_ROUTE[section] || section;
        pushRoute(`/subadmin/${route}`);
      }

      return result;
    };
  }

  const originalSwitchAdminSection = window.switchAdminSection;
  if (typeof originalSwitchAdminSection === 'function') {
    window.switchAdminSection = function routedSwitchAdminSection(section) {
      const result = originalSwitchAdminSection.call(this, section);

      if (!suppressRouteUpdate && section) {
        const ADMIN_SECTION_TO_ROUTE = {
          create: 'create-manage',
          dashboard: 'dashboard',
          subjects: 'subjects',
          approvals: 'url-approvals',
          creatorview: 'creatorview',
          skillup: 'skillup'
        };
        const route = ADMIN_SECTION_TO_ROUTE[section] || section;
        pushRoute(`/admin/${route}`);
      }

      return result;
    };
  }

  const originalSwitchCRSection = window.switchCRSection;
  if (typeof originalSwitchCRSection === 'function') {
    window.switchCRSection = function routedSwitchCRSection(section) {
      const result = originalSwitchCRSection.call(this, section);

      if (!suppressRouteUpdate && section) {
        pushRoute(`/creator/${section}`);
      }

      return result;
    };
  }

  window.__aimeasyNavigationPatched = true;
}

function syncCurrentRoute() {
  const screenRoute = pathForScreen(activeScreenId());

  if (screenRoute === '/student') {
    const activeStudentPage = [...STUDENT_INNER_PAGES].find((pageName) => {
      const page = document.getElementById(`page-${pageName}`);
      return page?.style.display !== 'none';
    });

    replaceRoute(activeStudentPage ? `/student/${activeStudentPage}` : screenRoute);
    return;
  }

  replaceRoute(screenRoute);
}
export function installBrowserNavigation() {
  if (window.__aimeasyBrowserNavigationInstalled) return;
  window.addEventListener('popstate', async () => {
    console.log('[NAVIGATION] Back button pressed');
    console.log('[AUTH] Session preserved');
    await applyRoute(normalizeHash());
  });

  window.addEventListener('hashchange', async () => {
    if (isOAuthCallbackHash()) {
      oauthNavigationHandled = true;
      window.showLoading?.('Completing Google sign-in...');
      await requestAuthSync({ reason: 'hashchange-oauth-callback' });
      return;
    }

    await applyRoute(normalizeHash());
  });

  window.addEventListener('aimeasy:auth-bootstrap-complete', () => {
    window.setTimeout(() => {
      window.updateSidebarProfile?.();
      startBrowserNavigation();
    }, 0);
  });

  window.__aimeasyBrowserNavigationInstalled = true;
}

export async function startBrowserNavigation() {
  patchLegacyNavigators();
  window.startBrowserNavigation = startBrowserNavigation;

  if (isOAuthCallbackHash()) {
    // Never allow intro during auth callback handling.
    markIntroPlayedThisTab();
    if (!oauthNavigationHandled) {
      oauthNavigationHandled = true;
      window.showScreen?.('screen-setting-up-profile');
      await requestAuthSync({ reason: 'start-navigation-oauth-callback' });
    }
    return;
  }

  const hasSession = (typeof APP !== 'undefined' && (APP.session || APP.adminType));
  const hash = normalizeHash();
  if (hash === HOME_PATH) {
    sessionStorage.removeItem('aimeasy:intro_suppressed_for_auth');
  }
  if (hash !== HOME_PATH && hash !== '/intro') {
    markIntroPlayedThisTab();
  }
  const firstVisitIntro = !hasIntroPlayedThisTab();

  console.log('[ROUTER] Current Route', hash);
  const navType = navigationType();
  if (navType === 'reload') {
    console.log('[AUTH] Refresh detected', { route: hash });
  }
  if (hash === '/auth') {
    // Never allow intro on the auth route (OAuth return often lands here).
    markIntroPlayedThisTab();
    if (hasSession) {
      await requestAuthSync({ reason: 'auth-route-authenticated' });
      return;
    }
  }

  if (!firstVisitIntro && hasSession && hash === HOME_PATH && window.__AIMEASY_SUPABASE__) {
    console.log('[ROUTE] Landing requested with active session; delegating to post-auth router');
    await requestAuthSync({ reason: 'landing-authenticated' });
    return;
  }

  if (isAuthBootstrapLocked()) {
    console.log('[INTRO] Skipped - Auth Restore');
    markIntroPlayedThisTab();
    console.log('[ROUTER] Navigation paused during auth restore', { route: hash });
    return;
  }

  // Refresh/deep-link guard: don't redirect to landing until we've attempted session restore.
  // This fixes "Dashboard → Refresh → Home" without changing roles/permissions.
  if (!hasSession && !bootstrapSessionRestoreAttempted && window.__AIMEASY_SUPABASE__ && hash !== '/auth') {
    const [mainPath] = hash.split('/').filter(Boolean);
    const normalizedMainPath = mainPath ? `/${mainPath}` : HOME_PATH;
    const page = getPageByPath(normalizedMainPath) || getPageByPath(HOME_PATH);
    const isProtected = page?.role && page.role !== 'public';
    if (isProtected && routeExists(hash)) {
      bootstrapSessionRestoreAttempted = true;

      console.log('[INTRO] Skipped - Session Restore');
      markIntroPlayedThisTab();
      console.log('[AUTH] Session restore requested before protected routing', { route: hash });

      await requestAuthSync({ reason: 'startup-route-restore' })?.finally?.(() => {
        // Re-run routing once auth bootstrap has had a chance.
        window.setTimeout(() => startBrowserNavigation(), 0);
      });
      return;
    }
  }

  const isProtectedRoute = /^\/(student|creator|subadmin|admin)(\/|$)/.test(hash);

  // Intro should play once per tab launch before role selection,
  // but never during OAuth callback handling or protected route refresh/deep-link restore.
  if (firstVisitIntro && !ONBOARDING_PATHS.has(hash) && hash !== '/auth' && !isOAuthCallbackHash()) {
    if (isAuthBootstrapLocked()) return;
    window.__aimeasyRouteAfterIntro = hash === INTRO_PATH ? HOME_PATH : hash;
    await applyRoute(INTRO_PATH);
    replaceRoute(INTRO_PATH);
    return;
  }
  if (!hasSession) {
    const requestedPage = appPages.find((page) => page.path === hash);
    if (requestedPage?.role === 'public' && hash !== '/auth') {
      await applyRoute(hash);
    } else {
      if (isAuthBootstrapLocked()) return;
      await applyRoute(HOME_PATH);
      replaceRoute(HOME_PATH);
    }
    return;
  }

  const requestedRoute = normalizeHash();
  console.log('[REFRESH DEBUG] Requested Route', requestedRoute);
  if (routeExists(requestedRoute)) {
    await applyRoute(requestedRoute);
    replaceRoute(requestedRoute);
    console.log('[ROUTER] Route Restored', requestedRoute);
  } else if (isProtectedRoute) {
    applyDashboardRedirect({ role: currentAuthRole() });
    console.log('[ROUTER] Invalid protected route redirected', {
      requestedRoute,
      target: window.history.state?.aimeasyPath || normalizeHash(),
    });
  } else {
    syncCurrentRoute();
    console.log('[ROUTER] Route Restored', window.history.state?.aimeasyPath || normalizeHash());
  }
}
