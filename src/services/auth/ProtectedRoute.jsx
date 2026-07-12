import React from 'react';
import { dashboardPathForRole, roleCanAccess } from './roleRedirectService.js';
import { profileHasRole } from './profileService.js';
import { useAuth } from './AuthProvider.jsx';

export default function ProtectedRoute({
  children,
  role = 'student',
  fallback = null,
  redirect = (path) => {
    window.history?.replaceState?.({ aimeasyPath: path, aimeasyIndex: 1 }, '', `${window.location.pathname}#${path}`);
  },
}) {
  const { session, profile, loading, initialized } = useAuth();

  React.useEffect(() => {
    if (loading || !initialized) return;
    if (!session?.user) {
      redirect('/landing');
      return;
    }
    if (profile && !profileHasRole(profile, role)) {
      redirect(dashboardPathForRole(profile?.role || profile?.roles?.[0]));
    }
  }, [initialized, loading, profile, redirect, role, session?.user]);

  if (loading || !initialized) return fallback;
  if (!session?.user) return fallback;
  if (profile && !profileHasRole(profile, role)) return fallback;

  return children;
}
