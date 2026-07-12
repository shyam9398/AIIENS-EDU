// Versioned key intentionally starts expanded for the corrected sidebar UI;
// later user toggles still persist across refreshes.
const PREFERENCE_PREFIX = 'aiiens:sidebar-collapsed:v2:';

function preferenceKey(role) {
  return `${PREFERENCE_PREFIX}${role}`;
}

function prepareMenuLabels(sidebar) {
  sidebar.querySelectorAll('.admin-nav-item').forEach((item) => {
    const label = item.querySelector('.sidebar-item-text')?.textContent?.trim();
    if (label) item.title = label;
  });
  sidebar.querySelectorAll('.nav-item').forEach((item) => {
    const label = item.querySelector('.nav-label')?.textContent?.trim();
    if (label) item.title = label;
  });
}

function setCollapsed(sidebarId, role, collapsed) {
  const sidebar = document.getElementById(sidebarId);
  if (!sidebar) return;
  prepareMenuLabels(sidebar);
  sidebar.classList.toggle('collapsed', collapsed);
  const button = sidebar.querySelector('.sidebar-collapse-toggle');
  if (button) {
    button.textContent = collapsed ? '\u203A' : '\u2039';
    button.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
    button.title = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
  }
  try { localStorage.setItem(preferenceKey(role), collapsed ? '1' : '0'); } catch {}
}

export function installSidebarCollapse() {
  const sidebars = [
    ['sidebar', 'student', 'toggleStudentSidebarCollapse'],
    ['admin-sidebar', 'admin', 'toggleAdminSidebarCollapse'],
    ['superadmin-sidebar', 'superadmin', 'toggleSuperAdminSidebarCollapse'],
    ['sa-sidebar', 'subadmin', 'toggleSASidebarCollapse'],
    ['cr-sidebar', 'creator', 'toggleCRSidebarCollapse'],
  ];
  sidebars.forEach(([id, role, action]) => {
    const sidebar = document.getElementById(id);
    if (!sidebar) return;
    let collapsed = false;
    try { collapsed = localStorage.getItem(preferenceKey(role)) === '1'; } catch {}
    setCollapsed(id, role, collapsed);
    window[action] = globalThis[action] = () => setCollapsed(id, role, !document.getElementById(id)?.classList.contains('collapsed'));
  });
}
