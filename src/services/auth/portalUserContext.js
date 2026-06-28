/**
 * Portal user identity for Admin / SubAdmin workspace isolation.
 * Uses account id from admin_accounts / sub_admin_accounts as created_by.
 */

export function getPortalActorId() {
  if (typeof window === 'undefined' || !window.APP) return null;
  if (window.APP.role === 'admin' && window.APP.user?.id) {
    return String(window.APP.user.id);
  }
  if (window.APP.role === 'subadmin' && window.APP.subAdminData?.id) {
    return String(window.APP.subAdminData.id);
  }
  return null;
}

export function getPortalActorUsername() {
  if (typeof window === 'undefined' || !window.APP) return null;
  return window.APP.user?.username || window.APP.subAdminData?.username || null;
}

export function getPortalActorRole() {
  if (typeof window === 'undefined' || !window.APP) return null;
  if (window.APP.role === 'admin') return 'admin';
  if (window.APP.role === 'subadmin') return 'subadmin';
  return null;
}

/** Match created_by against account id (preferred) or legacy username. */
export function isRecordOwner(record) {
  const createdBy = String(record?.created_by ?? '').trim();
  if (!createdBy) return false;

  const actorId = getPortalActorId();
  if (actorId && createdBy === actorId) return true;

  const actorUsername = getPortalActorUsername();
  if (actorUsername && createdBy.toLowerCase() === actorUsername.toLowerCase()) return true;

  return false;
}

export function subjectCreateMeta() {
  const role = getPortalActorRole() || 'subadmin';
  const id = getPortalActorId();
  const username = getPortalActorUsername();
  return {
    created_by: id || username || role,
    created_by_role: role,
  };
}

export function assertRecordOwner(record, action = 'modify') {
  if (isRecordOwner(record)) return null;
  return new Error(`You can only ${action} records you created.`);
}

/** Active workspace from live sub_admin_accounts row (never localStorage). */
export function getSubAdminWorkspace() {
  if (typeof window === 'undefined' || window.APP?.role !== 'subadmin') return null;
  const sa = window.APP?.subAdminData;
  if (!sa) return null;
  return {
    university: String(sa.university || '').trim(),
    branch: String(sa.branch || '').trim(),
    regulation: String(sa.regulation || sa.regulation_code || '').trim(),
  };
}

export function workspaceKeyFromAccount(account) {
  if (!account) return '';
  const university = String(account.university || '').trim();
  const branch = String(account.branch || '').trim();
  const regulation = String(account.regulation || account.regulation_code || '').trim();
  return `${university}|${branch}|${regulation}`;
}

/** Supabase query filters for the current SubAdmin workspace. */
export function getWorkspaceQueryFilters() {
  const ws = getSubAdminWorkspace();
  if (!ws || !isWorkspaceAssigned()) return null;
  const filters = {};
  if (ws.university && ws.university !== '-') filters.university_name = ws.university;
  if (ws.branch && ws.branch !== '-') filters.branch = ws.branch;
  if (ws.regulation && ws.regulation !== '-') filters.regulation_code = ws.regulation;
  return filters;
}

export function isWorkspaceAssigned() {
  const ws = getSubAdminWorkspace();
  if (!ws) return false;
  return Boolean(
    ws.university && ws.university !== '-'
    && ws.branch && ws.branch !== '-'
    && ws.regulation && ws.regulation !== '-',
  );
}

export function subjectMatchesWorkspace(subject) {
  const ws = getSubAdminWorkspace();
  if (!ws) return true;
  if (ws.university && ws.university !== '-') {
    if (String(subject?.university_name || '').trim() !== ws.university) return false;
  }
  if (ws.branch && ws.branch !== '-') {
    if (String(subject?.branch || '').trim() !== ws.branch) return false;
  }
  if (ws.regulation && ws.regulation !== '-') {
    if (String(subject?.regulation_code || '').trim() !== ws.regulation) return false;
  }
  return true;
}

export function clearSubAdminWorkspaceCaches() {
  if (typeof window === 'undefined') return;
  window._v10SaSubjectsCached = null;
  window._v10SASubj = null;
  window._v10SAUnitId = null;
}
