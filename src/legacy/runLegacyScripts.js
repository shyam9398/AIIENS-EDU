const LEGACY_SCRIPT_ID = 'aimeasy-legacy-runtime';

function installInlineHandlerFallbacks() {
  const ensure = (name, fallback) => {
    if (typeof window[name] !== 'function' && typeof fallback === 'function') {
      window[name] = fallback;
    }
    if (typeof window[name] === 'function') {
      if (typeof globalThis[name] !== 'function') {
        globalThis[name] = window[name];
      }
      if (typeof window[name] !== 'function') {
        window[name] = globalThis[name];
      }
    }
  };

  ensure('selectRoleAndNavigate', function selectRoleAndNavigateFallback(role) {
    console.log(`[ROLE CLICK] ${role === 'content_creator' ? 'Creator' : role === 'student' ? 'Student' : role}`);
    if (window.APP) {
      if (role === 'student' || role === 'content_creator') {
        window.APP.adminType = null;
        window.APP.subAdminData = null;
        window.APP.session = false;
        window.APP.user = null;
      }
      if (window.APP.adminType !== 'admin' && window.APP.adminType !== 'subadmin') {
        window.APP.role = role;
      }
    }
    document.querySelectorAll('.role-card').forEach((card) => card.classList.remove('selected'));
    const cardId = role === 'content_creator' ? 'role-creator' : `role-${role}`;
    document.getElementById(cardId)?.classList.add('selected');
    if (typeof window.proceedWithRole === 'function') {
      window.setTimeout(() => window.proceedWithRole(), 220);
    }
  });

  ensure('toggleAdminDropdown', function toggleAdminDropdownFallback(event) {
    event?.stopPropagation?.();
    const dropdown = document.getElementById('admin-dropdown');
    if (!dropdown) return;
    dropdown.classList.toggle('open', !dropdown.classList.contains('open'));
  });

  ensure('toggleAdminSidebar', function toggleAdminSidebarFallback() {
    document.getElementById('admin-sidebar')?.classList.toggle('open');
    document.getElementById('admin-sidebar-backdrop')?.classList.toggle('open');
  });

  ensure('closeAdminSidebar', function closeAdminSidebarFallback() {
    document.getElementById('admin-sidebar')?.classList.remove('open');
    document.getElementById('admin-sidebar-backdrop')?.classList.remove('open');
  });

  ensure('switchAdminSection', function switchAdminSectionFallback(section = 'dashboard') {
    window.closeAdminSidebar?.();
    document.querySelectorAll('[id^="admin-nav-"]').forEach((item) => item.classList.remove('active'));
    document.getElementById(`admin-nav-${section}`)?.classList.add('active');
    const title = document.getElementById('admin-topbar-title');
    if (title) {
      title.textContent = ({
        dashboard: 'Admin Dashboard',
        create: 'Create & Manage',
        subjects: 'All Subjects',
        approvals: 'URL Approvals',
      })[section] || 'Admin';
    }
    window.renderAdminSection?.(section);
  });

  ['renderAdminSection', 'launchAdminDashboard', 'launchSubAdmin', 'openAdminLogin', 'submitAdminLogin', 'showScreen', 'showLoading', 'hideLoading', 'adminLogout', 'toggleSASidebar', 'switchSASection', 'closeSASidebar', 'subAdminBack'].forEach((name) => ensure(name));

  const auditNames = [
    'toggleAdminSidebar',
    'closeAdminSidebar',
    'switchAdminSection',
    'renderAdminSection',
    'launchAdminDashboard',
    'launchSubAdmin',
    'openAdminLogin',
    'submitAdminLogin',
    'showScreen',
    'selectRoleAndNavigate',
    'toggleAdminDropdown',
    'showLoading',
    'hideLoading',
    'adminLogout',
    'toggleSASidebar',
    'switchSASection',
    'closeSASidebar',
    'subAdminBack',
  ];
  const auditReport = {};
  auditNames.forEach((name) => {
    auditReport[name] = typeof window[name];
    if (typeof window[name] !== 'function') {
      console.error('[BUTTON AUDIT MISSING]', name, auditReport[name]);
    }
  });
  console.log('BUTTON AUDIT', auditReport);
}

export function runLegacyScripts(scripts) {
  if (document.getElementById(LEGACY_SCRIPT_ID)) {
    installInlineHandlerFallbacks();
    return () => {};
  }

  const holder = document.createElement('div');
  holder.id = LEGACY_SCRIPT_ID;
  holder.hidden = true;
  document.body.appendChild(holder);

  scripts.forEach((entry, index) => {
    const isString = typeof entry === 'string';
    const name = isString ? `legacy-script-${index}` : entry.name || `legacy-script-${index}`;
    const source = isString ? entry : entry.source;
    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.dataset.legacyIndex = String(index);
    script.dataset.legacyName = name;
    script.textContent = source;
    holder.appendChild(script);
    console.log('[LOADED]', name);
  });

  window.setTimeout(() => {
    installInlineHandlerFallbacks();
    window.dispatchEvent(new Event('load'));
  }, 0);

  return () => {
    holder.remove();
  };
}
