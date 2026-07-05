/**
 * Critical system fixes — auth, roles, navigation, video, search, content, admin stats.
 * Loaded after legacy scripts; patches window globals without changing UI markup.
 */
import { hydrateProfileAcademicDropdowns } from '../services/academic/academicCatalog.js';
import { resolveAcademicSelection } from '../services/academic/academicCatalogStore.js';
import { fetchAdminDashboardStats, fetchLandingStats } from '../services/admin/adminStatsService.js';
import { authLog, AUTH_STAGES } from '../services/auth/authLogger.js';
import { exchangeOAuthCodeOnce, getSessionOnce, invalidateSessionCache, signInWithGoogle, withAuthTimeout } from '../services/auth/authService.js';
import {
  clearLoginPortal,
  isCreatorProfileComplete,
  isProfileAcademicComplete,
  isProfileFullyComplete,
  isProfilePersonalComplete,
  profileToLegacyUser,
  setLoginPortal,
  upsertProfileFromLegacy,
} from '../services/auth/profileService.js';
import { isOAuthCallbackUrl, routeAfterAuth } from '../services/auth/postAuthRouter.js';
import { ROLE, applyDashboardRedirect, normalizeRole } from '../services/auth/roleRedirectService.js';
import { setCurrentBranch } from '../services/auth/branchContext.js';
import {
  applyPortalSessionToApp,
  authenticatePortalLogin,
  clearPortalSession,
  fetchSubAdminAccounts,
  installSubAdminAssignmentSync,
  persistPortalSession,
  restorePortalSession,
} from '../services/auth/portalAuthService.js';
import { createContentItem, deleteContentItem, listContentItems, normalizeContentType, updateContentItem } from '../services/content/contentRepository.js';
import {
  fetchCurriculumStats,
  saveLinkedContentItem,
} from '../repositories/contentRepository.js';
import {
  fetchUnitRoadmap,
  saveUnitRoadmap,
} from '../repositories/topicRepository.js';
import {
  fetchSubjects,
  fetchSubjectById,
  createSubject,
  updateSubject,
  deleteSubject,
} from '../repositories/subjectRepository.js';
import {
  fetchUnits,
  createUnit,
  updateUnit,
  deleteUnit,
} from '../repositories/unitRepository.js';
import {
  deleteSubjectSyllabus,
  fetchSubjectSyllabus,
  upsertSubjectSyllabus,
} from '../repositories/syllabusRepository.js';
import {
  createCurriculumBlueprint,
  fetchWorkflowDashboardCounts,
  listCurriculumContent,
  listCurriculums,
  saveCurriculumContent,
  updateCurriculumStatus,
} from '../services/curriculum/curriculumWorkflowRepository.js';
import { stopVideoPlayer } from '../services/media/stopVideoPlayer.js';
import { searchStudentContent } from '../services/search/studentSearch.js';

