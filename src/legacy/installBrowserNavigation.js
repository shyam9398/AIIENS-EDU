import { appPages, getPageByPath, getPageByScreenId } from '../pages/pageRegistry.js';
import { applyDashboardRedirect, normalizeRole, roleCanAccess } from '../services/auth/roleRedirectService.js';

const HOME_PATH = '/landing';
const INTRO_PATH = '/intro';
const INTRO_PLAYED_KEY = 'introPlayed';
const ONBOARDING_PATHS = new Set(['/personal-details', '/academic-details']);
const PRESERVED_ROUTE_RE = /^\/(student|creator|subadmin|admin)(\/|$)/;
const APP_TITLE = 'AIIENS Edu';
const STUDENT_INNER_PAGES = new Set([
  'dashboard',
  'subjects',
  'units',
  'unit-content',
  'calculator',
  'backlog',
  'skills',
]);
const STUDENT_PAGE_TITLES = {
  dashboard: 'Dashboard',
  subjects: 'Subjects',
  units: 'Subjects',
  'unit-content': 'Unit Content',
  calculator: 'Calculator',
  backlog: 'Backlog Subjects',
  skills: 'Skills Up',
};
const STUDENT_NAV_BY_PAGE = {
  dashboard: 'dashboard',
  subjects: 'subjects',
  units: 'subjects',
  'unit-content': 'subjects',
  calculator: 'calculator',
  backlog: 'backlog',
  skills: 'skills',
};
const ADMIN_ROUTE_TO_SECTION = {
  manage: 'create',
  management: 'create',
  'create-management': 'create',
  'create-manage': 'create',
  'url-approvals': 'approvals',
  urls: 'approvals',
};
const ADMIN_SECTION_TO_ROUTE = {
  create: 'create-manage',
  dashboard: 'dashboard',
  subjects: 'subjects',
  approvals: 'url-approvals',
  creatorview: 'creatorview',
  skillup: 'skillup',
  notifications: 'notifications',
  liveworkshops: 'liveworkshops',
};
const SUBADMIN_ROUTE_TO_SECTION = {
  'create-subject': 'subjects',
  content: 'view',
  'manage-content': 'view',
  approvals: 'urls',
  'url-approvals': 'urls',
};
const SUBADMIN_SECTION_TO_ROUTE = {
  dashboard: 'dashboard',
  subjects: 'create-subject',
  view: 'manage-content',
  curriculum: 'curriculum',
  skillup: 'skillup',
  urls: 'url-approvals',
};
const CREATOR_SECTIONS = new Set(['dashboard', 'choosing', 'addcontent']);
const DIRECT_PATH_ALIASES = {
  '/': HOME_PATH,
  '/index.html': HOME_PATH,
  '/home': HOME_PATH,
  '/dashboard': '/student/dashboard',
  '/settings': '/profile',
  '/login': HOME_PATH,
};

let suppressRouteUpdate = false;
let oauthNavigationHandled = false;
let bootstrapSessionRestoreAttempted = false;
const scrollPositions = new Map();

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

