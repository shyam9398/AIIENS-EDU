export const ROLE = Object.freeze({
  ADMIN: 'admin',
  SUBADMIN: 'subadmin',
  CONTENT_CREATOR: 'content_creator',
  STUDENT: 'student',
});

export const ROLE_DASHBOARD_PATH = Object.freeze({
  [ROLE.STUDENT]: '/student/dashboard',
  [ROLE.CONTENT_CREATOR]: '/creator/dashboard',
  [ROLE.SUBADMIN]: '/subadmin/dashboard',
  [ROLE.ADMIN]: '/admin/dashboard',
});

export const ROLE_SCREEN = Object.freeze({
  [ROLE.STUDENT]: 'screen-app',
  [ROLE.CONTENT_CREATOR]: 'screen-creator',
  [ROLE.SUBADMIN]: 'screen-subadmin',
  [ROLE.ADMIN]: 'screen-admin',
});

const LEGACY_ROLE_ALIASES = Object.freeze({
  creator: ROLE.CONTENT_CREATOR,
  teacher: ROLE.CONTENT_CREATOR,
  content_creator: ROLE.CONTENT_CREATOR,
  student: ROLE.STUDENT,
  subadmin: ROLE.SUBADMIN,
  admin: ROLE.ADMIN,
});

const ADMIN_ROUTE_ALIASES = Object.freeze({
  'create-manage': 'create',
  'url-approvals': 'approvals',
});

const SUBADMIN_ROUTE_ALIASES = Object.freeze({
  'create-subject': 'subjects',
  content: 'view',
  'manage-content': 'view',
  'url-approvals': 'urls',
});

export function normalizeRole(role) {
  return LEGACY_ROLE_ALIASES[String(role || '').trim()] || null;
}

export function isAllowedRole(role) {
  return !!normalizeRole(role);
}

export function dashboardPathForRole(role) {
  return ROLE_DASHBOARD_PATH[normalizeRole(role)] || '/landing';
}

export function screenForRole(role) {
  return ROLE_SCREEN[normalizeRole(role)] || 'screen-landing';
}

export function roleCanAccess(role, targetRole) {
  const actual = normalizeRole(role);
  if (targetRole === 'onboarding') return actual === ROLE.STUDENT || actual === ROLE.CONTENT_CREATOR;
  const target = normalizeRole(targetRole);
  if (!target || target === 'public') return true;
  return actual === target;
}

function currentHashRoute() {
  const raw = (window.location.hash || '').replace(/^#/, '');
  if (!raw || raw === '/') return '/landing';
  return raw.startsWith('/') ? raw : `/${raw}`;
}

function routeMatchesRole(route, role) {
  const normalizedRole = normalizeRole(role);
  if (normalizedRole === ROLE.STUDENT) return /^\/student(\/|$)/.test(route);
  if (normalizedRole === ROLE.CONTENT_CREATOR) return /^\/creator(\/|$)/.test(route);
  if (normalizedRole === ROLE.SUBADMIN) return /^\/subadmin(\/|$)/.test(route);
  if (normalizedRole === ROLE.ADMIN) return /^\/admin(\/|$)/.test(route);
  return false;
}

export function applyDashboardRedirect(profile, { replace = true } = {}) {
  const role = normalizeRole(profile?.role);
  const requestedPath = currentHashRoute();
  const preservePath = routeMatchesRole(requestedPath, role) ? requestedPath : '';
  const path = preservePath || dashboardPathForRole(role);
  const screenId = screenForRole(role);
  const requestedRoute = window.location.hash || window.location.pathname;
  console.log("NAVIGATING TO", path);
  console.log('[ROUTE] Redirect executed', { requestedRoute, target: path, role });


  if (role === ROLE.STUDENT) {
    window.APP.adminType = null;
    window.APP.subAdminData = null;
    if (preservePath) {
      document.querySelectorAll('.screen').forEach((screen) => screen.classList.remove('active'));
      document.getElementById(ROLE_SCREEN[ROLE.STUDENT])?.classList.add('active');
      window.updateSidebarProfile?.();
      const chatFab = document.getElementById('chat-fab');
      if (chatFab) chatFab.style.display = 'flex';
    } else {
      window.launchApp?.();
    }
  } else if (role === ROLE.CONTENT_CREATOR) {
    window.APP.adminType = ROLE.CONTENT_CREATOR;
    window.APP.subAdminData = window.APP.subAdminData || { username: profile?.full_name || profile?.email || 'Creator', role };
    window.__aimeasyPreserveRoleRoute = preservePath;
    window.launchCreatorScreen?.();
  } else if (role === ROLE.SUBADMIN) {
    window.APP.adminType = ROLE.SUBADMIN;
    window.__aimeasyPreserveRoleRoute = preservePath;
    window.launchSubAdmin?.();
  } else if (role === ROLE.ADMIN) {
  window.APP.adminType = ROLE.ADMIN;
  window.__aimeasyPreserveRoleRoute = preservePath;

  document.querySelectorAll('.screen')
    .forEach(s => s.classList.remove('active'));

  document.getElementById('screen-admin')
    ?.classList.add('active');

  window.switchAdminSection?.('dashboard');

  window.hideLoading?.();

} else {
  window.showScreen?.('screen-landing');
}

  if (role !== ROLE.ADMIN && !document.getElementById(screenId)?.classList.contains('active')) {
    window.showScreen?.(screenId);
  }

  const [, childPath] = path.split('/').filter(Boolean);
  if (preservePath && childPath) {
    window.setTimeout(() => {
      if (role === ROLE.STUDENT) window.startBrowserNavigation?.();
      if (role === ROLE.CONTENT_CREATOR) window.switchCRSection?.(childPath);
      if (role === ROLE.SUBADMIN) window.switchSASection?.(SUBADMIN_ROUTE_ALIASES[childPath] || childPath);
      if (role === ROLE.ADMIN) window.switchAdminSection?.(ADMIN_ROUTE_ALIASES[childPath] || childPath);
      console.log('[ROUTE RESTORE] Role route restored', { requestedPath, role, childPath });
      window.__aimeasyPreserveRoleRoute = '';
    }, 0);
  } else {
    window.__aimeasyPreserveRoleRoute = '';
  }

  const url = `${window.location.pathname}#${path}`;
  if (replace) window.history?.replaceState?.({ aimeasyPath: path, aimeasyIndex: 1 }, '', url);
  else window.history?.pushState?.({ aimeasyPath: path, aimeasyIndex: 1 }, '', url);
  console.log('[ROUTE] Route Allowed', { requestedRoute, target: path, role });
  console.log('[ROUTE] Final Route', { route: path, role });
  console.log('[DASHBOARD] Loaded', { role, path });
  console.log("DASHBOARD REDIRECT SUCCESS");

// Hide loading overlay after successful dashboard load
  window.hideLoading?.();

  const overlay = document.getElementById('loading-overlay');
  if (overlay) {
  overlay.classList.add('hidden');
  overlay.style.display = 'none';
}

return path;
}
