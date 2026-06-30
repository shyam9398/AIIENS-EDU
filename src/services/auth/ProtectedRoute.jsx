import React from 'react';
import { dashboardPathForRole, roleCanAccess } from './roleRedirectService.js';
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
    if (profile?.role && !roleCanAccess(profile.role, role)) {
      redirect(dashboardPathForRole(profile.role));
    }
  }, [initialized, loading, profile?.role, redirect, role, session?.user]);

  if (loading || !initialized) return fallback;
  if (!session?.user) return fallback;
  if (profile?.role && !roleCanAccess(profile.role, role)) return fallback;

  return children;
}
