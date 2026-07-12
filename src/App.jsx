import React from 'react';
import LegacyAppShell from './components/legacy-shell/LegacyAppShell.jsx';
import {
  installBrowserNavigation,
  startBrowserNavigation,
} from './legacy/installBrowserNavigation.js';
import { installCriticalFixes } from './legacy/installCriticalFixes.js';
import { installSupabaseAdminSync } from './legacy/installSupabaseAdminSync.js';
import { installSingleSourceFlowPatch } from './legacy/installSingleSourceFlowPatch.js';
import { installAdminSubjectCrud } from './legacy/installAdminSubjectCrud.js';
import { installWorkspaceIsolation } from './legacy/installWorkspaceIsolation.js';
import { installDynamicBranches } from './legacy/installDynamicBranches.js';
import { installIntroSplash } from './legacy/installIntroSplash.js';
import legacyScript from './legacy/legacy-app.js?raw';

import legacyPatchScript from './legacy/legacy-patches.js?raw';
import aimeasyFixScript from './legacy/aimeasy-fixes.js?raw';
import { installBackButtonFixes } from './legacy/installBackButtonFixes.js';
import { installExplorer } from './legacy/installExplorer.js';
import { installSidebarCollapse } from './legacy/installSidebarCollapse.js';
import { runLegacyScripts } from './legacy/runLegacyScripts.js';
import {
  hydrateLegacyState,
  installLegacyStorageBridge,
} from './services/backend/legacyStorageBridge.js';
import { supabase } from './services/supabase/client.js';
window.supabase = supabase;
globalThis.supabase = supabase;

console.log('SUPABASE EXPOSED', typeof window.supabase);
import { AuthProvider, useAuth } from './services/auth/AuthProvider.jsx';
import { AcademicCatalogProvider } from './services/academic/AcademicCatalogProvider.jsx';
import { profileToLegacyUser } from './services/auth/profileService.js';
import { normalizeRole } from './services/auth/roleRedirectService.js';

