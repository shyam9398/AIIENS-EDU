export function normalizeBranch(branch) {
  const value = String(branch || '').trim();
  return value ? value.toUpperCase() : '';
}

export function branchFromProfile(profile) {
  return normalizeBranch(profile?.branch || profile?.branch_name);
}

export function setCurrentBranch(branch) {
  const normalized = normalizeBranch(branch);
  try {
    if (normalized) localStorage.setItem('aiiens_current_branch', normalized);
    else localStorage.removeItem('aiiens_current_branch');
  } catch {
    /* ignore */
  }
  if (typeof window !== 'undefined') {
    window.__AIIENS_CURRENT_BRANCH__ = normalized;
  }
  return normalized;
}

export function getCurrentBranch(fallback = '') {
  if (typeof window === 'undefined') return normalizeBranch(fallback);
  return normalizeBranch(
    fallback ||
      window.APP?.user?.branch ||
      window.APP?.user?.branch_name ||
      window.APP?.subAdminData?.branch ||
      window.__AIIENS_CURRENT_BRANCH__ ||
      localStorage.getItem('aiiens_current_branch'),
  );
}

export function isSameBranch(left, right) {
  const expected = normalizeBranch(right);
  if (!expected) return true;
  return normalizeBranch(left) === expected;
}
