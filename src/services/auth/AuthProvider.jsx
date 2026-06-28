import React from 'react';
import { supabase } from '../supabase/client.js';
import { fetchProfileByAuthId, ensureProfileForAuthUser, getLoginPortal } from './profileService.js';
import { getSessionOnce, invalidateSessionCache, withAuthTimeout } from './authService.js';
import { ROLE, normalizeRole } from './roleRedirectService.js';
import { branchFromProfile, setCurrentBranch } from './branchContext.js';

function isLiveWorkshopPortal() {
  try {
    const hash = window.location.hash || '';
    return getLoginPortal() === 'live_workshop' ||
      sessionStorage.getItem('aiiens_live_workshop_auth') === '1' ||
      hash.includes('live-workshops');
  } catch {
    return false;
  }
}

export const AuthContext = React.createContext({
  session: null,
  profile: null,
  user: null,
  branch: '',
  loading: true,
  initialized: false,
  refreshProfile: async () => null,
});

export function AuthProvider({ children }) {
  const [session, setSession] = React.useState(null);
  const [profile, setProfile] = React.useState(null);
  const [branch, setBranch] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [initialized, setInitialized] = React.useState(false);
  const initCompleteRef = React.useRef(false);

  const refreshProfile = React.useCallback(async (nextSession = null) => {
    const user = nextSession?.user;
    if (!user) {
      setProfile(null);
      setBranch(setCurrentBranch(''));
      return null;
    }
    if (isLiveWorkshopPortal()) {
      setProfile(null);
      setBranch(setCurrentBranch(''));
      return null;
    }
    console.log('[PROFILE_FETCH_START]', { userId: user.id, email: user.email });
    console.log("FETCHING PROFILE");
    console.log("AUTH USER ID", user.id);
    console.log("AUTH USER EMAIL", user.email);
    try {
      let result = await withAuthTimeout(
        fetchProfileByAuthId(user.id),
        'fetchProfileByAuthId',
        8000,
      );
      if (result.error) {
        console.warn('[PROFILE_FETCH_FAILED]', { userId: user.id, error: result.error.message });
        result = await withAuthTimeout(
          fetchProfileByAuthId(user.id),
          'fetchProfileByAuthId.retry',
          8000,
        );
      }
      let row = result.profile;
      if (!row && !result.error) {
        console.log('[PROFILE_MISSING]', { userId: user.id, email: user.email, action: 'auto-create' });
        const portalRole = normalizeRole(getLoginPortal()) || ROLE.STUDENT;
        const createResult = await withAuthTimeout(
          ensureProfileForAuthUser(user, portalRole),
          'ensureProfileForAuthUser',
          5000,
        );
        if (createResult.error) {
          console.error('[PROFILE_CREATE_FAILED]', { userId: user.id, error: createResult.error.message });
          window.hideLoading?.();
          //window.showToast?.('Unable to initialize your profile. Please refresh and try again.', 'red');
          return null;
        }
        row = createResult.profile;
        console.log('[PROFILE_CREATED]', { userId: user.id, role: row?.role || portalRole });
      }
      if (result.error) {
        console.error('[PROFILE_FETCH_FAILED]', { userId: user.id, error: result.error.message });
        window.hideLoading?.();
        window.showToast?.('Unable to load your profile. Please refresh and try again.', 'red');
        return null;
      }
      console.log('[PROFILE_FETCH_SUCCESS]', { userId: user.id, hasProfile: Boolean(row), role: row?.role || null });
      console.log("PROFILE RESPONSE", row);
      if (row) {
        console.log("ROLE DETECTED", row.role);
      }
      if (row && !row.onboarding_completed) {
        console.log('[ONBOARDING_STARTED]', { userId: user.id, role: row?.role || null });
      }
      if (row && row.role === 'subadmin') {
        const username = row.email?.split('@')[0] || row.full_name;
        const { data: subAdminAcc } = await supabase.from('sub_admin_accounts').select('*').eq('username', username).maybeSingle();
        if (subAdminAcc) {
          window.APP = window.APP || {};
          window.APP.subAdminData = subAdminAcc;
          window.APP.adminType = 'subadmin';
          window.APP.role = 'subadmin';
          window.APP.session = true;
        }
      } else if (row && row.role === 'admin') {
        const username = row.email?.split('@')[0] || row.full_name;
        const { data: adminAcc } = await supabase.from('admin_accounts').select('*').eq('username', username).maybeSingle();
        if (adminAcc) {
          window.APP = window.APP || {};
          window.APP.user = adminAcc;
          window.APP.adminType = 'admin';
          window.APP.role = 'admin';
          window.APP.session = true;
        }
      }
      setProfile(row);
      setBranch(setCurrentBranch(branchFromProfile(row)));
      console.log('[AUTH] Profile loaded', { userId: user.id, hasProfile: Boolean(row), role: row?.role || null });
      return row;
    } catch (err) {
      console.error('[PROFILE_FETCH_FAILED]', { userId: user.id, error: err?.message || String(err) });
      window.hideLoading?.();
     //window.showToast?.('Unable to initialize your profile. Please refresh and try again.', 'red');
      return null;
    }
  }, []);

  React.useEffect(() => {
    let mounted = true;
    async function init() {
      const navEntry = performance?.getEntriesByType?.('navigation')?.[0];
      const refreshDetected = navEntry?.type === 'reload';
      if (refreshDetected) {
        console.log('[AUTH] Refresh detected', { path: window.location.hash || window.location.pathname });
      }
      if (!supabase) {
        if (mounted) {
          window.__aimeasyAuthRestoring = false;
          window.__aimeasyAuthBootstrapComplete = true;
          setInitialized(true);
          setLoading(false);
          console.log('[AUTH] Auth Completed', { initialized: true, hasSession: false });
        }
        return;
      }
      let completedHasSession = false;
      window.__aimeasyAuthRestoring = true;
      window.__aimeasyAuthBootstrapComplete = false;
      const timeout = window.setTimeout(() => {
        if (mounted && !initCompleteRef.current) {
          console.warn('[AUTH] Bootstrap timeout - forcing loading=false');
          initCompleteRef.current = true;
          window.__aimeasyAuthRestoring = false;
          window.__aimeasyAuthBootstrapComplete = true;
          setInitialized(true);
          setLoading(false);
          console.log('[AUTH] Auth Completed', { initialized: true, hasSession: completedHasSession });
          window.dispatchEvent(new CustomEvent('aimeasy:auth-bootstrap-complete'));
        }
      }, 8000);
      try {
        const { data, error } = await getSessionOnce();
        if (!mounted) return;
        if (error) {
          console.warn('[AUTH] Session restore failed', { error: error.message });
          setSession(null);
          setProfile(null);
          setBranch(setCurrentBranch(''));
          completedHasSession = false;
          return;
        }

        const restoredSession = data?.session || null;
        completedHasSession = Boolean(restoredSession);
        setSession(restoredSession);
        if (restoredSession) {
          console.log('[AUTH] Session restored', { userId: restoredSession.user?.id });
          console.log('[AUTH] User authenticated', { userId: restoredSession.user?.id });
          try {
            await refreshProfile(restoredSession);
          } catch (e) {
            console.warn('[AUTH] Profile restore failed', { error: e?.message || String(e) });
          }
        } else {
          console.log('[AUTH] Session restored', { hasSession: false });
          setProfile(null);
          setBranch(setCurrentBranch(''));
        }
      } finally {
        window.clearTimeout(timeout);
        initCompleteRef.current = true;
        window.__aimeasyAuthRestoring = false;
        window.__aimeasyAuthBootstrapComplete = true;
        if (mounted) {
          setInitialized(true);
          setLoading(false);
          console.log('[AUTH] Auth Completed', { initialized: true, hasSession: completedHasSession });
          window.dispatchEvent(new CustomEvent('aimeasy:auth-bootstrap-complete'));
        }
      }
    }
    init();

    if (!supabase) {
      return () => {
        mounted = false;
      };
    }

    const { data: listener } = supabase.auth.onAuthStateChange(async (event, nextSession) => {
      console.log('[AUTH] Auth state changed', { event, hasSession: Boolean(nextSession) });
      if (nextSession?.user) {
        console.log("AUTH SUCCESS", nextSession.user);
        console.log("SESSION FOUND", nextSession);
      }
      if (!initCompleteRef.current) return;
      if (event === 'INITIAL_SESSION') return;
      if (window.__aimeasyRoutingInProgress) {
        setSession(nextSession || null);
        refreshProfile(nextSession || null);
        return;
      }

      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
        invalidateSessionCache();
      }
      setSession(nextSession || null);
      try {
        await refreshProfile(nextSession || null);
      } catch (e) {
        console.warn('[AUTH] refreshProfile in event handler threw', e);
      } finally {
        setLoading(false);
        console.log('[AUTH] Auth Completed', { initialized: true, hasSession: Boolean(nextSession) });
      }
    });

    return () => {
      mounted = false;
      listener?.subscription?.unsubscribe?.();
    };
  }, [refreshProfile]);

  React.useEffect(() => {
    window.aimeasyRefreshProfile = () => refreshProfile(session);
    const refreshFromEvent = () => {
      refreshProfile(session);
    };
    window.addEventListener('aimeasy:profile-updated', refreshFromEvent);
    return () => {
      if (window.aimeasyRefreshProfile) delete window.aimeasyRefreshProfile;
      window.removeEventListener('aimeasy:profile-updated', refreshFromEvent);
    };
  }, [refreshProfile, session]);

  React.useEffect(() => {
    console.log("LOADING STATE", loading);
  }, [loading]);

  return (
    <AuthContext.Provider value={{ session, profile, user: session?.user || null, branch, loading, initialized, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return React.useContext(AuthContext);
}