function currentHashRoute() {
  const raw = (window.location.hash || '').replace(/^#/, '');
  if (!raw || raw === '/') return '/landing';
  return raw.startsWith('/') ? raw : `/${raw}`;
}

function isLiveWorkshopSession() {
  // Supabase authentication is the session source of truth. The route is
  // sufficient to identify the workshop surface without a browser cache.
  return currentHashRoute().includes('live-workshops');
}

function hydrateLegacyAuth(session, profile) {
  if (!window.APP || !session?.user) return null;
  try {
    if (window.APP.adminType) {
      console.log('[AUTH] Legacy APP hydrate skipped for active admin flow', { userId: session.user.id });
      return null;
    }
  } catch {
    if (window.APP.adminType) return null;
  }

  const legacyUser = profile ? profileToLegacyUser(profile) : {
    id: session.user.id,
    googleId: session.user.id,
    email: session.user.email,
    name:
      session.user.user_metadata?.full_name ||
      session.user.user_metadata?.name ||
      session.user.email?.split('@')[0] ||
      'Student',
    role: normalizeRole(window.APP.role) || 'student',
  };

  const role = normalizeRole(legacyUser.role || profile?.role || window.APP.role) || 'student';
  window.APP.user = { ...legacyUser, role };
  window.APP.role = role;
  window.APP.session = true;
  if (role === 'student') window.APP.adminType = null;
  console.log('[AUTH] Legacy APP hydrated', { userId: session.user.id, role });
  return role;
}

function syncStudentProfileUi() {
  if (normalizeRole(window.APP?.role || window.APP?.user?.role) !== 'student') return;
  window.updateSidebarProfile?.();
}

function AuthenticatedLegacyApp() {
  const { session, profile, loading: authLoading } = useAuth();
  const installedRef = React.useRef(false);
  const hydratedRef = React.useRef(false);
  const routedSessionRef = React.useRef('');
  const latestSessionRef = React.useRef(session);

  React.useEffect(() => {
    latestSessionRef.current = session;
  }, [session]);

  React.useEffect(() => {
    if (authLoading) return undefined;
    if (installedRef.current) return undefined;
    installedRef.current = true;
    let cancelled = false;

    window.__AIMEASY_SUPABASE__ = supabase;
    installBackButtonFixes();
    installBrowserNavigation();
    const cleanupLegacyScripts = runLegacyScripts([
      { name: 'legacy-app.js', source: legacyScript },
      { name: 'legacy-patches.js', source: legacyPatchScript },
      { name: 'aimeasy-fixes.js', source: aimeasyFixScript },
    ]);
    installExplorer();
    installSidebarCollapse();
    installCriticalFixes();
    installSupabaseAdminSync();
    if (session?.user && profile) {
      hydratedRef.current = true;
      hydrateLegacyAuth(session, profile);
      syncStudentProfileUi();
    }

    window.setTimeout(async () => {
      if (cancelled) return;
      installIntroSplash();
      const latestSession = latestSessionRef.current;
      const latestProfile = profile;
      if (latestSession?.user && latestProfile) {
        hydratedRef.current = true;
        hydrateLegacyAuth(latestSession, latestProfile);
        syncStudentProfileUi();
      }
      if (cancelled) return;
      installAdminSubjectCrud();
      installWorkspaceIsolation();
      installDynamicBranches();
      installSingleSourceFlowPatch();
      await startBrowserNavigation();
      if (latestSession?.user) {
        routedSessionRef.current = `${latestSession.user.id}:${window.location.hash || ''}`;
        await window.syncSessionFromSupabase?.({ reason: 'app-authenticated-bootstrap' });
        if (!isLiveWorkshopSession()) {
          hydrateLegacyAuth(latestSession, latestProfile);
          syncStudentProfileUi();
        }
      }
    }, 0);

    return () => {
      cancelled = true;
      cleanupLegacyScripts?.();
      installedRef.current = false;
      hydratedRef.current = false;
    };
  }, [authLoading]);

  React.useEffect(() => {
    if (authLoading || !installedRef.current || !session?.user || !profile) return undefined;
    hydrateLegacyAuth(session, profile);
    syncStudentProfileUi();
  }, [authLoading, profile, session]);

  React.useEffect(() => {
    if (authLoading || !session?.user || !profile) return;
    if (isLiveWorkshopSession()) return;
    const isComplete = !!profile.onboarding_completed;
    if (isComplete) {
      const activeScreen = document.querySelector('.screen.active')?.id;
      if (activeScreen === 'screen-setting-up-profile' || !activeScreen || activeScreen === 'screen-landing') {
        const role = normalizeRole(profile.role);
        console.log("NAVIGATING TO", role);
        window.syncSessionFromSupabase?.({ reason: 'force-profile-ready-redirect' }).then((success) => {
          if (success) {
            console.log("DASHBOARD REDIRECT SUCCESS");
          }
        });
      }
    }
  }, [authLoading, session, profile]);

  React.useEffect(() => {
    if (authLoading || !installedRef.current || !session?.user) return undefined;
    const routeKey = `${session.user.id}:${window.location.hash || ''}`;
    if (routedSessionRef.current === routeKey) return undefined;
    routedSessionRef.current = routeKey;

    const timer = window.setTimeout(async () => {
      console.log('[AUTH] React session handoff to central router', { userId: session.user.id });
      await window.syncSessionFromSupabase?.({ reason: 'react-auth-session' });
      if (profile) {
        hydrateLegacyAuth(session, profile);
        syncStudentProfileUi();
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [authLoading, profile, session?.user?.id]);

  if (authLoading) {
    return (
      <main className="aimeasy-app">
        <div className="loading-overlay">
          <div className="loading-logo">
            AIIENS <span>Edu</span>
          </div>
          <div className="loading-spinner" />
          <p className="loading-text">Restoring session...</p>
        </div>
      </main>
    );
  }

  return <LegacyAppShell />;
}
export default function App() {
  const [backendReady, setBackendReady] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;

    async function prepareBackend() {
      window.hydrateLegacyState = hydrateLegacyState;
      await hydrateLegacyState();
      installLegacyStorageBridge();
      if (!cancelled) setBackendReady(true);
    }

    prepareBackend();

    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    const handleMouseMove = (e) => {
      const card = e.target.closest('.card, .metric-card, .progress-tracker, .video-sidebar, .subject-card, .subject-item, .unit-card, .sidebar, .admin-sidebar, .topbar, .admin-topbar, .btn');
      if (card) {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        card.style.setProperty('--mouse-x', `${x}px`);
        card.style.setProperty('--mouse-y', `${y}px`);
      }
    };
    document.addEventListener('mousemove', handleMouseMove);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  if (!backendReady) {
    return (
      <main className="aimeasy-app">
        <div className="loading-overlay">
          <div className="loading-logo">
            AIIENS <span>Edu</span>
          </div>
          <div className="loading-spinner" />
          <p className="loading-text">Connecting app data...</p>
        </div>
      </main>
    );
  }

  return (
    <AuthProvider>
      <AcademicCatalogProvider>
        <AuthenticatedLegacyApp />
      </AcademicCatalogProvider>
    </AuthProvider>
  );
}