export function installCriticalFixes() {
  if (window.__aimeasyCriticalFixesInstalled) return;
  window.__aimeasyCriticalFixesInstalled = true;

  window.stopVideoPlayer = stopVideoPlayer;
  window.aimeasyRouteAfterAuth = routeAfterAuth;
  window.aimeasyStartGoogleOAuth = signInWithGoogle;
  window.aimeasyHydrateProfileDropdowns = hydrateProfileAcademicDropdowns;
  window.aiiensHydrateStudentAcademicDetails = hydrateProfileAcademicDropdowns;
  window.__aimeasyAuthSyncInFlight = null;
  window.__aimeasyCentralAuthInstalled = true;
  window.__aimeasyAuthBootstrapComplete = true;

  const actionIcon = {
    edit: '<span aria-hidden="true">&#9998;</span>',
    delete: '<span aria-hidden="true">&times;</span>',
  };

  function escAttr(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function getStoredLoginPortal() {
    return sessionStorage.getItem('aimeasy_login_portal') || localStorage.getItem('aimeasy_login_portal_backup');
  }

  function isLiveWorkshopLoginRequest() {
    try {
      return getStoredLoginPortal() === 'live_workshop'
        || sessionStorage.getItem('aiiens_live_workshop_auth') === '1'
        || (window.location.hash || '').includes('live-workshops');
    } catch {
      return (window.location.hash || '').includes('live-workshops');
    }
  }

  function hasActiveLegacyAdminSession() {
    const route = (window.location.hash || '').replace(/^#/, '');
    return /^\/(admin|subadmin|creator)(\/|$)/.test(route) && Boolean(window.APP?.adminType);
  }

  function cleanHashUrl(path) {
    return `${window.location.pathname}#${path}`;
  }

  function clearLiveWorkshopPortalMarker() {
    try {
      sessionStorage.removeItem('aiiens_live_workshop_auth');
    } catch {
      /* ignore */
    }
  }

  window.updateGoogleAuthTermsState = function updateGoogleAuthTermsState() {
    const checkbox = document.getElementById('google-auth-terms');
    const button = document.getElementById('google-auth-continue');
    if (button) button.disabled = !checkbox?.checked;
  };
  async function routeExistingSessionToDashboard({ selectedRole, reason } = {}) {
    try {
      const normalizedRole = normalizeRole(selectedRole || window.APP?.role || getStoredLoginPortal());
      const { data, error } = await withAuthTimeout(getSessionOnce(), 'routeExistingSession.getSession');
      if (error) {
        console.warn('Supabase getSession error:', error.message);
        return false;
      }
      if (!data?.session?.user) {
        console.log('[AUTH] Session Missing', { reason });
        return false;
      }

      const authUser = data.session.user;
      console.log('[AUTH] Session Found', { userId: authUser.id, reason });
      console.log('[AUTH] Existing User', { userId: authUser.id });
      console.log('[ONBOARDING] Existing session profile review', { userId: authUser.id, reason });

      return withAuthTimeout(
        routeAfterAuth(authUser, { reason, selectedRole: normalizedRole || undefined }),
        'routeExistingSession.routeAfterAuth',
      );
    } catch (e) {
      console.warn('routeExistingSessionToDashboard failed:', e);
      return false;
    }
  }

  function openCreatorAccess() {
    clearPortalSession();
    setLoginPortal(ROLE.CONTENT_CREATOR);
    if (window.APP) {
      window.APP.role = ROLE.CONTENT_CREATOR;
      window.APP.adminType = null;
      window.APP.subAdminData = null;
      window.APP.session = false;
      window.APP.user = null;
    }
    window.__aimeasyPreserveRoleRoute = '';
    document.querySelectorAll('.role-card').forEach((card) => card.classList.remove('selected'));
    document.getElementById('role-creator')?.classList.add('selected');
    // Business rule: session exists → dashboard (no Google auth, no onboarding).
    if (window.__AIMEASY_SUPABASE__?.auth?.getSession) {
      window.__AIMEASY_SUPABASE__.auth.getSession().then(({ data }) => {
        if (data?.session?.user) {
          routeExistingSessionToDashboard({ selectedRole: ROLE.CONTENT_CREATOR, reason: 'role-selection-existing-session' });
        } else {
          syncGoogleAuthScreen();
          window.showScreen?.('screen-google-auth');
          window.setTimeout(() => window.updateGoogleAuthTermsState?.(), 0);
        }
      });
      return;
    }
    syncGoogleAuthScreen();
    window.showScreen?.('screen-google-auth');
    window.setTimeout(() => window.updateGoogleAuthTermsState?.(), 0);
  }

  function syncGoogleAuthScreen() {
    const isWorkshop = isLiveWorkshopLoginRequest();
    const role = isWorkshop ? 'live_workshop' : (normalizeRole(window.APP?.role || getStoredLoginPortal()) || ROLE.STUDENT);
    const isCreator = role === ROLE.CONTENT_CREATOR;
    const titleEl = document.getElementById('google-auth-title');
    const subEl = document.getElementById('google-auth-sub');
    const roleTagEl = document.getElementById('google-auth-role-tag');
    if (titleEl) titleEl.textContent = isWorkshop ? 'Sign in for Live Workshop' : (isCreator ? 'Sign in as Teacher' : 'Sign in as Student');
    if (subEl) {
      subEl.textContent = isWorkshop
        ? 'Choose your Google account to continue to Live Workshops.'
        : isCreator
        ? 'Choose your Google account to continue as a Teacher. Your content, courses, and teaching resources will be synced automatically.'
        : 'Choose your Google account to continue as a Student. Your progress will be synced automatically.';
    }
    if (roleTagEl) {
      roleTagEl.textContent = isWorkshop ? 'Live Workshop Login' : (isCreator ? 'Teacher Login' : 'Student Login');
      roleTagEl.style.background = isCreator ? 'var(--teal-light)' : 'var(--primary-light)';
      roleTagEl.style.color = isCreator ? 'var(--teal)' : 'var(--primary)';
    }
    document.querySelectorAll('.google-auth-divider, .google-auth-mock-accounts').forEach((el) => {
      el.style.display = 'none';
    });
  }

  async function completeOAuthCallback(supabase) {
    const hash = window.location.hash || '';
    const search = window.location.search || '';
    const searchParams = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
    const rawHash = hash.replace(/^#/, '');
    const hashQuery = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : rawHash.replace(/^\/auth[/?&]?/, '');
    const hashParams = new URLSearchParams(hashQuery);
    const code = searchParams.get('code') || hashParams.get('code');

    if (code && typeof supabase.auth.exchangeCodeForSession === 'function') {
      const callbackKey = `pkce:${code}`;
      if (!window.__aimeasyOAuthCallbackKey || window.__aimeasyOAuthCallbackKey !== callbackKey) {
        window.__aimeasyOAuthCallbackKey = callbackKey;
        window.__aimeasyOAuthCallbackPromise = exchangeOAuthCodeOnce(code).then(() => {
          authLog(AUTH_STAGES.SUCCESS, { source: 'exchangeCodeForSession' });
          window.history.replaceState(window.history.state, '', `${window.location.pathname}#/auth`);
        });
      }
      return window.__aimeasyOAuthCallbackPromise;
    }

    if (typeof supabase.auth.getSessionFromUrl === 'function') {
      if (rawHash.startsWith('/auth') && /access_token|refresh_token/.test(rawHash)) {
        const tokenFragment = rawHash.replace(/^\/auth[/?&]?/, '');
        window.history.replaceState(window.history.state, '', `${window.location.pathname}#${tokenFragment}`);
      }
      await supabase.auth.getSessionFromUrl();
    }
  }

  // ─── Issue 1 & 2: Central Supabase post-auth (student Google only) ───
  window.syncSessionFromSupabase = async function syncSessionFromSupabaseFixed({ reason } = {}) {
    if (window.__aimeasyAuthSyncInFlight) return window.__aimeasyAuthSyncInFlight;
    const supabase = window.__AIMEASY_SUPABASE__;
    if (!supabase) return false;

    window.__aimeasyAuthSyncInFlight = (async () => {
      window.__aimeasyAuthRestoring = true;
      window.__aimeasyAuthBootstrapComplete = false;
      authLog(AUTH_STAGES.START, {
        reason,
        hash: window.location.hash,
        search: window.location.search,
      });

      const loginPortal = normalizeRole(getStoredLoginPortal());
      const isGoogleAuthFlow =
        isOAuthCallbackUrl() ||
        loginPortal === ROLE.STUDENT ||
        loginPortal === ROLE.CONTENT_CREATOR;

      if (isGoogleAuthFlow) {
        clearPortalSession();
      } else {
        const portalRestored = await restorePortalSession(supabase);
        if (portalRestored) {
          authLog(AUTH_STAGES.SESSION_FOUND, { source: 'portal-session', reason });
          window.__aimeasyRoutingInProgress = true;
          try {
            const portalRole = normalizeRole(window.APP?.role);
            applyDashboardRedirect({ role: portalRole });
            window.__aimeasyAuthBootstrapComplete = true;
            return true;
          } finally {
            window.__aimeasyRoutingInProgress = false;
          }
        }
      }

      const initialSession = await withAuthTimeout(getSessionOnce(), 'syncSessionFromSupabase.initialSession');

      if (initialSession.error) {
        console.warn('Supabase getSession error:', initialSession.error.message);
        window.hideLoading?.();
        return false;
      }

      const hasRestoredSession = Boolean(initialSession.data?.session?.user);

      if (isOAuthCallbackUrl()) {
        if (hasRestoredSession) {
          console.log('[AUTH] OAuth callback skipped; session already restored', {
            reason,
            userId: initialSession.data.session.user.id,
          });
          window.history.replaceState(window.history.state, '', `${window.location.pathname}#/auth`);
        } else {
          try {
            await withAuthTimeout(completeOAuthCallback(supabase), 'syncSessionFromSupabase.oauthCallback');
            invalidateSessionCache();
          } catch (e) {
            console.warn('OAuth callback completion:', e);
            const { data } = await supabase.auth.getSession();
            window.history.replaceState(window.history.state, '', `${window.location.pathname}#/auth`);
            window.hideLoading?.();
            if (!data?.session?.user) {
              window.showToast?.('Google sign-in could not be completed. Please try again.', 'red');
            }
            return false;
          }
        }
      }

      const { data, error } = hasRestoredSession
        ? initialSession
        : await withAuthTimeout(getSessionOnce(), 'syncSessionFromSupabase.finalSession');
      if (error) {
        console.warn('Supabase getSession error:', error.message);
        window.hideLoading?.();
        return false;
      }
      if (!data?.session?.user) {
        authLog('SESSION MISSING', { reason });
        console.log('[AUTH] Session Missing', { reason });
        window.hideLoading?.();
        return false;
      }

      const authUser = data.session.user;
      authLog(AUTH_STAGES.SESSION_FOUND, { userId: authUser.id, reason });
      console.log('[AUTH] Session Found', { userId: authUser.id, reason });
      console.log('[AUTH] Session Restored', { userId: authUser.id, reason });
      console.log('[AUTH] User Authenticated', { userId: authUser.id });

      // Fetch user profile from database
      let profile = null;
      try {
        const { data: pData } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', authUser.id)
          .maybeSingle();
        profile = pData;
      } catch (e) {
        console.warn('syncSessionFromSupabase: profile fetch failed', e);
      }

      if (profile) {
        window.APP = window.APP || {};
        window.APP.session = true;
        const dbRole = normalizeRole(profile.role);
        window.APP.role = dbRole;

        if (dbRole === ROLE.ADMIN) {
          window.APP.adminType = 'admin';
          window.APP.portalAuth = false;
          const username = profile.email?.split('@')[0] || profile.full_name;
          const { data: adminAcc } = await supabase.from('admin_accounts').select('*').eq('username', username).maybeSingle();
          window.APP.user = adminAcc || { id: authUser.id, name: username, email: authUser.email, role: 'admin' };
          window.APP.subAdminData = null;
        } else if (dbRole === ROLE.SUBADMIN) {
          window.APP.adminType = 'subadmin';
          window.APP.portalAuth = false;
          const username = profile.email?.split('@')[0] || profile.full_name;
          const { data: subAdminAcc } = await supabase.from('sub_admin_accounts').select('*').eq('username', username).maybeSingle();
          window.APP.subAdminData = subAdminAcc || {
            id: authUser.id,
            username: username,
            email: authUser.email,
            role: 'subadmin',
            branch: profile.branch_name || 'CSE',
            regulation: profile.regulation_code || '',
            university: profile.university_name || ''
          };
          window.APP.user = null;
        } else if (dbRole === ROLE.CONTENT_CREATOR) {
          window.APP.adminType = null;
          window.APP.portalAuth = false;
          window.APP.subAdminData = {
            username: profile.email?.split('@')[0] || profile.full_name,
            branch: profile.branch_name || 'CSE',
            role: 'content_creator'
          };
        } else {
          window.APP.adminType = null;
          window.APP.subAdminData = null;
          window.APP.portalAuth = false;
        }
      }

      console.log('CURRENT APP ROLE', window.APP?.role);

      if (
        (profile?.role === 'student' || window.APP?.role === 'student') &&
        typeof window.hydrateLegacyState === 'function'
      ) {
        console.log('[AUTH] Hydrating legacy state for student', authUser.id);
        await window.hydrateLegacyState();
      } else {
        console.log('[AUTH] Skipping legacy hydration', window.APP?.role);
      }
      const portal = getStoredLoginPortal();
      const routeRole = normalizeRole(profile?.role || portal);

      window.__aimeasyRoutingInProgress = true;
      try {
        console.log('[ROUTE] Final Route', {
          target: isProfileFullyComplete(window.APP?.user) ? 'role-dashboard' : 'post-auth-onboarding',
          userId: data.session.user.id,
          dbRole: routeRole,
        });
        const routed = await withAuthTimeout(
          routeAfterAuth(data.session.user, { reason, selectedRole: routeRole || undefined }),
          'syncSessionFromSupabase.routeAfterAuth',
        );
        window.__aimeasyAuthBootstrapComplete = true;
        return routed;
      } finally {
        window.__aimeasyRoutingInProgress = false;
      }
    })().catch((error) => {
      console.warn('[AUTH] syncSessionFromSupabase failed', error);
      window.hideLoading?.();
      console.log('[AUTH] Auth Completed', { initialized: true, hasSession: false, error: error?.message || String(error) });
      return false;
    }).finally(() => {
      if (window.__aimeasyAuthBootstrapComplete === false) {
        window.__aimeasyAuthBootstrapComplete = true;
      }
      if (normalizeRole(window.APP?.role || window.APP?.user?.role) === ROLE.STUDENT) {
        window.setTimeout(() => window.updateSidebarProfile?.(), 0);
      }
      window.dispatchEvent(new CustomEvent('aimeasy:auth-bootstrap-complete'));
      window.__aimeasyAuthSyncInFlight = null;
      window.__aimeasyAuthRestoring = false;
      window.aimeasyRefreshProfile?.();
    });

    return window.__aimeasyAuthSyncInFlight;
  };

  // ─── Issue 7: Block teacher Google mock → creator shortcut ───
  if (window.googleSignIn) {
    window.googleSignIn = function googleSignInStudentOnly(accountType) {
      if (window.__aimeasyOAuthStartInFlight) return;
      const terms = document.getElementById('google-auth-terms');
      if (terms && !terms.checked) {
        window.showToast?.('Please accept the Terms & Conditions to continue.', 'red');
        return;
      }
      const selectedRole = isLiveWorkshopLoginRequest()
        ? 'live_workshop'
        : (normalizeRole(window.APP?.role || getStoredLoginPortal()) || ROLE.STUDENT);
      authLog(AUTH_STAGES.START, { accountType, selectedRole });
      if (selectedRole !== 'live_workshop') clearLiveWorkshopPortalMarker();
      if (selectedRole === ROLE.STUDENT || selectedRole === ROLE.CONTENT_CREATOR) {
        clearPortalSession();
      }
      setLoginPortal(selectedRole);
      window.__aimeasyOAuthStartInFlight = true;
      window.showLoading?.('Authenticating with Google...');
      return signInWithGoogle(selectedRole).catch((error) => {
        window.__aimeasyOAuthStartInFlight = false;
        window.hideLoading?.();
        window.showToast?.(`Google sign-in error: ${error.message || String(error)}`, 'red');
      });
    };
  }

  // ─── Role selection: portal in sessionStorage only (not role override) ───
  const origSelectRole = window.selectRoleAndNavigate;
  if (origSelectRole && !origSelectRole.isPatched) {
    window.selectRoleAndNavigate = function selectRoleAndNavigatePortal(role) {
      if (role === 'student') {
        clearLiveWorkshopPortalMarker();
        clearPortalSession();
        if (window.APP) {
          window.APP.adminType = null;
          window.APP.subAdminData = null;
          window.APP.session = false;
          window.APP.user = null;
          window.APP.role = ROLE.STUDENT;
        }
        setLoginPortal(ROLE.STUDENT);
      }
      else if (role === 'teacher' || role === 'creator' || role === ROLE.CONTENT_CREATOR) {
        clearLiveWorkshopPortalMarker();
        openCreatorAccess();
        return;
      } else {
        clearLiveWorkshopPortalMarker();
        clearLoginPortal();
      }
      return origSelectRole.call(this, role);
    };
    window.selectRoleAndNavigate.isPatched = true;
  }

  const origProceed = window.proceedWithRole;
  if (origProceed && !origProceed.isPatched) {
    window.proceedWithRole = function proceedWithRolePortal() {
      const role = normalizeRole(window.APP?.role) || ROLE.STUDENT;
      if (role === ROLE.CONTENT_CREATOR) {
        clearLiveWorkshopPortalMarker();
        openCreatorAccess();
        return;
      }
      if (role === ROLE.STUDENT) {
        clearLiveWorkshopPortalMarker();
        clearPortalSession();
        if (window.APP) {
          window.APP.adminType = null;
          window.APP.subAdminData = null;
          window.APP.session = false;
          window.APP.user = null;
          window.APP.role = ROLE.STUDENT;
        }
        window.__aimeasyPreserveRoleRoute = '';
        setLoginPortal(ROLE.STUDENT);
        // Business rule: if session exists, go straight to dashboard (skip onboarding).
        try {
          if (window.__AIMEASY_SUPABASE__?.auth?.getSession) {
            window.__AIMEASY_SUPABASE__.auth.getSession().then(({ data }) => {
              if (data?.session?.user) {
                routeExistingSessionToDashboard({ selectedRole: ROLE.STUDENT, reason: 'role-selection-existing-session' });
              } else {
                syncGoogleAuthScreen();
                window.showScreen?.('screen-google-auth');
                window.setTimeout(() => window.updateGoogleAuthTermsState?.(), 0);
              }
            });
            return;
          }
        } catch {
          /* ignore */
        }
        syncGoogleAuthScreen();
        window.showScreen?.('screen-google-auth');
        window.setTimeout(() => window.updateGoogleAuthTermsState?.(), 0);
        return;
      }
      syncGoogleAuthScreen();
      const result = origProceed.apply(this, arguments);
      window.setTimeout(() => window.updateGoogleAuthTermsState?.(), 0);
      return result;
    };
    window.proceedWithRole.isPatched = true;
  }

  // Remove localStorage role override wrappers
  try {
    localStorage.removeItem('aimeasy_active_role');
    localStorage.removeItem('aimeasy_oauth_role');
  } catch {
    /* ignore */
  }

  // ─── Profile submit → Supabase profiles + dashboard ───
  const origShowScreenForAuthGuard = window.showScreen;
  if (origShowScreenForAuthGuard && !origShowScreenForAuthGuard.isPatched) {
    window.showScreen = function showScreenAuthGuard(id, role) {
      if (id === 'screen-google-auth') {
        syncGoogleAuthScreen();
        if (window.APP?.session && window.APP?.user) {
          if (!window.__aimeasyAuthBootstrapComplete || window.__aimeasyAuthRestoring) return;
          window.syncSessionFromSupabase?.({ reason: 'blocked-auth-screen-authenticated' });
          return;
        }
 
        if (!window.__aimeasyAuthBootstrapComplete || window.__aimeasyAuthRestoring) return;
        window.__AIMEASY_SUPABASE__?.auth?.getSession?.().then(({ data }) => {
          if (data?.session?.user) {
            window.syncSessionFromSupabase?.({ reason: 'blocked-auth-screen-supabase-session' });
          }
        });
      }
 
      const result = origShowScreenForAuthGuard.call(this, id, role);
      if (id === 'screen-landing') {
        window.setTimeout(() => window.updateLandingStats?.(), 0);
      }
      return result;
    };
    window.showScreen.isPatched = true;
  }

  window.syncCreatorProfileFields = function syncCreatorProfileFields() {
    const isCreator = normalizeRole(window.APP?.user?.role || window.APP?.role) === ROLE.CONTENT_CREATOR;
    const roleFields = document.getElementById('creator-profile-fields');
    const collegeGroup = document.getElementById('profile-college-group');
    const academicStep = document.getElementById('step2');
    if (roleFields) roleFields.style.display = isCreator ? 'block' : 'none';
    if (collegeGroup) collegeGroup.style.display = isCreator ? 'none' : '';
    if (academicStep) academicStep.style.display = isCreator ? 'none' : '';
    const teacherFields = document.getElementById('creator-teacher-fields');
    if (teacherFields) {
      teacherFields.style.display = document.getElementById('p-role-type')?.value === 'teacher' ? 'block' : 'none';
    }
  };

  function setAcademicSubmitLoading(isLoading) {
    const button = document.querySelector('#profile-step2 button[onclick*="submitProfile"]');
    if (!button) return;
    if (isLoading) {
      if (!button.dataset.originalText) button.dataset.originalText = button.innerHTML;
      button.disabled = true;
      button.innerHTML = 'Saving...';
      button.setAttribute('aria-busy', 'true');
    } else {
      button.disabled = false;
      button.innerHTML = button.dataset.originalText || 'Go to Dashboard';
      button.removeAttribute('aria-busy');
    }
  }

  async function refreshProfileState() {
    try {
      const refreshed = await window.aimeasyRefreshProfile?.();
      window.dispatchEvent(new CustomEvent('aimeasy:profile-updated'));
      return refreshed;
    } catch (e) {
      console.warn('Profile state refresh failed:', e);
      return null;
    }
  }

  window.submitProfile = async function submitProfileDbBacked() {
    console.log('Button clicked');
    setAcademicSubmitLoading(true);
    const existing = { ...(window.APP?.user || {}) };
    const dbRole = normalizeRole(existing.role || window.APP?.role) || ROLE.STUDENT;
    try {
      if (dbRole === ROLE.CONTENT_CREATOR) {
        window.APP.user = {
          ...existing,
          ...(window.APP?.user || {}),
          role: dbRole,
          role_type: document.getElementById('p-role-type')?.value || existing.role_type,
          qualification: document.getElementById('p-qualification')?.value?.trim() || existing.qualification,
          experience: document.getElementById('p-experience')?.value?.trim() || existing.experience,
        };
        if (!isCreatorProfileComplete(window.APP.user)) {
          window.showToast?.('Please complete your profile details first.', 'red');
          return;
        }
        window.APP.session = true;
        window.showLoading?.('Saving your profile...');
        const { profile, error } = await upsertProfileFromLegacy(window.APP.user, {
          id: window.APP.user.id || window.APP.user.googleId,
          email: window.APP.user.email,
        });
        if (error) {
          window.showToast?.('Could not save profile: ' + error.message, 'red');
          return;
        }
        if (profile) {
          console.log('Academic data saved');
          console.log('onboarding_completed updated');
          window.APP.user = profileToLegacyUser(profile);
        }
        localStorage.setItem('aiiens_session_user', JSON.stringify(window.APP.user));
        await refreshProfileState();
        clearLoginPortal();
        window.__aimeasyLastAuthRoute = null;
        console.log('Redirecting to dashboard');
        window.history?.replaceState?.({ aimeasyPath: '/creator', aimeasyIndex: 1 }, '', cleanHashUrl('/creator'));
        applyDashboardRedirect(window.APP.user);
        return;
      }

      const uni = document.getElementById('p-university')?.value?.trim();
      const reg = document.getElementById('p-regulation')?.value?.trim();
      const branch = document.getElementById('p-branch')?.value?.trim();
      const year = document.getElementById('p-year')?.value?.trim();
      const sem = document.getElementById('p-semester')?.value?.trim();
      if (!uni || !reg || !branch || !year || !sem) {
        window.showToast?.('Please fill all academic fields', 'red');
        return;
      }

      const resolved = await resolveAcademicSelection({
        universityName: uni,
        branchName: branch,
        universityId: existing.university_id || window.APP?.user?.university_id || null,
        branchId: existing.branch_id || window.APP?.user?.branch_id || null,
      });

      window.APP.user = {
        ...existing,
        ...(window.APP?.user || {}),
        university: resolved.university_name || uni,
        university_name: resolved.university_name || uni,
        university_id: resolved.university_id || null,
        regulation: reg,
        regulation_code: reg,
        regulation_id: existing.regulation_id || window.APP?.user?.regulation_id || null,
        branch: resolved.branch_name || branch,
        branch_name: resolved.branch_name || branch,
        branch_id: resolved.branch_id || null,
        year,
        semester: sem,
        role: dbRole,
      };
      window.APP.session = true;
      setCurrentBranch(branch);
      localStorage.setItem('aiiens_session_user', JSON.stringify(window.APP.user));
      if (window.APP.user.googleId) {
        localStorage.setItem('aiiens_user_' + window.APP.user.googleId, JSON.stringify(window.APP.user));
      }

      const supabase = window.__AIMEASY_SUPABASE__;
      if (!supabase) {
        window.showToast?.('Could not save profile: Supabase is not configured.', 'red');
        return;
      }
      if (!window.APP?.user?.id && !window.APP?.user?.googleId) {
        window.showToast?.('Could not save profile: missing authenticated user.', 'red');
        return;
      }
      if (!isProfileAcademicComplete(window.APP.user)) {
        window.showToast?.('Please fill all academic fields', 'red');
        return;
      }

      window.showLoading?.('Saving your profile...');
      const { profile, error } = await upsertProfileFromLegacy(window.APP.user, {
        id: window.APP.user.id || window.APP.user.googleId,
        email: window.APP.user.email,
      });
      if (error) {
        window.showToast?.('Could not save profile: ' + error.message, 'red');
        return;
      }
      if (!profile) {
        window.showToast?.('Could not save profile. Please try again.', 'red');
        return;
      }

      console.log('Academic data saved');
      window.APP.user = profileToLegacyUser(profile);
      setCurrentBranch(window.APP.user.branch || window.APP.user.branch_name);
      if (!window.APP.user.onboarding_completed) {
        window.showToast?.('Could not complete onboarding. Please try again.', 'red');
        return;
      }
      console.log('onboarding_completed updated');
      localStorage.setItem('aiiens_session_user', JSON.stringify(window.APP.user));
      if (window.APP.user.googleId || window.APP.user.id) {
        localStorage.setItem('aiiens_user_' + (window.APP.user.googleId || window.APP.user.id), JSON.stringify(window.APP.user));
      }

      await refreshProfileState();
      clearLoginPortal();
      window.__aimeasyLastAuthRoute = null;
      authLog(AUTH_STAGES.REDIRECT_DASHBOARD, {});
      console.log('Redirecting to dashboard');
      window.history?.replaceState?.({ aimeasyPath: '/student', aimeasyIndex: 1 }, '', cleanHashUrl('/student'));
      applyDashboardRedirect(window.APP.user);
    } catch (error) {
      console.warn('submitProfile save failed:', error);
      window.showToast?.('Could not save profile: ' + (error?.message || String(error)), 'red');
    } finally {
      window.hideLoading?.();
      setAcademicSubmitLoading(false);
    }
  };

  window.profileStep2 = async function profileStep2Db() {
    const existing = { ...(window.APP?.user || {}) };
    const name = document.getElementById('p-name')?.value?.trim();
    const phone = document.getElementById('p-phone')?.value?.trim();
    const role = normalizeRole(existing.role || window.APP?.role) || ROLE.STUDENT;
    if (!name) {
  window.showToast?.('Please enter your full name.', 'red');
  return;
}

const college = document.getElementById('p-college')?.value?.trim();

if (role === ROLE.STUDENT && !college) {
  window.showToast?.('College name is mandatory.', 'red');
  return;
}
if (!name) {
  window.showToast?.('Please enter your full name.', 'red');
  return;
}
if (!phone) {
  window.showToast?.('Mobile number is mandatory.', 'red');
  return;
}

if (!/^[0-9]{10}$/.test(phone)) {
  window.showToast?.('Mobile number must be exactly 10 digits.', 'red');
  return;
}
    window.APP.user = {
      ...existing,
      name,
      full_name: name,
      phone,
      phone_number: phone,
      college: college || existing.college,
      role,
      role_type: document.getElementById('p-role-type')?.value || existing.role_type,
      qualification: document.getElementById('p-qualification')?.value?.trim() || existing.qualification,
      experience: document.getElementById('p-experience')?.value?.trim() || existing.experience,
    };
    if (role === ROLE.CONTENT_CREATOR && !isCreatorProfileComplete(window.APP.user)) {
      window.showToast?.('Complete the creator role details before continuing.', 'red');
      return;
    }
    const supabase = window.__AIMEASY_SUPABASE__;
    if (supabase && window.APP?.user) {
      if (!isProfilePersonalComplete(window.APP.user)) return;
      window.APP.user.role = normalizeRole(window.APP.user.role || window.APP?.role) || ROLE.STUDENT;
      const { profile, error } = await upsertProfileFromLegacy(window.APP.user, {
        id: window.APP.user.id || window.APP.user.googleId,
        email: window.APP.user.email,
      });
      if (error) {
        window.showToast?.('Could not save profile: ' + error.message, 'red');
        return;
      }
      if (profile) window.APP.user = profileToLegacyUser(profile);
      authLog(AUTH_STAGES.REDIRECT_ACADEMIC, {});
      if (window.APP.user.role === ROLE.CONTENT_CREATOR && isProfileFullyComplete(window.APP.user)) {
        clearLoginPortal();
        window.hideLoading?.();
        applyDashboardRedirect(window.APP.user);
      }
    }
    if (role !== ROLE.CONTENT_CREATOR) {
      document.getElementById('profile-step1').style.display = 'none';
      document.getElementById('profile-step2').style.display = 'block';
      document.getElementById('step1')?.classList.add('done');
      document.getElementById('step2')?.classList.add('active');
      window.history?.replaceState?.({ aimeasyPath: '/academic-details', aimeasyIndex: 1 }, '', cleanHashUrl('/academic-details'));
      await hydrateProfileAcademicDropdowns(document, {
        savedUniversity: window.APP?.user?.university_name || window.APP?.user?.university,
        savedBranch: window.APP?.user?.branch_name || window.APP?.user?.branch,
        savedRegulation: window.APP?.user?.regulation_code || window.APP?.user?.regulation,
        universityId: window.APP?.user?.university_id,
        branchId: window.APP?.user?.branch_id,
      });
    }
  };

  // ─── Issue 4: Stop video on navigation ───
  if (window.navigateTo) {
    const origNav = window.navigateTo;
    window.navigateTo = function navigateToStopVideo(page) {
      stopVideoPlayer();
      return origNav.call(this, page);
    };
  }
  ['backToUnits', 'openSubject', 'openUnit', 'switchTab'].forEach((fn) => {
    if (!window[fn]) return;
    const orig = window[fn];
    window[fn] = function patchedStopVideo(...args) {
      const nextTab = fn === 'switchTab' ? String(args[0] || '') : '';
      const leavingVideos = fn !== 'switchTab' || (window.APP?.currentTab === 'videos' && nextTab !== 'videos');
      if (leavingVideos) stopVideoPlayer();
      const result = orig.apply(this, args);
      if (fn === 'switchTab' && nextTab === 'videos') {
        window.aimeasyResumeStudentVideo?.();
      }
      return result;
    };
  });

  // ─── Issue 5: Live search ───
  window.handleSearch = async function handleSearchLive(query) {
    const q = String(query || '').trim();
    let box = document.getElementById('search-results-dropdown');
    if (!box) {
      const wrap = document.getElementById('global-search')?.closest('.search-wrap') || document.getElementById('global-search')?.parentElement;
      if (wrap) {
        box = document.createElement('div');
        box.id = 'search-results-dropdown';
        box.className = 'search-results-dropdown';
        wrap.appendChild(box);
      }
    }
    if (!q) {
      if (box) box.innerHTML = '';
      return;
    }
    const results = await searchStudentContent(q);
    if (!box) return;
    if (!results.length) {
      box.innerHTML = '<div class="search-result-empty">No matches found</div>';
      return;
    }
    box.innerHTML = results
      .map(
        (r, i) =>
          `<button type="button" class="search-result-item" data-idx="${i}"><strong>${r.label}</strong><span>${r.sub || r.type}</span></button>`,
      )
      .join('');
    box.querySelectorAll('.search-result-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        const r = results[Number(btn.dataset.idx)];
        if (r?.action?.kind === 'legacySubject' && r.action.raw) {
          window.openSubject?.(r.action.raw);
        } else if (r?.action?.kind === 'subject') {
          window.showToast?.('Open subject: ' + r.label, 'blue');
          window.navigateTo?.('subjects');
        } else {
          window.navigateTo?.('unit-content');
          window.switchTab?.('videos');
        }
        box.innerHTML = '';
      });
    });
  };

  // ─── Issue 6: subAdminBack must not clear student session ───
  window.subAdminBack = function subAdminBackNavOnly() {
    window.showScreen?.('screen-landing');
    window.history?.replaceState?.({ aimeasyPath: '/landing', aimeasyIndex: 0 }, '', cleanHashUrl('/landing'));
  };

  // ─── Issue 8: Admin dashboard from DB ───
  window.renderAdminDashboardLive = async function renderAdminDashboardLiveDb() {
    const stats = await fetchAdminDashboardStats();
    const content = document.getElementById('admin-content');
    if (!content) return;
    if (!stats) {
      content.innerHTML = '<p style="padding:1rem;color:var(--text2);">Connect Supabase to load live dashboard metrics.</p>';
      return;
    }
    content.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;">
        ${[
          ['Total Students', stats.students],
          ['Total Users', stats.users],
          ['Total Content Creators', stats.creators],
          ['Total Sub Admins', stats.subAdmins],
          ['Total Subjects', stats.subjects],
          ['Total Branches', stats.branches],
          ['Total Semesters', stats.semesters],
          ['Total Units', stats.units],
          ['Total Topics', stats.topics],
          ['Total Videos', stats.videos],
          ['Total Notes', stats.notes],
          ['Total PYQs', stats.pyqs],
          ['Total Regulations', stats.regulations],
        ]
          .map(
            ([label, val]) => `
          <div class="admin-stat-card">
            <div style="font-size:2rem;font-weight:800;">${val}</div>
            <div style="font-size:0.8rem;color:var(--text2);">${label}</div>
          </div>`,
          )
          .join('')}
      </div>
      <p style="margin-top:1rem;font-size:0.82rem;color:var(--text3);">Live database counts from Supabase.</p>`;
  };

  window.updateLandingStats = async function updateLandingStatsLive() {
    const setText = (id, value) => {
      const element = document.getElementById(id);
      if (element) element.textContent = String(value ?? 0);
    };

    setText('stat-students', 0);
    setText('stat-subjects', 0);
    setText('stat-pyqs', 0);
    setText('stat-satisfaction', 0);
    setText('stat-workshop-participants', 0);

    const stats = await fetchLandingStats();
    setText('stat-students', stats.signups || stats.users || stats.students);
    setText('stat-subjects', stats.subjects);
    setText('stat-pyqs', stats.creators);
    setText('stat-satisfaction', stats.regulations);
    setText('stat-workshop-participants', stats.workshopParticipants);
  };
  window.setTimeout(() => window.updateLandingStats?.(), 0);

  // ─── Issue 9: Profile dropdowns from DB ───
  document.addEventListener('DOMContentLoaded', () => {
    hydrateProfileAcademicDropdowns();
  });
  window.setTimeout(() => hydrateProfileAcademicDropdowns(), 500);

  // ─── Issue 3: Persist v10 uploads to content_items when possible ───
  window.aimeasyPersistContent = async function aimeasyPersistContent(payload) {
    const { data, error } = await createContentItem(payload);
    if (error) {
      window.showToast?.('Save failed: ' + error.message, 'red');
      return null;
    }
    notifyCurriculumChanged({ type: 'content' });
    return data;
  };

  window.aimeasyListContent = listContentItems;
  window.aimeasyDeleteContent = withCurriculumRefresh(deleteContentItem, 'content');
  window.aimeasyUpdateContent = withCurriculumRefresh(updateContentItem, 'content');
  window.aimeasyNormalizeContentType = normalizeContentType;
  function notifyCurriculumChanged(detail = {}) {
    window.dispatchEvent(new CustomEvent('aimeasy:data-changed', { detail }));
    window.aiiensRefreshActiveAdminSurfaces?.();
    if (document.querySelector('.screen.active')?.id === 'screen-app' && window.APP?.currentSubject && window.APP?.currentUnit) {
      const subjectId = window.APP.currentSubject.id || window.APP.currentSubject.rawId || window.APP.currentSubject;
      const unitId = window.APP.currentUnit;
      window.renderVideoList?.(subjectId, unitId);
      window.renderNotes?.(subjectId, unitId);
      window.renderPYQ?.(null, subjectId, unitId);
      window.renderIQ?.(subjectId, unitId);
    }
    window.renderSubAdminDashboardLive?.();
    window.renderAdminDashboardLive?.();
    window.updateLandingStats?.();
  }

  function withCurriculumRefresh(fn, type) {
    return async function refreshedCurriculumMutation(...args) {
      const result = await fn(...args);
      if (!result?.error) notifyCurriculumChanged({ type });
      return result;
    };
  }

  window.aimeasyFetchAdminDashboardStats = fetchAdminDashboardStats;
  window.aimeasySaveUnitRoadmap = withCurriculumRefresh(saveUnitRoadmap, 'roadmap');
  window.aimeasyFetchUnitRoadmap = fetchUnitRoadmap;
  window.aimeasySaveLinkedContentItem = withCurriculumRefresh(saveLinkedContentItem, 'content');
  window.aimeasyFetchCurriculumStats = fetchCurriculumStats;
  window.aimeasyFetchSubjects = fetchSubjects;
  window.aimeasyFetchSubjectById = fetchSubjectById;
  window.aimeasyCreateSubject = withCurriculumRefresh(createSubject, 'subject');
  window.aimeasyUpdateSubject = withCurriculumRefresh(updateSubject, 'subject');
  window.aimeasyDeleteSubject = withCurriculumRefresh(deleteSubject, 'subject');
  window.aimeasyFetchUnits = fetchUnits;
  window.aimeasyCreateUnit = withCurriculumRefresh(createUnit, 'unit');
  window.aimeasyUpdateUnit = withCurriculumRefresh(updateUnit, 'unit');
  window.aimeasyDeleteUnit = withCurriculumRefresh(deleteUnit, 'unit');
  window.aimeasyFetchSyllabus = fetchSubjectSyllabus;
  window.aimeasySaveSyllabus = withCurriculumRefresh(upsertSubjectSyllabus, 'syllabus');
  window.aimeasyDeleteSyllabus = withCurriculumRefresh(deleteSubjectSyllabus, 'syllabus');
  window.aimeasyCreateCurriculumBlueprint = createCurriculumBlueprint;
  window.aimeasyListCurriculums = listCurriculums;
  window.aimeasyListCurriculumContent = listCurriculumContent;
  window.aimeasySaveCurriculumContent = saveCurriculumContent;
  window.aimeasyUpdateCurriculumStatus = updateCurriculumStatus;
  window.aimeasyFetchWorkflowDashboardCounts = fetchWorkflowDashboardCounts;

  window.renderSubAdminDashboardLive = async function renderSubAdminDashboardLiveDb() {
    const activeSaTab = document.querySelector('.admin-nav-item.active')?.id?.replace('sa-nav-', '');
    if (activeSaTab && activeSaTab !== 'dashboard') return;
    const content = document.getElementById('sa-content');
    if (!content) return;
    const { data, error } = await fetchCurriculumStats();
    if (error || !data) {
      content.innerHTML = '<p style="padding:1rem;color:var(--text2);">Connect Supabase to load live dashboard metrics.</p>';
      return;
    }
    
    // Get current SubAdmin's username
    const currentSubAdmin = window.APP?.subAdminData?.username || 'SubAdmin';
    
    // Fetch stats for current SubAdmin only
    let mySubjectsCount = 0;
    try {
      const supabase = window.__AIMEASY_SUPABASE__;
      if (supabase) {
        const { count } = await supabase
          .from('subjects')
          .select('*', { count: 'exact', head: true })
          .eq('created_by', currentSubAdmin);
        mySubjectsCount = count || 0;
      }
    } catch (err) {
      console.warn('Failed to fetch SubAdmin subject count:', err);
    }
    
    const cards = [
      ['📊 My Subjects', mySubjectsCount, 'var(--primary)', `${currentSubAdmin} created ${mySubjectsCount} subject${mySubjectsCount !== 1 ? 's' : ''}`, true],
      ['Total Subjects', data.subjects, 'var(--primary)'],
      ['Total Units', data.units, 'var(--teal)'],
      ['Total Topics', data.topics, 'var(--lavender)'],
      ['Total Videos', data.videos, 'var(--blue)'],
      ['Total Notes', data.notes, 'var(--amber)'],
      ['Total PYQs', data.pyqs, 'var(--green)'],
      ['Important Questions', data.iqs, 'var(--red)'],
      ['Learning Roadmap Topics', data.roadmapTopics, 'var(--primary)'],
    ];
    
    content.innerHTML = `
      <div style="padding:2rem;max-width:1100px;margin:0 auto;width:100%;">
        <div style="margin-bottom:1.6rem;">
          <h2 style="font-size:1.4rem;font-weight:800;letter-spacing:-0.02em;margin-bottom:4px;">Sub Admin Dashboard</h2>
          <p style="font-size:0.82rem;color:var(--text3);">Live curriculum metrics from Supabase.</p>
        </div>
        <div class="admin-grid" style="margin-bottom:1.6rem;">
          ${cards.map(([label, value, color, subtitle, isLarge]) => isLarge ? `
            <div class="admin-stat-card" style="grid-column: span 2; padding: 1.5rem; border-left: 4px solid ${color}; background: rgba(var(--primary-rgb, 99, 102, 241), 0.05);">
              <div style="font-size:1.2rem;font-weight:600;margin-bottom:8px;color:var(--text2);">${label}</div>
              <div style="font-size:2.8rem;font-weight:800;color:${color};margin-bottom:8px;">${value}</div>
              <div style="font-size:0.82rem;color:var(--text3);">${subtitle}</div>
            </div>` : `
            <div class="admin-stat-card">
              <div class="admin-stat-accent" style="background:${color};"></div>
              <div style="font-size:2.1rem;font-weight:800;color:${color};">${value}</div>
              <div style="font-size:0.84rem;font-weight:600;margin-top:4px;">${label}</div>
            </div>`).join('')}
        </div>
      </div>`;
  };

  window.__AIMEASY_SUPABASE__?.channel?.('curriculum-dashboard')
    ?.on('postgres_changes', { event: '*', schema: 'public', table: 'subjects' }, () => notifyCurriculumChanged({ type: 'subject' }))
    ?.on('postgres_changes', { event: '*', schema: 'public', table: 'units' }, () => notifyCurriculumChanged({ type: 'unit' }))
    ?.on('postgres_changes', { event: '*', schema: 'public', table: 'topics' }, () => notifyCurriculumChanged({ type: 'topic' }))
    ?.on('postgres_changes', { event: '*', schema: 'public', table: 'topic_videos' }, () => notifyCurriculumChanged({ type: 'video' }))
    ?.on('postgres_changes', { event: '*', schema: 'public', table: 'content_items' }, () => notifyCurriculumChanged({ type: 'content' }))
    ?.on('postgres_changes', { event: '*', schema: 'public', table: 'live_workshop_registrations' }, () => window.updateLandingStats?.())
    ?.on('postgres_changes', { event: '*', schema: 'public', table: 'role_profiles' }, () => {
      notifyCurriculumChanged({ type: 'role_profile' });
    })
    ?.subscribe?.();

  function normalizeRequestedMenuLabels() {
    const saSubjects = document.getElementById('sa-nav-subjects');
    const saCurriculum = document.getElementById('sa-nav-curriculum');
    const crDashboard = document.getElementById('cr-nav-dashboard');
    const crChoose = document.getElementById('cr-nav-choosing');
    const crAdded = document.getElementById('cr-nav-addcontent');
    if (saSubjects) saSubjects.innerHTML = '<span>📚</span> Create Subject';
    if (saCurriculum) saCurriculum.innerHTML = '<span>🗂️</span> Curriculum';
    if (crDashboard) crDashboard.innerHTML = '<span>📊</span> Dashboard';
    if (crChoose) crChoose.innerHTML = '<span>➕</span> Choose';
    if (crAdded) crAdded.innerHTML = '<span>✅</span> Added';
  }
  normalizeRequestedMenuLabels();
  window.addEventListener('load', () => window.setTimeout(normalizeRequestedMenuLabels, 0));

  function wrapContentUpload(fnName, contentType) {
    const orig = window[fnName];
    if (!orig) return;
    window[fnName] = async function wrappedContentUpload(...args) {
      const result = orig.apply(this, args);
      const supabase = window.__AIMEASY_SUPABASE__;
      if (!supabase) return result;
      try {
        const subjectName = args[0];
        const unitId = args[1];
        const subj = (JSON.parse(localStorage.getItem('edusync_custom_subjects') || '[]')).find(
          (s) => s.name === subjectName,
        );
        if (subj?.dbSubjectId && subj?.dbUnitIds?.[unitId]) {
          const payload = { subjectId: subj.dbSubjectId, unitId: subj.dbUnitIds[unitId], contentType };
          if (contentType === 'note') {
            payload.title = document.getElementById('v10-ntitle-' + unitId)?.value || 'Note';
            payload.url = document.getElementById('v10-nlink-' + unitId)?.value || '';
          }
          if (contentType === 'pyq') {
            payload.title = document.getElementById('v10-pyqtxt-' + unitId)?.value?.slice(0, 80) || 'PYQ';
            payload.body = document.getElementById('v10-pyqtxt-' + unitId)?.value || '';
          }
          const saved = await createContentItem(payload);
          if (saved.error) window.showToast?.('DB save failed: ' + saved.error.message, 'red');
        }
      } catch (e) {
        console.warn(fnName, 'db mirror failed', e);
      }
      return result;
    };
  }

  // wrapContentUpload('v10UploadNote', 'note');
  // wrapContentUpload('v10UploadPYQ', 'pyq');
  // wrapContentUpload('v10UploadIQ', 'iq');

  // Single OAuth callback completion. Normal startup restores profile silently in AuthProvider;
  // protected-route refresh is handled by installBrowserNavigation.
  if (window.__AIMEASY_SUPABASE__) {
    window.setTimeout(async () => {
      if (isOAuthCallbackUrl()) await window.syncSessionFromSupabase?.({ reason: 'oauth-callback-load' });
    }, 0);
  }

  // Auth state listener → student router only
  window.syncGoogleAuthScreen = syncGoogleAuthScreen;

  // ─── Admin / SubAdmin portal auth (database tables, not Supabase Auth) ───
  const origOpenAdminLogin = window.openAdminLogin;
  if (origOpenAdminLogin && !origOpenAdminLogin.isPortalPatched) {
    window.openAdminLogin = function openAdminLoginPortal(type) {
      window.__aiiensAdminLoginType = type;
      return origOpenAdminLogin.call(this, type);
    };
    window.openAdminLogin.isPortalPatched = true;
  }

  async function refreshSubAdminUiLists() {
    const supabase = window.__AIMEASY_SUPABASE__;
    const rows = await fetchSubAdminAccounts(supabase);
    window.__aiiensSubAdminCache = rows;
    window.renderExistingSubAdmins?.();
    if (typeof window.aiiensRenderSubAdmins === 'function') {
      window.aiiensRenderSubAdmins(document.getElementById('subadmin-search')?.value || '');
    }
    window.refreshActiveAdminSurfaces?.();
  }

  window.submitAdminLogin = async function submitAdminLoginPortal() {
    const uid = document.getElementById('admin-userid')?.value.trim();
    const pwd = document.getElementById('admin-password')?.value.trim();
    const err = document.getElementById('admin-login-err');
    const client = window.__AIMEASY_SUPABASE__;
    const loginType = window.__aiiensAdminLoginType || 'admin';

    if (!client) {
      if (err) {
        err.style.display = 'block';
        err.innerHTML = '❌ Supabase client not initialized';
      }
      return;
    }

    window.showLoading?.('Verifying credentials...');

    try {
      const result = await authenticatePortalLogin(client, loginType, uid, pwd);
      if (result.error) {
        window.hideLoading?.();
        if (err) {
          err.style.display = 'block';
          err.innerHTML = '❌ ' + result.error;
        }
        return;
      }

      applyPortalSessionToApp(result.role, result.account);
      console.log('[PORTAL AUTH] Database login success', { role: result.role, username: uid });
      persistPortalSession({
        role: result.role,
        username: uid,
        accountId: result.account.id,
      });

      if (err) err.style.display = 'none';
      window.closeAdminLogin?.();

      if (result.role === 'admin') {
        window.showLoading?.('Logging in as Administrator...');
        window.setTimeout(() => {
          window.hideLoading?.();
          window.launchAdminDashboard?.();
          applyDashboardRedirect({ role: ROLE.ADMIN });
        }, 400);
      } else {
        window.showLoading?.('Logging in as Sub Admin...');
        installSubAdminAssignmentSync(client);
        window.setTimeout(() => {
          window.hideLoading?.();
          window.launchSubAdmin?.();
          applyDashboardRedirect({ role: ROLE.SUBADMIN });
        }, 400);
      }
    } catch (ex) {
      window.hideLoading?.();
      if (err) {
        err.style.display = 'block';
        err.innerHTML = '❌ Error logging in: ' + (ex.message || String(ex));
      }
    }
  };

  const origAdminLogout = window.adminLogout;
  window.adminLogout = async function adminLogoutPortal() {
    clearPortalSession();
    if (window.APP) {
      window.APP.adminType = null;
      window.APP.subAdminData = null;
      window.APP.portalAuth = false;
      window.APP.session = false;
      window.APP.user = null;
      window.APP.role = 'student';
    }
    window.__aimeasyPreserveRoleRoute = '';
    origAdminLogout?.();
  };

  // Custom Supabase-backed Sub-Admin Creation & Management
  window.createSubAdmin = async function createSubAdminProduction() {
    const modal = document.getElementById('create-subadmin-modal');
    const editIndex = modal?.dataset.editIndex;
    const username = document.getElementById('sa-create-username')?.value.trim();
    const password = document.getElementById('sa-create-password')?.value.trim();
    const branch = document.getElementById('sa-create-branch')?.value;
    const department = document.getElementById('sa-create-dept')?.value.trim() || 'Academics';
    const regulation = document.getElementById('sa-create-regulation')?.value;
    const university = document.getElementById('sa-create-university')?.value.trim();
    const errEl = document.getElementById('sa-create-err');
    const sucEl = document.getElementById('sa-create-success');

    if (!username || !password || !branch || !department || !regulation || !university) {
      if (errEl) {
        errEl.textContent = 'Please fill username, password, branch, department, regulation, and university.';
        errEl.style.display = 'block';
      }
      if (sucEl) sucEl.style.display = 'none';
      return;
    }

    const supabase = window.__AIMEASY_SUPABASE__;
    if (!supabase) {
      if (errEl) {
        errEl.textContent = 'Supabase client not initialized.';
        errEl.style.display = 'block';
      }
      return;
    }

    const subAdmins = window.__aiiensSubAdminCache || await fetchSubAdminAccounts(supabase);
    const duplicate = subAdmins.some((sa, idx) => sa.username === username && String(idx) !== String(editIndex ?? ''));
    if (duplicate) {
      if (errEl) {
        errEl.textContent = 'Username already exists.';
        errEl.style.display = 'block';
      }
      return;
    }

    window.showLoading?.(editIndex !== undefined ? 'Saving changes...' : 'Creating Sub Admin...');
    
    try {
      if (editIndex === undefined) {
        const { error: insertError } = await supabase
          .from('sub_admin_accounts')
          .insert({
            username,
            password,
            status: 'active',
            branch,
            university,
            regulation,
            created_at: new Date().toISOString(),
          });

        if (insertError) {
          if (errEl) {
            errEl.textContent = 'Database insert failed: ' + insertError.message;
            errEl.style.display = 'block';
          }
          window.hideLoading?.();
          return;
        }

      } else {
        const existingSub = subAdmins[Number(editIndex)];
        if (!existingSub?.username) throw new Error('Sub Admin record not found');

        const updates = {
          status: 'active',
          branch,
          university,
          regulation,
        };
        if (password && password !== '••••••••') updates.password = password;

        const { error: updateError } = await supabase
          .from('sub_admin_accounts')
          .update(updates)
          .eq('username', existingSub.username);

        if (updateError) {
          if (errEl) {
            errEl.textContent = 'Database update failed: ' + updateError.message;
            errEl.style.display = 'block';
          }
          window.hideLoading?.();
          return;
        }
      }

      await refreshSubAdminUiLists();

      if (errEl) errEl.style.display = 'none';
      if (sucEl) {
        sucEl.textContent = editIndex !== undefined ? 'Sub Admin updated.' : 'Sub Admin created.';
        sucEl.style.display = 'block';
      }
      if (modal) delete modal.dataset.editIndex;
      window.configureSubAdminModalMode?.(false);
      window.hideLoading?.();
      window.renderExistingSubAdmins?.();
      if (typeof window.aiiensRenderSubAdmins === 'function') {
        window.aiiensRenderSubAdmins(document.getElementById('subadmin-search')?.value || '');
      }
      window.refreshActiveAdminSurfaces?.();
      window.showToast?.(editIndex !== undefined ? 'Sub Admin updated' : 'Sub Admin created', 'green');
    } catch (e) {
      window.hideLoading?.();
      if (errEl) {
        errEl.textContent = 'Error: ' + e.message;
        errEl.style.display = 'block';
      }
    }
  };

  window.aiiensDeleteSubAdmin = async function aiiensDeleteSubAdmin(index) {
    const subAdmins = window.__aiiensSubAdminCache || await fetchSubAdminAccounts(window.__AIMEASY_SUPABASE__);
    const deletedUser = subAdmins[index];
    if (!deletedUser) return;

    window.showLoading?.('Deleting Sub Admin...');
    
    try {
      const supabase = window.__AIMEASY_SUPABASE__;

      if (supabase) {
        const { error } = await supabase
          .from('sub_admin_accounts')
          .delete()
          .eq('username', deletedUser.username);
        if (error) throw error;
      }

      await refreshSubAdminUiLists();

      window.hideLoading?.();
      window.renderExistingSubAdmins?.();
      if (typeof window.aiiensRenderSubAdmins === 'function') {
        window.aiiensRenderSubAdmins(document.getElementById('subadmin-search')?.value || '');
      }
      window.refreshActiveAdminSurfaces?.();
      window.showToast?.('Sub Admin deleted', 'red');
    } catch (e) {
      window.hideLoading?.();
      window.showToast?.('Failed to delete sub admin: ' + e.message, 'red');
    }
  };

  window.renderExistingSubAdmins = async function renderExistingSubAdminsFromDb() {
    const el = document.getElementById('sa-existing-list');
    if (!el) return;
    const rows = await fetchSubAdminAccounts(window.__AIMEASY_SUPABASE__);
    window.__aiiensSubAdminCache = rows;
    if (!rows.length) {
      el.innerHTML = '';
      return;
    }
    el.innerHTML =
      '<div style="font-size:0.78rem;font-weight:700;color:var(--text2);margin-bottom:6px;">Existing Sub Admins (' +
      rows.length +
      ')</div>' +
      rows
        .map(
          (sa) =>
            '<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:4px;font-size:0.82rem;">' +
            '<span style="flex:1;font-weight:600;">' +
            sa.username +
            '</span>' +
            '<span class="badge badge-green">' +
            (sa.status || 'active') +
            '</span></div>',
        )
        .join('');
  };

  window.aiiensRenderSubAdmins = function aiiensRenderSubAdminsFromDb(query = '') {
    const card = document.querySelector('#subadmin-search')?.closest('.manage-panel');
    const list = card?.querySelector('.manage-list');
    if (!list) return;
    const rows = window.__aiiensSubAdminCache || [];
    const q = String(query || '').toLowerCase();
    const filtered = rows.filter(
      (sa) =>
        !q || [sa.username, sa.status].some((value) => String(value || '').toLowerCase().includes(q)),
    );
    if (!filtered.length) {
      list.innerHTML = '<div class="empty-state-card">No matching sub admins.</div>';
      return;
    }
    list.innerHTML = filtered
      .map((sa) => {
        const realIndex = rows.findIndex((item) => item.username === sa.username);
        return (
          '<div class="v10-item subadmin-compact-card management-record">' +
          '<div class="record-icon">' +
          (sa.username || 'S').charAt(0).toUpperCase() +
          '</div>' +
          '<div class="v10-item-body">' +
          '<div class="v10-item-title">' +
          sa.username +
          '</div>' +
          '<div class="subadmin-meta-grid"><span><b>Status</b>' +
          (sa.status || 'active') +
          '</span></div>' +
          '</div>' +
          '<button class="icon-action-btn" onclick="aiiensEditSubAdmin(' +
          realIndex +
          ')" title="Edit sub admin" aria-label="Edit ' +
          escAttr(sa.username || 'sub admin') +
          '">' +
          actionIcon.edit +
          '</button>' +
          '<button class="icon-action-btn danger" onclick="aiiensDeleteSubAdmin(' +
          realIndex +
          ')" title="Delete sub admin" aria-label="Delete ' +
          escAttr(sa.username || 'sub admin') +
          '">' +
          actionIcon.delete +
          '</button>' +
          '</div>'
        );
      })
      .join('');
  };

  const origSwitchAdminSectionPortal = window.switchAdminSection;
  if (origSwitchAdminSectionPortal && !origSwitchAdminSectionPortal.isPortalPatched) {
    window.switchAdminSection = async function switchAdminSectionPortal(section) {
      if (section === 'create' || section === 'dashboard') {
        await refreshSubAdminUiLists();
      }
      return origSwitchAdminSectionPortal.apply(this, arguments);
    };
    window.switchAdminSection.isPortalPatched = true;
  }

  window.aiiensEditSubAdmin = async function aiiensEditSubAdminFromDb(index) {
    const subAdmins = window.__aiiensSubAdminCache || [];
    const sa = subAdmins[index];
    if (!sa) return;
    const modal = document.getElementById('create-subadmin-modal');
    modal?.classList.add('open');
    modal?.style.removeProperty('pointer-events');
    if (modal) modal.dataset.editIndex = String(index);
    await window.aiiensRefreshAllCatalogDropdowns?.(document);
    document.getElementById('sa-create-username').value = sa.username || '';
    document.getElementById('sa-create-password').value = sa.password || '';
    document.getElementById('sa-create-dept').value = sa.department && sa.department !== '-' ? sa.department : '';
    const uniValue = sa.university && sa.university !== '-' ? sa.university : '';
    const branchValue = sa.branch && sa.branch !== '-' ? sa.branch : '';
    const regValue = sa.regulation && sa.regulation !== '-' ? sa.regulation : '';
    const uniSelect = document.getElementById('sa-create-university');
    if (uniSelect) uniSelect.value = uniValue;
    if (document.getElementById('sa-create-regulation')) {
      document.getElementById('sa-create-regulation').value = regValue;
    }
    if (window.aiiensBindBranchCascade) {
      await window.aiiensBindBranchCascade('sa-create-university', 'sa-create-branch');
    }
    const branchSelect = document.getElementById('sa-create-branch');
    if (branchSelect && branchValue) branchSelect.value = branchValue;
    if (document.getElementById('sa-create-permissions')) {
      document.getElementById('sa-create-permissions').value = (sa.permissions || []).join(', ');
    }
    window.configureSubAdminModalMode?.(true);
    window.renderExistingSubAdmins?.();
  };

  window.setTimeout(() => refreshSubAdminUiLists(), 0);
  installSubAdminAssignmentSync(window.__AIMEASY_SUPABASE__);
}
