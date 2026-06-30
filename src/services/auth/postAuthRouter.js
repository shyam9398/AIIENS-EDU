import { authLog, AUTH_STAGES } from './authLogger.js';
import {
  clearLoginPortal,
  ensureProfileForAuthUser,
  getLoginPortal,
  isProfileAcademicComplete,
  isCreatorProfileComplete,
  isProfileFullyComplete,
  isProfilePersonalComplete,
  isStudentPersonalComplete,
  portalMismatchMessage,
  profileToLegacyUser,
  validatePortalRole,
} from './profileService.js';
import { branchFromProfile, setCurrentBranch } from './branchContext.js';
import { ROLE, applyDashboardRedirect, normalizeRole, screenForRole } from './roleRedirectService.js';

function replaceHashRoute(path) {
  const cleanUrl = `${window.location.pathname}#${path}`;
  window.history?.replaceState?.({ aimeasyPath: path, aimeasyIndex: 1 }, '', cleanUrl);
}

function currentHashRoute() {
  const raw = (window.location.hash || '').replace(/^#/, '');
  if (raw && raw !== '/') return raw.startsWith('/') ? raw : `/${raw}`;
  const path = window.location.pathname || '';
  if (!path || path === '/' || path === '/index.html') return '/landing';
  if (path === '/dashboard') return '/student/dashboard';
  return path.startsWith('/') ? path : `/${path}`;
}

function routeMatchesRole(route, role) {
  const normalizedRole = normalizeRole(role);
  if (normalizedRole === ROLE.STUDENT) return /^\/student(\/|$)/.test(route);
  if (normalizedRole === ROLE.CONTENT_CREATOR) return /^\/creator(\/|$)/.test(route);
  if (normalizedRole === ROLE.SUBADMIN) return /^\/subadmin(\/|$)/.test(route);
  if (normalizedRole === ROLE.ADMIN) return /^\/admin(\/|$)/.test(route);
  return false;
}

function shouldPreserveCurrentRoute(reason, role) {
  const route = currentHashRoute();
  const routingReason = String(reason || '');
  const restoreReason =
    routingReason.includes('restore') ||
    routingReason.includes('bootstrap') ||
    routingReason.includes('react-auth-session') ||
    routingReason.includes('authenticated') ||
    routingReason.includes('protected-route');
  const protectedRoute = /^\/(student|creator|subadmin|admin)(\/|$)/.test(route);
  const onboardingRoute = route === '/personal-details' || route === '/academic-details';
  if (protectedRoute && routeMatchesRole(route, role)) return true;
  return restoreReason && onboardingRoute;
}

function showProfileStep(which) {
  const step1 = document.getElementById('profile-step1');
  const step2 = document.getElementById('profile-step2');
  const s1 = document.getElementById('step1');
  const s2 = document.getElementById('step2');
  if (which === 'personal') {
    if (step1) step1.style.display = 'block';
    if (step2) step2.style.display = 'none';
    s1?.classList.add('active');
    s2?.classList.remove('active', 'done');
  } else if (which === 'academic') {
    if (step1) step1.style.display = 'none';
    if (step2) step2.style.display = 'block';
    s1?.classList.add('done');
    s2?.classList.add('active');
  }
}

function prefillProfileForm(user) {
  const u = user || {};
  if (u.name) document.getElementById('p-name') && (document.getElementById('p-name').value = u.name);
  if (u.college) document.getElementById('p-college') && (document.getElementById('p-college').value = u.college);
  if (u.phone) document.getElementById('p-phone') && (document.getElementById('p-phone').value = u.phone);
  if (u.role_type) document.getElementById('p-role-type') && (document.getElementById('p-role-type').value = u.role_type);
  if (u.qualification) document.getElementById('p-qualification') && (document.getElementById('p-qualification').value = u.qualification);
  if (u.experience) document.getElementById('p-experience') && (document.getElementById('p-experience').value = u.experience);
  if (u.year) document.getElementById('p-year') && (document.getElementById('p-year').value = u.year);
  window.updateSemesterOptions?.();
  if (u.semester) document.getElementById('p-semester') && (document.getElementById('p-semester').value = u.semester);
  window.aimeasyHydrateProfileDropdowns?.(document, {
    savedUniversity: u.university || u.university_name,
    savedBranch: u.branch || u.branch_name,
    savedRegulation: u.regulation || u.regulation_code,
    universityId: u.university_id,
    branchId: u.branch_id,
  });
}

function updateStatusText(text) {
  const el = document.getElementById('setup-profile-status');
  if (el) el.textContent = text;
}

function isLiveWorkshopAuthRequest(selectedRole) {
  try {
    const hash = window.location.hash || '';
    return selectedRole === 'live_workshop'
      || getLoginPortal() === 'live_workshop'
      || sessionStorage.getItem('aiiens_live_workshop_auth') === '1'
      || hash.includes('live-workshops')
      || currentHashRoute() === '/live-workshops';
  } catch {
    const hash = window.location.hash || '';
    return selectedRole === 'live_workshop' || hash.includes('live-workshops') || currentHashRoute() === '/live-workshops';
  }
}

/**
 * Single post-auth entry for Google / Supabase login.
 * Never leaves authenticated user on landing.
 */
export async function routeAfterAuth(authUser, { reason, selectedRole } = {}) {
  authLog(AUTH_STAGES.SUCCESS, { reason, userId: authUser?.id });
  console.log('[ROUTE] Route Requested', { reason, requestedRoute: currentHashRoute(), source: 'post-auth' });
  console.log('[AUTH] Session Found', { userId: authUser?.id, reason });

  window.__aimeasyRoutingInProgress = true;
  const currentRoute = currentHashRoute();
  if (isLiveWorkshopAuthRequest(selectedRole)) {
    window.__aimeasyRoutingInProgress = false;
    window.hideLoading?.();
    replaceHashRoute('/live-workshops');
    if (typeof window.openLiveWorkshops === 'function') {
      window.setTimeout(() => window.openLiveWorkshops?.(), 0);
    } else {
      window.showScreen?.('screen-live-workshops');
    }
    console.log('[ROUTE] Live workshop auth allowed', { reason, requestedRoute: currentRoute });
    return true;
  }

  const isProtectedOrOnboarding = /^\/(student|creator|subadmin|admin)(\/|$)/.test(currentRoute) || currentRoute === '/personal-details' || currentRoute === '/academic-details';
  const isBackgroundRestore = String(reason || '').includes('react-auth-session') || String(reason || '').includes('restore');
  if (!isProtectedOrOnboarding && !isBackgroundRestore) {
    window.showScreen?.('screen-setting-up-profile');
    
    // Failsafe timeout protection (5 seconds)
    window.setTimeout(() => {
      const currentActive = document.querySelector('.screen.active')?.id;
      if (currentActive === 'screen-setting-up-profile') {
        console.warn("[DEBUG_AUTH] Loading timeout triggered - Failsafe routing to fallback");
        const fallbackUser = window.APP?.user || JSON.parse(localStorage.getItem('aiiens_session_user') || '{}');
        const fallbackRole = normalizeRole(fallbackUser?.role) || ROLE.STUDENT;
        
        // Clear routing flags and hide loaders
        window.__aimeasyRoutingInProgress = false;
        window.hideLoading?.();
        
        // Force redirect to fallback dashboard
        const screenId = screenForRole(fallbackRole);
        if (screenId) {
          window.showScreen?.(screenId);
          applyDashboardRedirect(fallbackUser);
        }
      }
    }, 5000);
  }
  
  updateStatusText('Authenticating account...');
  console.log('[DEBUG_AUTH] Authentication success', { userId: authUser?.id, email: authUser?.email, reason });

  try {

  const requestedRole = normalizeRole(selectedRole || getLoginPortal());
  const createRole = requestedRole || ROLE.STUDENT;
  console.time('PROFILE_SETUP');
  const { profile: row, error, created } = await ensureProfileForAuthUser(authUser, createRole);
  console.timeEnd('PROFILE_SETUP');

  updateStatusText('Fetching profile details...');
  console.log('[DEBUG_AUTH] User data fetched', { email: authUser?.email, id: authUser?.id });
  if (error || !row) {
    window.hideLoading?.();
    window.showToast?.('Profile setup failed: ' + (error?.message || 'Unable to create profile'), 'red');
    console.log('[ROUTE] Route Blocked', { reason, requestedRoute: currentHashRoute(), issue: 'profile-setup-failed' });
    window.__aimeasyRoutingInProgress = false;
    return false;
  }
  console.log(created ? '[AUTH] Profile Created' : '[AUTH] Profile Loaded', {
    userId: authUser?.id,
    role: row.role,
    onboarding_completed: Boolean(row.onboarding_completed),
  });

  if (row.onboarding_completed) {
    console.log('[ONBOARDING] Existing User', { userId: authUser?.id, role: row.role });
    console.log('[AUTH] Existing User', { userId: authUser?.id });
    console.log('[ONBOARDING] Skipped', { userId: authUser?.id });
  } else {
    console.log('[ONBOARDING] New User', { userId: authUser?.id, role: row.role });
    console.log('[AUTH] New User', { userId: authUser?.id });
    console.log('[ONBOARDING] Required', { userId: authUser?.id });
  }

  const dbRole = normalizeRole(row.role);
  console.log('[DEBUG_AUTH] User role detected', { role: dbRole });
  updateStatusText(`Initializing ${dbRole || 'user'} workspace...`);
  const check = requestedRole ? validatePortalRole(requestedRole, dbRole) : { ok: true };
  if (!check.ok) {
    window.hideLoading?.();
    window.showToast?.(portalMismatchMessage(requestedRole, dbRole), 'red');
    clearLoginPortal();
    console.log('[ROUTE] Route Blocked', { reason, requestedRoute: currentHashRoute(), issue: 'portal-role-mismatch' });
    window.__aimeasyRoutingInProgress = false;
    return false;
  }

  const legacyUser = profileToLegacyUser(row);
  if (!legacyUser.name) {
    legacyUser.name =
      authUser.user_metadata?.full_name ||
      authUser.user_metadata?.name ||
      authUser.email?.split('@')[0] ||
      '';
  }
  if (!window.APP) {
  window.APP = {
    role: 'student',
    user: null,
    session: false,
    adminType: null,
    subAdminData: null
  };
}

console.log('APP CHECK', window.APP);
  window.APP.role = dbRole;
  window.APP.user = legacyUser;
  window.APP.session = true;
  setCurrentBranch(branchFromProfile(row) || legacyUser.branch || legacyUser.branch_name);

  if (dbRole === ROLE.ADMIN || dbRole === ROLE.SUBADMIN) {
    clearLoginPortal();
    window.__aimeasyOnboardingRouteLock = false;
    window.hideLoading?.();
    applyDashboardRedirect(legacyUser);
    window.__aimeasyRoutingInProgress = false;
    return true;
  }

  localStorage.setItem('edusync_session_user', JSON.stringify(legacyUser));
  window.syncCreatorProfileFields?.();
  if (dbRole === ROLE.STUDENT && isProfileFullyComplete(legacyUser)) {
    window.updateSidebarProfile?.();
  }

  if (dbRole === ROLE.STUDENT ? !isStudentPersonalComplete(legacyUser) : !isProfilePersonalComplete(legacyUser)) {
    authLog(AUTH_STAGES.PERSONAL_COMPLETE, { complete: false });
    authLog(AUTH_STAGES.REDIRECT_PERSONAL, {});
    window.__aimeasyOnboardingRouteLock = true;
    prefillProfileForm(legacyUser);
    showProfileStep('personal');
    
    updateStatusText('Redirecting to onboarding...');
    console.log('[DEBUG_AUTH] Dashboard navigation triggered', { target: '/personal-details', role: dbRole });
    
    window.showScreen?.('screen-profile');
    replaceHashRoute('/personal-details');
    window.hideLoading?.();
    console.log('[ONBOARDING] Personal Details Required', { userId: authUser?.id, role: dbRole });
    console.log('[ROUTE] Route Allowed', { reason, requestedRoute: currentHashRoute(), target: '/personal-details' });
    console.log('[ROUTE] Final Route', { route: '/personal-details' });
    window.__aimeasyRoutingInProgress = false;
    return true;
  }
  authLog(AUTH_STAGES.PERSONAL_COMPLETE, { complete: true });

  if (dbRole === ROLE.CONTENT_CREATOR && (!isCreatorProfileComplete(legacyUser) || !legacyUser.onboarding_completed)) {
    authLog(AUTH_STAGES.REDIRECT_PERSONAL, { role: dbRole });
    window.__aimeasyOnboardingRouteLock = true;
    prefillProfileForm(legacyUser);
    showProfileStep('personal');
    
    updateStatusText('Redirecting to onboarding...');
    console.log('[DEBUG_AUTH] Dashboard navigation triggered', { target: '/personal-details', role: dbRole });
    
    window.showScreen?.('screen-profile');
    replaceHashRoute('/personal-details');
    window.hideLoading?.();
    console.log('[ONBOARDING] Personal Details Required', { userId: authUser?.id, role: dbRole });
    console.log('[ROUTE] Route Allowed', { reason, requestedRoute: currentHashRoute(), target: '/personal-details' });
    console.log('[ROUTE] Final Route', { route: '/personal-details' });
    window.__aimeasyRoutingInProgress = false;
    return true;
  }

  if (dbRole !== ROLE.CONTENT_CREATOR && (!isProfileAcademicComplete(legacyUser) || !legacyUser.onboarding_completed)) {
    authLog(AUTH_STAGES.ACADEMIC_COMPLETE, { complete: false });
    authLog(AUTH_STAGES.REDIRECT_ACADEMIC, {});
    window.__aimeasyOnboardingRouteLock = true;
    prefillProfileForm(legacyUser);
    showProfileStep('academic');
    
    updateStatusText('Redirecting to onboarding...');
    console.log('[DEBUG_AUTH] Dashboard navigation triggered', { target: '/academic-details', role: dbRole });
    
    window.showScreen?.('screen-profile');
    replaceHashRoute('/academic-details');
    window.aimeasyHydrateProfileDropdowns?.(document, {
      savedUniversity: legacyUser.university || legacyUser.university_name,
      savedBranch: legacyUser.branch || legacyUser.branch_name,
      savedRegulation: legacyUser.regulation || legacyUser.regulation_code,
      universityId: legacyUser.university_id,
      branchId: legacyUser.branch_id,
    });
    window.hideLoading?.();
    console.log('[ONBOARDING] Academic Details Required', { userId: authUser?.id, role: dbRole });
    console.log('[ROUTE] Route Allowed', { reason, requestedRoute: currentHashRoute(), target: '/academic-details' });
    console.log('[ROUTE] Final Route', { route: '/academic-details' });
    window.__aimeasyRoutingInProgress = false;
    return true;
  }
  authLog(AUTH_STAGES.ACADEMIC_COMPLETE, { complete: true });

  if (isProfileFullyComplete(legacyUser)) {
    authLog(AUTH_STAGES.REDIRECT_DASHBOARD, {});
    clearLoginPortal();
    window.__aimeasyOnboardingRouteLock = false;
    setCurrentBranch(legacyUser.branch || legacyUser.branch_name);
    window.hideLoading?.();
    console.log('[ONBOARDING] Onboarding Complete', { userId: authUser?.id, role: dbRole });
    if (shouldPreserveCurrentRoute(reason, dbRole)) {
      if (dbRole === ROLE.STUDENT) {
        window.updateSidebarProfile?.();
      }
      const screenId = screenForRole(dbRole);
      if (screenId && !document.getElementById(screenId)?.classList.contains('active')) {
        window.showScreen?.(screenId);
      }
      
      updateStatusText('Launching workspace...');
      console.log('[DEBUG_AUTH] Dashboard navigation triggered (preserved)', { target: currentHashRoute(), role: dbRole });
      
      console.log('[ROUTE] Route Allowed', {
        reason,
        requestedRoute: currentHashRoute(),
        role: dbRole,
        preserved: true,
      });
      console.log('[ROUTE] Final Route', { route: currentHashRoute() });
      window.__aimeasyRoutingInProgress = false;
      window.setTimeout(() => window.startBrowserNavigation?.(), 0);
      return true;
    }
    
    updateStatusText('Launching dashboard...');
    console.log('[DEBUG_AUTH] Dashboard navigation triggered', { target: 'role-dashboard', role: dbRole });
    
    console.log('[ROUTE] Redirect executed', { reason, requestedRoute: currentHashRoute(), target: 'role-dashboard' });
    applyDashboardRedirect(legacyUser);
    window.__aimeasyRoutingInProgress = false;
    return true;
  }


  console.log('[ROUTE] Route Blocked', { reason, requestedRoute: currentHashRoute(), issue: 'profile-incomplete' });
  window.__aimeasyRoutingInProgress = false;
  return false;
  } catch (error) {
    window.hideLoading?.();
    console.warn('[AUTH] Post-auth routing failed', error);
    console.log('[ROUTE] Route Blocked', {
      reason,
      requestedRoute: currentHashRoute(),
      issue: 'post-auth-exception',
      error: error?.message || String(error),
    });
    return false;
  } finally {
    window.__aimeasyRoutingInProgress = false;
  }
}

export async function routeStudentAfterAuth(authUser, options = {}) {
  return routeAfterAuth(authUser, { ...options, selectedRole: options.selectedRole || ROLE.STUDENT });
}

export async function routeContentCreatorAfterAuth(authUser, options = {}) {
  return routeAfterAuth(authUser, { ...options, selectedRole: options.selectedRole || ROLE.CONTENT_CREATOR });
}

export function isOAuthCallbackUrl() {
  const hash = window.location.hash || '';
  const search = window.location.search || '';
  return (
    hash.includes('access_token') ||
    hash.includes('refresh_token') ||
    hash.includes('code=') ||
    search.includes('code=')
  );
}