function normalizeRoutePath(path) {
  let normalized = String(path || '').trim();
  if (!normalized) return HOME_PATH;
  normalized = normalized.split(/[?#]/)[0] || HOME_PATH;
  if (!normalized.startsWith('/')) normalized = `/${normalized}`;
  if (normalized.length > 1) normalized = normalized.replace(/\/+$/, '');
  normalized = DIRECT_PATH_ALIASES[normalized] || normalized;
  return window.aiiensNormalizeAdminRoute?.(normalized) || normalizeRoleRoute(normalized);
}

function normalizeRoleRoute(path) {
  const parts = String(path || '').split('/').filter(Boolean);
  if (parts[0] === 'admin' && parts[1]) {
    const section = ADMIN_ROUTE_TO_SECTION[parts[1]] || parts[1];
    return `/admin/${ADMIN_SECTION_TO_ROUTE[section] || section}`;
  }
  if (parts[0] === 'subadmin' && parts[1]) {
    const section = SUBADMIN_ROUTE_TO_SECTION[parts[1]] || parts[1];
    return `/subadmin/${SUBADMIN_SECTION_TO_ROUTE[section] || section}`;
  }
  return path;
}

function normalizeHash() {
  const raw = window.location.hash.replace(/^#/, '');
  if (!raw || raw === '/') return HOME_PATH;
  if (isOAuthCallbackHash()) return '/auth';
  if (!raw.startsWith('/') && !raw.includes('=')) return normalizeRoutePath(raw);
  if (raw.includes('access_token') || raw.includes('refresh_token')) return '/auth';
  return normalizeRoutePath(raw);
}

function normalizeLocationRoute() {
  if (isOAuthCallbackHash()) return '/auth';
  const hash = window.location.hash.replace(/^#/, '');
  if (hash && hash !== '/') return normalizeHash();
  return normalizeRoutePath(window.location.pathname || HOME_PATH);
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
  path = normalizeRoutePath(path);
  const nextHash = hashFor(path);
  if (window.location.hash !== nextHash) {
    const currentIndex = window.history.state?.aimeasyIndex ?? 0;
    saveScrollPosition();
    window.history.replaceState({ aimeasyPath: path, aimeasyIndex: currentIndex }, '', nextHash);
  }
}

function pushRoute(path) {
  path = normalizeRoutePath(path);
  const nextHash = hashFor(path);
  if (window.location.hash !== nextHash) {
    const nextIndex = (window.history.state?.aimeasyIndex ?? 0) + 1;
    saveScrollPosition();
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

function saveScrollPosition() {
  const path = normalizeLocationRoute();
  const index = window.history.state?.aimeasyIndex ?? 'current';
  scrollPositions.set(`${index}:${path}`, { x: window.scrollX || 0, y: window.scrollY || 0 });
}

function restoreScrollPosition(path) {
  const index = window.history.state?.aimeasyIndex ?? 'current';
  const saved = scrollPositions.get(`${index}:${path}`) || scrollPositions.get(path);
  window.setTimeout(() => {
    window.scrollTo(saved?.x || 0, saved?.y || 0);
  }, 0);
}

function scrollToRouteTop() {
  window.setTimeout(() => window.scrollTo(0, 0), 0);
}

function setOnlyActive(selector, activeId) {
  document.querySelectorAll(selector).forEach((element) => {
    element.classList.toggle('active', Boolean(activeId && element.id === activeId));
  });
}

function activateStudentNav(path) {
  const [, child = 'dashboard'] = path.split('/').filter(Boolean);
  const page = STUDENT_NAV_BY_PAGE[child] || 'dashboard';
  document.querySelectorAll('#screen-app .nav-item').forEach((item) => item.classList.remove('active'));
  const active = Array.from(document.querySelectorAll('#screen-app .sidebar-nav .nav-item')).find((item) => {
    const onclick = item.getAttribute('onclick') || '';
    return onclick.includes(`navigateTo('${page}')`) || onclick.includes(`navigateTo("${page}")`);
  });
  active?.classList.add('active');
}

function activatePortalNav(path) {
  const parts = path.split('/').filter(Boolean);
  const portal = parts[0];
  const child = parts[1] || 'dashboard';
  if (portal === 'admin') {
    const section = ADMIN_ROUTE_TO_SECTION[child] || child;
    setOnlyActive('#screen-admin [id^="admin-nav-"]', `admin-nav-${section}`);
  } else if (portal === 'subadmin') {
    const section = SUBADMIN_ROUTE_TO_SECTION[child] || child;
    setOnlyActive('#screen-subadmin [id^="sa-nav-"]', `sa-nav-${section}`);
  } else if (portal === 'creator') {
    setOnlyActive('#screen-creator [id^="cr-nav-"]', `cr-nav-${child}`);
  }
}

function titleFromRoute(path, page) {
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 'student') {
    const visibleTitle = document.getElementById('topbar-title')?.textContent?.trim();
    return visibleTitle || STUDENT_PAGE_TITLES[parts[1] || 'dashboard'] || 'Student App';
  }
  if (parts[0] === 'admin') return document.getElementById('admin-topbar-title')?.textContent?.trim() || 'Admin Portal';
  if (parts[0] === 'subadmin') return document.getElementById('sa-topbar-title')?.textContent?.trim() || 'Sub Admin Portal';
  if (parts[0] === 'creator') return document.getElementById('cr-topbar-title')?.textContent?.trim() || 'Creator Portal';
  return page?.title || 'Not Found';
}

function syncRouteSurfaces(path, page) {
  const normalized = normalizeRoutePath(path);
  activateStudentNav(normalized);
  activatePortalNav(normalized);
  const title = titleFromRoute(normalized, page);
  document.title = title === APP_TITLE ? APP_TITLE : `${title} | ${APP_TITLE}`;
}

function routeToNotFound(path) {
  const page = getPageByPath('/not-found');
  suppressRouteUpdate = true;
  if (typeof window.showScreen === 'function') {
    window.showScreen(page.screenId);
  } else {
    showOnlyScreen(page.screenId);
  }
  suppressRouteUpdate = false;
  replaceRoute('/not-found');
  syncRouteSurfaces('/not-found', page);
  console.log('[ROUTE] Route Blocked', { requestedRoute: path, reason: 'not-found' });
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
  path = normalizeRoutePath(path);
  const parts = path.split('/').filter(Boolean);
  const child = parts[1] || 'dashboard';
  return (
    ONBOARDING_PATHS.has(path) ||
    isValidStudentRoute(path) ||
    (parts[0] === 'creator' && CREATOR_SECTIONS.has(child)) ||
    (parts[0] === 'subadmin' && Object.values(SUBADMIN_SECTION_TO_ROUTE).includes(child)) ||
    (parts[0] === 'admin' && Object.values(ADMIN_SECTION_TO_ROUTE).includes(child)) ||
    Boolean(getPageByPath(path))
  );
}

async function applyRoute(path) {
  path = normalizeRoutePath(path);
  console.log('[ROUTE] Route Requested', {
    requestedRoute: path,
    hasSession: Boolean(typeof APP !== 'undefined' && (APP.session || APP.adminType)),
    restoring: Boolean(window.__aimeasyAuthRestoring),
  });

  const hasSession = (typeof APP !== 'undefined' && (APP.session || APP.adminType));
  if (!routeExists(path)) {
    if (hasSession && isDashboardRoute(path)) {
      applyDashboardRedirect({ role: currentAuthRole() });
      return;
    }
    routeToNotFound(path);
    return;
  }

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

  if (page.screenId === 'screen-app') {
    const studentPage = STUDENT_INNER_PAGES.has(childPath) ? childPath : 'dashboard';
    if (studentPage === 'subjects' && subjectId && typeof window.openSubject === 'function') {
      window.navigateTo?.('subjects');
      await window.openSubject(decodeRoutePart(subjectId));
    } else if ((studentPage === 'units' || studentPage === 'unit-content') && subjectId && typeof window.openSubject === 'function') {
      window.navigateTo?.('subjects');
      await window.openSubject(decodeRoutePart(subjectId));
      if (unitId && typeof window.openUnit === 'function') {
        window.openUnit(Number(decodeRoutePart(unitId)), decodeRoutePart(subjectId));
      }
    } else if (typeof window.navigateTo === 'function') {
      window.navigateTo(studentPage);
    } else {
      showStudentInnerPage(studentPage);
    }
  } else if (page.screenId === 'screen-subadmin' && typeof window.switchSASection === 'function') {
    window.switchSASection(decodeRoutePart(childPath || 'dashboard'));
  } else if (page.screenId === 'screen-admin' && typeof window.switchAdminSection === 'function') {
    window.switchAdminSection(decodeRoutePart(childPath || 'dashboard'));
  } else if (page.screenId === 'screen-creator' && typeof window.switchCRSection === 'function') {
    window.switchCRSection(decodeRoutePart(childPath || 'dashboard'));
  }

  suppressRouteUpdate = false;
  syncRouteSurfaces(path, page);
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
      const result = originalNavigateTo.call(this, pageName);

      if (!suppressRouteUpdate && STUDENT_INNER_PAGES.has(pageName)) {
        pushRoute(`/student/${pageName}`);
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
        const normalizedSection = SUBADMIN_ROUTE_TO_SECTION[section] || section;
        const route = SUBADMIN_SECTION_TO_ROUTE[normalizedSection] || normalizedSection;
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
        const normalizedSection = ADMIN_ROUTE_TO_SECTION[section] || section;
        const route = ADMIN_SECTION_TO_ROUTE[normalizedSection] || normalizedSection;
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

function installHistoryEventBridge() {
  if (window.__aimeasyHistoryEventBridgeInstalled) return;

  const wrapHistoryMethod = (methodName) => {
    const original = window.history?.[methodName];
    if (typeof original !== 'function') return;

    window.history[methodName] = function aimeasyHistoryMethod(...args) {
      const before = window.location.href;
      saveScrollPosition();
      const result = original.apply(this, args);
      const after = window.location.href;
      if (after !== before) {
        window.setTimeout(() => {
          window.dispatchEvent(new CustomEvent('aimeasy:navigation-state-change', {
            detail: { method: methodName, route: normalizeLocationRoute() },
          }));
        }, 0);
      }
      return result;
    };
  };

  wrapHistoryMethod('pushState');
  wrapHistoryMethod('replaceState');
  window.__aimeasyHistoryEventBridgeInstalled = true;
}

export function installBrowserNavigation() {
  if (window.__aimeasyBrowserNavigationInstalled) return;
  installHistoryEventBridge();
  let lastHandledHash = null;

  async function handleNavigationEvent({ restoreScroll = false, force = false } = {}) {
    const currentHash = normalizeLocationRoute();
    if (!force && currentHash === lastHandledHash && !isOAuthCallbackHash()) {
      syncRouteSurfaces(currentHash, pageForRoute(normalizedMainPathFor(currentHash)));
      return;
    }
    lastHandledHash = currentHash;

    if (isOAuthCallbackHash()) {
      oauthNavigationHandled = true;
      window.showLoading?.('Completing Google sign-in...');
      await requestAuthSync({ reason: 'hashchange-oauth-callback' });
      return;
    }

    await applyRoute(currentHash);
    if (restoreScroll) restoreScrollPosition(currentHash);
    else scrollToRouteTop();
  }

  window.addEventListener('popstate', async () => {
    console.log('[NAVIGATION] popstate triggered');
    await handleNavigationEvent({ restoreScroll: true, force: true });
  });

  window.addEventListener('hashchange', async () => {
    console.log('[NAVIGATION] hashchange triggered');
    await handleNavigationEvent({ force: true });
  });

  window.addEventListener('aimeasy:navigation-state-change', async (event) => {
    console.log('[NAVIGATION] history state changed', event.detail || {});
    await handleNavigationEvent({
      restoreScroll: event.detail?.method === 'popstate',
      force: true,
    });
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
  if (!window.__aimeasyBrowserNavigationInstalled) {
    installBrowserNavigation();
  }
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
  const hash = normalizeLocationRoute();
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
    } else if (!isProtectedRoute && !routeExists(hash)) {
      routeToNotFound(hash);
    } else {
      if (isAuthBootstrapLocked()) return;
      await applyRoute(HOME_PATH);
      replaceRoute(HOME_PATH);
    }
    return;
  }

  const requestedRoute = normalizeLocationRoute();
  console.log('[REFRESH DEBUG] Requested Route', requestedRoute);
  if (routeExists(requestedRoute)) {
    await applyRoute(requestedRoute);
    replaceRoute(requestedRoute);
    console.log('[ROUTER] Route Restored', requestedRoute);
  } else if (isProtectedRoute) {
    applyDashboardRedirect({ role: currentAuthRole() });
    console.log('[ROUTER] Invalid protected route redirected', {
      requestedRoute,
      target: window.history.state?.aimeasyPath || normalizeLocationRoute(),
    });
  } else {
    routeToNotFound(requestedRoute);
    console.log('[ROUTER] Invalid public route rendered not found', { requestedRoute });
  }
}
