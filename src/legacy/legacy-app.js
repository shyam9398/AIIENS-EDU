// ═══════════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════════
const APP = {
  role: 'student',
  user: null,
  session: false,
  currentSubject: null,
  currentUnit: null,
  currentVideoIndex: 0,
  markedReviews: new Set(),
  backlogSubjects: [],
  calcRows: [],
  chatOpen: false,
  calcSemesters: [],
  currentSemId: null,
  adminType: null,
  subAdminData: null,
};
window.APP = APP;

function logAuth(msg, data) {
  try {
    // Prefix makes it easy to filter in console
    console.log(`[AIIENS Edu][AUTH] ${msg}`, data || '');
  } catch (e) { }
}

function setLocalLegacySession(user) {
  // Legacy UI expects `edusync_session_user` and `APP.user`/`APP.session`
  try {
    const safeUser = user && typeof user === 'object' ? user : null;
    if (safeUser) {
      localStorage.setItem('edusync_session_user', JSON.stringify(safeUser));
      APP.user = safeUser;
      APP.session = true;
    }
  } catch (e) { }
}

async function syncSessionFromSupabase({ reason } = {}) {
  if (
    typeof window.syncSessionFromSupabase === 'function' &&
    window.syncSessionFromSupabase !== syncSessionFromSupabase
  ) {
    return window.syncSessionFromSupabase({ reason: reason || 'legacy-delegated' });
  }

  // Pull Supabase session.
  // Do NOT auto-redirect to dashboard until profile completion is verified.

  // This is the core fix for OAuth redirect + session persistence.
  try {
    if (!window.__AIMEASY_SUPABASE__) {
      logAuth('Supabase client missing on window.__AIMEASY_SUPABASE__');
      return false;
    }

    logAuth('Getting Supabase session...', { reason });
    const { data, error } = await window.__AIMEASY_SUPABASE__.auth.getSession();
    if (error) {
      logAuth('getSession error', error);
      return false;
    }

    const session = data?.session || null;
    logAuth('Initial Supabase session result', {
      hasSession: !!session,
      user: session?.user,
    });

    if (!session?.user) {
      return false;
    }

    // Map Supabase user -> legacy user shape expected by UI.
    // Keep it minimal; profileStep UI can still enrich it later.
    const u = session.user;
    const legacyUser = {
      id: u.id,
      email: u.email,
      name: u.user_metadata?.full_name || u.user_metadata?.name || u.email?.split('@')?.[0] || 'Student',
      role: APP.role || 'student',
      googleId: u.id,
    };

    setLocalLegacySession(legacyUser);

    // Route based on profile completion status (do NOT auto-landing dashboard)
    // This codebase's profile gating is localStorage-based.
    // AIIENS Edu fixes handle saving/enrichment on submit; here we only decide the screen.
    const user = session.user || session;
    const legacy = JSON.parse(localStorage.getItem('edusync_session_user') || 'null') || APP.user || {};
    const hasPersonal = !!(legacy.name && legacy.phone);
    const hasAcademic = !!(legacy.university && legacy.regulation && legacy.branch && legacy.semester);

    const hash = window.location.hash.replace(/^#/, '');
    const isAtLanding = !hash || hash === '/' || hash === '/landing';

    // Preserve existing hash for any role on refresh
    if (!isAtLanding) {
      // Extract first non‑empty segment after the leading slash
      const hashParts = window.location.hash.replace(/^#/, '').split('/').filter(Boolean);
      const target = hashParts[0] || '';
      if (target) {
        // Simple routing based on hash prefix
        if (target.startsWith('admin')) {
          showScreen('screen-admin');
        } else if (target.startsWith('subadmin')) {
          showScreen('screen-subadmin');
        } else {
          // Fallback to generic navigation for other routes
          navigateTo(target);
        }
        return true;
      }
      // If no specific target, fall back to student flow
      launchApp();
    }

    return true;


  } catch (e) {
    logAuth('syncSessionFromSupabase exception', { error: String(e) });
    return false;
  }
}

// Subject database — ALL 8 semesters
const SUBJECTS_DB = {
  '1-1': [
    { id: 'cp', name: 'C Programming', code: 'CS101', credits: 4, icon: '💻', color: 'blue', progress: 90, units: 5 },
    { id: 'me', name: 'Mathematics-I (Calculus)', code: 'MA101', credits: 4, icon: '📐', color: 'teal', progress: 85, units: 5 },
    { id: 'eng', name: 'English for Communication', code: 'EN101', credits: 2, icon: '📚', color: 'lavender', progress: 92, units: 5 },
    { id: 'phy', name: 'Engineering Physics', code: 'PH101', credits: 3, icon: '⚛️', color: 'amber', progress: 78, units: 5 },
    { id: 'wsc', name: 'Workshop & Safety', code: 'ME101', credits: 2, icon: '🔧', color: 'green', progress: 95, units: 5 },
  ],
  '1-2': [
    { id: 'coa', name: 'Computer Organization', code: 'CS102', credits: 3, icon: '🖥️', color: 'teal', progress: 70, units: 5 },
    { id: 'me2', name: 'Mathematics-II (Linear Algebra)', code: 'MA102', credits: 4, icon: '🔢', color: 'lavender', progress: 65, units: 5 },
    { id: 'chem', name: 'Engineering Chemistry', code: 'CH101', credits: 3, icon: '⚗️', color: 'blue', progress: 75, units: 5 },
    { id: 'ds1', name: 'Digital Systems', code: 'EC101', credits: 3, icon: '💡', color: 'amber', progress: 60, units: 5 },
    { id: 'egs', name: 'Engineering Graphics', code: 'ME102', credits: 2, icon: '📏', color: 'green', progress: 80, units: 5 },
  ],
  '2-1': [
    { id: 'dsa', name: 'Data Structures & Algorithms', code: 'CS201', credits: 4, icon: '🌳', color: 'teal', progress: 80, units: 5 },
    { id: 'co', name: 'Computer Organization', code: 'CS202', credits: 3, icon: '🖥️', color: 'lavender', progress: 65, units: 5 },
    { id: 'dm', name: 'Discrete Mathematics', code: 'CS203', credits: 3, icon: '📐', color: 'blue', progress: 70, units: 5 },
    { id: 'oops', name: 'Object Oriented Programming', code: 'CS204', credits: 4, icon: '🧩', color: 'amber', progress: 90, units: 5 },
    { id: 'prob', name: 'Probability & Statistics', code: 'MA201', credits: 3, icon: '📊', color: 'green', progress: 72, units: 5 },
  ],
  '2-2': [
    { id: 'flat', name: 'Formal Languages & Automata', code: 'CS211', credits: 3, icon: '🔣', color: 'teal', progress: 55, units: 5 },
    { id: 'algo', name: 'Design & Analysis of Algorithms', code: 'CS212', credits: 3, icon: '📈', color: 'lavender', progress: 60, units: 5 },
    { id: 'java', name: 'Java Programming', code: 'CS213', credits: 4, icon: '☕', color: 'blue', progress: 78, units: 5 },
    { id: 'es', name: 'Environmental Science', code: 'ES201', credits: 2, icon: '🌿', color: 'green', progress: 45, units: 5 },
    { id: 'dbms2', name: 'Database Systems', code: 'CS214', credits: 3, icon: '🗄️', color: 'amber', progress: 68, units: 5 },
  ],
  '3-1': [
    { id: 'os', name: 'Operating Systems', code: 'CS301', credits: 3, icon: '💻', color: 'teal', progress: 52, units: 5 },
    { id: 'dbms', name: 'Database Management Systems', code: 'CS302', credits: 3, icon: '🗄️', color: 'lavender', progress: 76, units: 5 },
    { id: 'cn', name: 'Computer Networks', code: 'CS303', credits: 3, icon: '🌐', color: 'blue', progress: 61, units: 5 },
    { id: 'ds', name: 'Data Structures', code: 'CS304', credits: 3, icon: '📊', color: 'green', progress: 87, units: 5 },
    { id: 'se', name: 'Software Engineering', code: 'CS305', credits: 2, icon: '⚙️', color: 'amber', progress: 40, units: 5 },
    { id: 'mp', name: 'Microprocessors', code: 'CS306', credits: 3, icon: '🔧', color: 'pink', progress: 35, units: 5 },
  ],
  '3-2': [
    { id: 'csa', name: 'Computer System Architecture', code: 'CS401', credits: 3, icon: '🏗️', color: 'teal', progress: 45, units: 5 },
    { id: 'ml', name: 'Machine Learning', code: 'CS402', credits: 3, icon: '🤖', color: 'lavender', progress: 68, units: 5 },
    { id: 'cc', name: 'Cloud Computing', code: 'CS403', credits: 3, icon: '☁️', color: 'blue', progress: 30, units: 5 },
    { id: 'cd', name: 'Compiler Design', code: 'CS404', credits: 3, icon: '🔨', color: 'amber', progress: 55, units: 5 },
    { id: 'ai', name: 'Artificial Intelligence', code: 'CS405', credits: 3, icon: '🧠', color: 'green', progress: 72, units: 5 },
  ],
  '4-1': [
    { id: 'dl', name: 'Deep Learning', code: 'CS501', credits: 3, icon: '🧠', color: 'lavender', progress: 40, units: 5 },
    { id: 'is', name: 'Information Security', code: 'CS502', credits: 3, icon: '🔐', color: 'teal', progress: 50, units: 5 },
    { id: 'bd', name: 'Big Data Analytics', code: 'CS503', credits: 3, icon: '📦', color: 'blue', progress: 35, units: 5 },
    { id: 'mob', name: 'Mobile App Development', code: 'CS504', credits: 3, icon: '📱', color: 'amber', progress: 60, units: 5 },
    { id: 'pe1', name: 'Professional Elective-I', code: 'CS505', credits: 3, icon: '🎓', color: 'green', progress: 45, units: 5 },
  ],
  '4-2': [
    { id: 'iot', name: 'Internet of Things', code: 'CS601', credits: 3, icon: '🌐', color: 'teal', progress: 30, units: 5 },
    { id: 'bc', name: 'Blockchain Technology', code: 'CS602', credits: 3, icon: '⛓️', color: 'lavender', progress: 25, units: 5 },
    { id: 'proj', name: 'Major Project', code: 'CS603', credits: 6, icon: '🚀', color: 'blue', progress: 15, units: 5 },
    { id: 'pe2', name: 'Professional Elective-II', code: 'CS604', credits: 3, icon: '📖', color: 'amber', progress: 20, units: 5 },
    { id: 'seminar', name: 'Technical Seminar', code: 'CS605', credits: 2, icon: '🎤', color: 'green', progress: 50, units: 5 },
  ],
};

// Unit topics per subject
const UNIT_TOPICS = {
  os: {
    1: ['Introduction to OS', 'Process Management', 'Process Scheduling', 'Process Synchronization', 'Deadlock Prevention'],
    2: ['Memory Management Basics', 'Paging', 'Segmentation', 'Virtual Memory', 'Page Replacement Algorithms'],
    3: ['File System Concepts', 'Directory Structure', 'File System Implementation', 'Disk Scheduling', 'I/O Systems'],
    4: ['Security Concepts', 'Access Control', 'Authentication', 'Protection Mechanisms', 'Case Studies'],
    5: ['Distributed Systems', 'Distributed File Systems', 'Deadlock in Distributed Systems', 'Election Algorithms', 'Recent Advances'],
  },
  dbms: {
    1: ['Introduction to DBMS', 'Data Models', 'ER Model', 'Relational Model', 'Schema Mapping'],
    2: ['SQL Basics', 'DDL & DML', 'Constraints', 'Joins & Subqueries', 'Views'],
    3: ['Normalization', '1NF 2NF 3NF', 'BCNF', 'Functional Dependencies', 'Lossless Decomposition'],
    4: ['Transaction Management', 'ACID Properties', 'Concurrency Control', 'Deadlock Handling', 'Recovery Techniques'],
    5: ['Indexing & Hashing', 'B+ Trees', 'Query Optimization', 'Distributed Databases', 'NoSQL Overview'],
  },
  default: {
    1: [],
    2: [],
    3: [],
    4: [],
    5: [],
  }
};

// REMOVED: Static NOTES_DB, PYQ_DB, IQ_DB — Only use admin-uploaded content
// const NOTES_DB = [ ... ]; // DEPRECATED - Use only admin-uploaded notes
// const PYQ_DB = [ ... ]; // DEPRECATED - Use only admin-uploaded PYQs
// const IQ_DB = [ ... ]; // DEPRECATED - Use only admin-uploaded Important Questions

const PYQ_DB = [];

// Static chatbot replies removed. Answers now come from the server-side Gemini endpoint.

// ═══════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════
window.addEventListener('load', async () => {
  setTimeout(() => hideLoading(), 200);
  updateLandingStats();
  buildHeatmap();
  await initCalc();
});



function hideLoading() {
  const ol = document.getElementById('loading-overlay');
  ol.classList.add('hidden');
  setTimeout(() => ol.style.display = 'none', 400);
}

// ═══════════════════════════════════════════════════
//  NAVIGATION
// ═══════════════════════════════════════════════════
function showScreen(id, role) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const screen = document.getElementById(id);
  if (!screen) {
    logAuth('showScreen target missing', { id });
    return;
  }
  screen.classList.add('active');
  if (role) APP.role = role;
  if (id === 'screen-landing') {
    updateLandingStats();
  }
}

function selectRole(role) {
  APP.role = role;
  document.querySelectorAll('.role-card').forEach(c => c.classList.remove('selected'));
  const cardId = role === 'content_creator' ? 'role-creator' : 'role-' + role;
  document.getElementById(cardId)?.classList.add('selected');
}

// ═══════════════════════════════════════════════════
//  ROLE SELECTION → AUTH FLOW
// ═══════════════════════════════════════════════════
function selectRoleAndNavigate(role) {
  const logLabel = role === 'content_creator' ? 'Creator' : role === 'student' ? 'Student' : role;
  console.log(`[ROLE CLICK] ${logLabel}`);
  APP.role = role;
  document.querySelectorAll('.role-card').forEach(c => c.classList.remove('selected'));
  const cardId = role === 'content_creator' ? 'role-creator' : 'role-' + role;
  document.getElementById(cardId)?.classList.add('selected');
  // Small delay for visual feedback, then navigate to auth
  setTimeout(() => proceedWithRole(), 220);
}

// proceedWithRole is overridden below (Task 2 — Google Auth flow)
function proceedWithRole_OLD() {
  if (APP.role === 'teacher') {
    showScreen('screen-teacher');
    return;
  }
  if (APP.session && APP.user) {
    showLoading('Signing you in...');
    setTimeout(() => { hideLoading(); launchApp(); }, 900);
    return;
  }
  showScreen('screen-profile');
}

function showLoading(text) {
  const ol = document.getElementById('loading-overlay');
  ol.querySelector('.loading-text').textContent = text || 'Loading...';
  ol.style.display = 'flex';
  ol.classList.remove('hidden');
}

// ═══════════════════════════════════════════════════
//  PROFILE SETUP
// ═══════════════════════════════════════════════════
function profileStep2() {
  alert("profileStep2 called");
  const name = document.getElementById('p-name').value.trim();
  const college = document.getElementById('p-college').value.trim();
  const phone = document.getElementById('p-phone').value.trim();

  if (!name) {
    showToast('Please enter your full name', 'red');
    return;
  }

  if (!college) {
    showToast('College name is mandatory', 'red');
    return;
  }

  if (!phone) {
    showToast('Mobile number is mandatory', 'red');
    return;
  }

  if (!/^[0-9]{10}$/.test(phone)) {
    showToast('Mobile number must be exactly 10 digits', 'red');
    return;
  }

  APP.user = { name, college, phone };
  document.getElementById('profile-step1').style.display = 'none';
  document.getElementById('profile-step2').style.display = 'block';
  document.getElementById('step1').className = 'profile-step done';
  document.getElementById('step2').className = 'profile-step active';
}

function backToStep1() {
  document.getElementById('profile-step1').style.display = 'block';
  document.getElementById('profile-step2').style.display = 'none';
  document.getElementById('step1').className = 'profile-step active';
  document.getElementById('step2').className = 'profile-step';
}

// submitProfile is overridden below (Task 3 — adds branch + localStorage persist)
function submitProfile_OLD() {
  const uni = document.getElementById('p-university').value;
  const reg = document.getElementById('p-regulation').value;
  const sem = document.getElementById('p-semester').value;
  if (!uni || !reg || !sem) { showToast('Please fill all academic fields', 'red'); return; }
  APP.user = { ...APP.user, university: uni, regulation: reg, year: sem.split('-')[0], semester: sem };
  sessionStorage.setItem('edusync_user', JSON.stringify(APP.user));
  APP.session = true;
  showLoading('Setting up your personalized dashboard...');
  setTimeout(() => { hideLoading(); launchApp(); }, 1200);
}

function previewPhoto(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const c = document.getElementById('photo-circle');
    c.innerHTML = `<img src="${ev.target.result}" alt="Profile">`;
    if (APP.user) APP.user.photo = ev.target.result;
  };
  reader.readAsDataURL(file);
}

// ═══════════════════════════════════════════════════
//  APP LAUNCH
// ═══════════════════════════════════════════════════
function launchApp() {
  showScreen('screen-app');
  updateSidebarProfile();
  document.getElementById('chat-fab').style.display = 'flex';
  if (!shouldPreserveStudentRouteOnLaunch()) {
    navigateTo('dashboard');
  }
}

function currentHashPath() {
  const raw = (window.location.hash || '').replace(/^#/, '');
  if (!raw || raw === '/') return '/landing';
  return raw.startsWith('/') ? raw : `/${raw}`;
}

function shouldPreserveStudentRouteOnLaunch() {
  const path = currentHashPath();
  const exactStudentRoutes = new Set([
    '/student/dashboard',
    '/student/subjects',
    '/student/calculator',
    '/student/backlog',
    '/student/skills',
    '/student/units',
    '/student/unit-content',
  ]);

  return (
    exactStudentRoutes.has(path) ||
    /^\/student\/subjects\/[^/]+$/.test(path) ||
    /^\/student\/units\/[^/]+$/.test(path) ||
    /^\/student\/unit-content\/[^/]+\/[^/]+$/.test(path)
  );
}

function resolveAppUser() {
  let stored = null;
  try {
    stored = JSON.parse(localStorage.getItem('edusync_session_user') || 'null');
  } catch (e) { }
  if (stored && typeof stored === 'object') {
    APP.user = { ...stored, ...(APP.user || {}) };
    APP.session = true;
  }
  return APP.user || null;
}

function updateDashGreeting() {
  const user = resolveAppUser();
  const greetEl = document.getElementById('dash-greeting-text');
  if (!user || !greetEl) return;
  const h = new Date().getHours();
  const greet = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = user.name?.split(' ')[0] || 'Student';
  greetEl.textContent = `${greet}, ${firstName}! 👋`;
}

function updateSidebarProfile() {
  const user = resolveAppUser();
  if (!user) return;
  const name = user.name || 'Student';
  const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  const av = document.getElementById('sidebar-avatar');
  if (!av) return;
  if (user.photo) {
    av.innerHTML = `<img src="${user.photo}" alt="${name}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
  } else {
    av.textContent = initials;
  }
  const nameEl = document.getElementById('sidebar-name');
  const infoEl = document.getElementById('sidebar-info');
  if (nameEl) nameEl.textContent = name.split(' ')[0];
  const yearVal = String(user.year || '');
  const yr = yearVal
    ? yearVal + (yearVal === '1' ? 'st' : yearVal === '2' ? 'nd' : yearVal === '3' ? 'rd' : 'th') + ' Year'
    : '';
  const branch = user.branch || user.branch_name || '';
  if (infoEl) infoEl.textContent = branch && yr ? `${branch} · ${yr}` : branch || yr || '';
  updateDashGreeting();
}
window.updateSidebarProfile = updateSidebarProfile;
window.updateDashGreeting = updateDashGreeting;
window.resolveAppUser = resolveAppUser;

function navigateTo(page) {
  console.log('[LEGACY NAVIGATE]', page);
  try { closeSidebar?.(); } catch {}
  // Hide all pages
  document.querySelectorAll('[id^="page-"]').forEach(p => p.style.display = 'none');
  // Update nav
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const titles = { dashboard: 'Dashboard', subjects: 'Subjects', calculator: 'Calculator', backlog: 'Backlog Subjects', skills: 'Skills Up' };
  const icons = { dashboard: '🏠', subjects: '📖', calculator: '🧮', backlog: '⚠️', skills: '⚡' };
  document.getElementById(`page-${page}`).style.display = 'block';
  document.getElementById('topbar-title').textContent = titles[page] || page;
  document.getElementById('topbar-breadcrumb').innerHTML = `Home / <span>${titles[page] || page}</span>`;
  // Activate nav
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(ni => {
    if (ni.querySelector('.nav-label')?.textContent.toLowerCase().includes(page.replace('backlog', 'backlog'))) ni.classList.add('active');
  });
  // Page-specific init
  if (page === 'dashboard') updateStudentDashboardMetrics();
  if (page === 'subjects') { buildSemSwitcher(); renderSubjects(); }
  if (page === 'units' && APP.currentSubject) { renderUnits(APP.currentSubject); }
  if (page === 'unit-content' && APP.currentSubject && APP.currentUnit) { renderVideoList(APP.currentSubject.id || APP.currentSubject.rawId || APP.currentSubject, APP.currentUnit); }
  if (page === 'backlog') renderBacklog();
  if (page === 'calculator') renderCalc();
  if (page === 'skills') renderSkillsPage();
}

// ═══════════════════════════════════════════════════
//  SIDEBAR
// ═══════════════════════════════════════════════════
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  const hamburger = document.getElementById('hamburger-btn');
  if (sidebar.classList.contains('open')) {
    sidebar.classList.remove('open');
    backdrop.classList.remove('open');
    hamburger.classList.remove('open');
  } else {
    sidebar.classList.add('open');
    backdrop.classList.add('open');
    hamburger.classList.add('open');
  }
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-backdrop').classList.remove('open');
  document.getElementById('hamburger-btn').classList.remove('open');
}

// ═══════════════════════════════════════════════════
//  SUBJECTS
// ═══════════════════════════════════════════════════
async function renderSubjects(sem) {
  const grid = document.getElementById('subject-grid');
  if (grid) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:3rem;color:var(--text3);"><div style="font-size:3rem;margin-bottom:1rem;">⏳</div><div style="font-weight:700;font-size:1rem;">Loading subjects...</div></div>';
  }

  // ── 1. Wait for Supabase client ─────────────────────────────────────────
  let sc = window.__AIMEASY_SUPABASE__;
  let wc = 0;
  while (!sc && wc < 5000) { await new Promise(r => setTimeout(r, 100)); wc += 100; sc = window.__AIMEASY_SUPABASE__; }
  if (!sc) {
    if (grid) grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:3rem;">⚠️ Connection error. Please refresh.</div>';
    return;
  }

  // ── 2. Wait for authenticated session ──────────────────────────────────
  let session = null;
  let wa = 0;
  while (!session && wa < 8000) {
    try { const { data } = await sc.auth.getSession(); session = data?.session; } catch (e) { }
    if (!session) { await new Promise(r => setTimeout(r, 250)); wa += 250; }
  }
  console.log('[Student] Session', session?.user?.id ?? 'none (anonymous)');

  // ── 3. Load profile from Supabase ──────────────────────────────────────
  let profile = null;
  if (session?.user?.id) {
    try {
      const { data: p } = await sc.from('profiles')
        .select('university_name,regulation_code,branch_name,branch,semester')
        .eq('id', session.user.id)
        .maybeSingle();
      profile = p;
      console.log('[Student] Profile from Supabase', profile);
    } catch (e) { console.warn('[Student] Profile load failed', e); }
  }

  // ── 4. Resolve filter values ─────────────────────────────────────────────
  const appUser = APP.user || {};
  const university_name = profile?.university_name || appUser.university_name || appUser.university || null;
  const branch = profile?.branch_name || profile?.branch || appUser.branch || appUser.branch_name || null;
  const regulation_code = profile?.regulation_code || appUser.regulation_code || appUser.regulation || null;

  // ── 5. Semester: dropdown takes priority over profile ───────────────────
  const semester = sem
    || document.getElementById('sem-switcher')?.value
    || appUser.semester
    || profile?.semester
    || '1-1';

  console.log('[Student] Subject filters', { university_name, branch, regulation_code, semester });

  // ── 6. Wait for aimeasyFetchSubjects ────────────────────────────────────
  let wf = 0;
  while (!window.aimeasyFetchSubjects && wf < 3000) { await new Promise(r => setTimeout(r, 100)); wf += 100; }

  // ── 7. Fetch subjects ────────────────────────────────────────────────────
  let dbSubjects = [];
  if (window.aimeasyFetchSubjects) {
    const filters = { semester, university_name, branch, regulation_code };
    const { data, error } = await window.aimeasyFetchSubjects(filters);
    if (!error && data) dbSubjects = data;
    else if (error) console.error('[Student] fetchSubjects error', error);
  } else {
    // Direct fallback
    console.warn('[Student] Falling back to direct Supabase query');
    try {
      let q = sc.from('subjects').select('*').order('name', { ascending: true });
      if (semester) q = q.eq('semester', semester);
      if (branch) q = q.eq('branch', branch);
      if (regulation_code) q = q.eq('regulation_code', regulation_code);
      if (university_name) q = q.eq('university_name', university_name);
      const { data, error } = await q;
      if (!error && data) dbSubjects = data;
      else if (error) console.error('[Student] Direct query error', error);
    } catch (e) { console.error('[Student] Direct query failed', e); }
  }
  console.log('[Student] Subjects returned', dbSubjects.length);

  // ── 8. Render ────────────────────────────────────────────────────────────
  if (!grid) return;
  const colorOptions = ['teal', 'lavender', 'blue', 'green', 'amber'];
  const iconOptions = ['📖', '🔬', '💡', '🖥️', '⚡', '🧮', '🔧', '📡'];
  const colorMap = { teal: 'var(--teal-light)', lavender: 'var(--lavender-light)', blue: 'var(--primary-light)', green: 'var(--green-light)', amber: 'var(--amber-light)' };
  const textMap = { teal: 'var(--teal)', lavender: 'var(--lavender)', blue: 'var(--primary)', green: 'var(--green)', amber: 'var(--amber)' };

  const meta = document.getElementById('subjects-meta');
  if (meta) meta.textContent = `Sem ${semester} · ${branch || 'Branch'} · ${university_name || 'University'} ${regulation_code || ''}`;

  if (!dbSubjects.length) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:3rem;color:var(--text3);"><div style="font-size:3rem;margin-bottom:1rem;">📚</div><div style="font-weight:700;font-size:1rem;margin-bottom:4px;">No subjects available yet</div><div style="font-size:0.83rem;">Sub Admin hasn't published subjects for Sem ${semester} yet.</div></div>`;
    return;
  }

  grid.innerHTML = dbSubjects.map((s, i) => {
    const subj = { id: 'custom_' + s.id, rawId: s.id, name: s.name, code: s.code || '', credits: parseInt(s.credits) || 3, units: 5, color: colorOptions[i % colorOptions.length], icon: iconOptions[i % iconOptions.length] };
    const progress = getSubjectProgress(subj);
    const bg = colorMap[subj.color] || colorMap.blue;
    const tx = textMap[subj.color] || textMap.blue;
    return `<div class="subject-card" onclick="openSubject('${subj.id}')" style="animation-delay:${i * 0.06}s">
      <div class="subject-card-header" style="background:linear-gradient(135deg,${bg},rgba(255,255,255,0.5));">
        <span style="position:absolute;top:8px;right:8px;font-size:0.65rem;background:var(--teal);color:#fff;padding:2px 7px;border-radius:50px;font-weight:700;">NEW</span>
        <div class="subject-icon">${subj.icon}</div>
        <div class="subject-name">${subj.name}</div>
        <div class="subject-code">${subj.code} · ${subj.credits} Credits</div>
      </div>
      <div class="subject-card-body">
        <div class="subject-meta">
          <span class="badge" style="background:${bg};color:${tx}">${subj.units} Units</span>
          <span class="badge badge-primary">${subj.credits} Cr</span>
        </div>
        <div class="subject-progress-row">
          <span class="subject-progress-label">Progress</span>
          <span class="subject-progress-val" style="color:${tx}">${progress}%</span>
        </div>
        <div class="progress-bar"><div class="progress-fill" style="width:${progress}%;background:linear-gradient(90deg,${tx},${bg});"></div></div>
      </div>
    </div>`;
  }).join('');
}

function switchSemester(val) {


  // UPDATE: rebuild the sem switcher to preserve selection, then render subjects
  buildSemSwitcher(val);
  renderSubjects(val);
  showToast(`Switched to Semester ${val}`, 'blue');
}

// UPDATE buildSemSwitcher: accept optional override for currently selected value
function buildSemSwitcher(selectedOverride) {
  const user = APP.user || {};
  // Subject dashboard always shows ALL 8 semesters regardless of user's year
  const allSems = ['1-1', '1-2', '2-1', '2-2', '3-1', '3-2', '4-1', '4-2'];
  const sw = document.getElementById('sem-switcher');
  if (!sw) return;
  const cur = selectedOverride || user.semester || '3-1';
  sw.innerHTML = allSems.map(s => `<option value="${s}" ${s === cur ? 'selected' : ''}>${s}</option>`).join('');
}

async function openSubject(id) {
  const sem = document.getElementById('sem-switcher')?.value || APP.user?.semester || '3-1';
  const builtinSubjects = SUBJECTS_DB[sem] || SUBJECTS_DB['3-1'];
  let subj = builtinSubjects.find(s => s.id === id);

  // Also search custom subjects created by sub admin
  if (!subj && id.startsWith('custom_')) {
    const rawId = id.replace('custom_', '');
    let dbSubjects = [];
    if (window.aimeasyFetchSubjects) {
      const filters = {
        semester: sem,
        university_name: APP.user?.university || 'JNTUK',
        branch: APP.user?.branch,
        regulation_code: APP.user?.regulation || 'R23'
      };
      const { data, error } = await window.aimeasyFetchSubjects(filters);
      if (!error && data) dbSubjects = data;
    }

    const cs = dbSubjects.find(s => String(s.id) === rawId);
    if (cs) {
      const colorOptions = ['teal', 'lavender', 'blue', 'green', 'amber'];
      // Try fetching units to get unit count
      let unitCount = 5;
      if (window.aimeasyFetchUnits) {
        const { data: units } = await window.aimeasyFetchUnits(cs.id);
        if (units) unitCount = units.length;
      }

      subj = {
        id: id, rawId: cs.id, name: cs.name, code: cs.code,
        credits: parseInt(cs.credits) || 3, units: unitCount || 5, progress: 0,
        color: colorOptions[0], icon: '\u{1F4D6}', isCustom: true,
        sem: cs.semester, uni: cs.university_name, reg: cs.regulation_code, branch: cs.branch
      };
    }
  }
  if (!subj) return;
  APP.currentSubject = subj;
  window.aiiensTrackRecentSubject?.(subj);
  addToRecentlyOpened(subj.name, subj.code, subj.icon, subj.id);
  recordStudyActivity('subject_opened', { subjectId: subj.id, subjectName: subj.name });
  navigateTo('units');
  const subjNameEl = document.getElementById('units-subject-name');
  if (subjNameEl) subjNameEl.textContent = `${subj.icon} ${subj.name}`;
  const topTitleEl = document.getElementById('topbar-title');
  if (topTitleEl) topTitleEl.textContent = subj.name;
  const breadEl = document.getElementById('topbar-breadcrumb');
  if (breadEl) breadEl.innerHTML = `Subjects / <span>${subj.name}</span>`;

  const tagsEl = document.getElementById('units-tags');
  if (tagsEl) {
    const progress = getSubjectProgress(subj);
    tagsEl.innerHTML = `<span class="badge badge-primary">${subj.code}</span><span class="badge badge-teal">${subj.credits} Credits</span><span class="badge badge-lavender">${progress}% Complete</span>`;
  }

  await renderUnits(subj);
}

// ═══════════════════════════════════════════════════
//  UNITS
// ═══════════════════════════════════════════════════
async function renderUnits(subj) {
  const grid = document.getElementById('units-grid');
  if (!grid) return;
  grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:3rem;color:var(--text3);"><div style="font-size:3rem;margin-bottom:1rem;">⏳</div><div style="font-weight:700;font-size:1rem;">Loading units...</div></div>';

  let units = [];
  const rawSubjectId = subj.rawId || subj.id.toString().replace('custom_', '');

  if (window.aimeasyFetchUnits) {
    const { data, error } = await window.aimeasyFetchUnits(rawSubjectId);
    if (!error && data) {
      units = data;
    }
  }

  if (!units.length) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:3rem;color:var(--text3);"><div style="font-size:2.5rem;margin-bottom:0.8rem;">\u{1F4CB}</div><div style="font-weight:700;">No units defined yet</div><div style="font-size:0.82rem;margin-top:4px;">The Sub Admin has not created units for this subject yet.</div></div>';
    return;
  }

  const branch = subj.branch || APP.user?.branch || APP.user?.branch_name || '';
  // Legacy completed topics cache removed – fetching from Supabase directly

  grid.innerHTML = units.map((u, i) => {
    // In Supabase architecture, we don't fetch all nested counts synchronously to keep the list fast
    // These will be detailed inside the unit content view
    const topicCount = 0;
    const vidCount = 0;
    const noteCount = 0;
    const completedCount = 0;
    const pct = 0;
    const firstTopic = 'Click to view content';
    const contentTotal = 'View';

    // Fallbacks for the unit UI structure
    const sortOrder = u.sort_order || (i + 1);
    const title = window.aimeasyUnitLabel ? window.aimeasyUnitLabel(u, sortOrder) : `Unit - ${sortOrder}`;

    return '<div class="unit-card" onclick="openUnit(' + sortOrder + ',\'' + subj.id + '\')" style="animation-delay:' + (i * 0.07) + 's">'
      + '<div class="unit-num">' + sortOrder + '</div>'
      + '<div class="unit-name">' + title + '</div>'
      + '<div class="unit-topics">' + firstTopic + '</div>'
      + '<div style="display:flex;gap:6px;justify-content:center;margin-bottom:10px;flex-wrap:wrap;">'
      + '<span class="badge badge-primary">View Content</span>'
      + '</div>'
      + '<div class="unit-progress-wrap">'
      + '<div style="display:flex;justify-content:space-between;margin-bottom:4px;">'
      + '<span style="font-size:0.72rem;color:var(--text3);">Content</span>'
      + '<span style="font-size:0.72rem;font-weight:700;color:var(--primary);">' + contentTotal + '</span>'
      + '</div>'
      + '<div class="progress-bar"><div class="progress-fill" style="width:' + pct + '%"></div></div>'
      + '</div></div>';
  }).join('');
}

// ═══════════════════════════════════════════════════
//  UNIT CONTENT
// ═══════════════════════════════════════════════════
function openUnit(unitNum, subjectId) {
  APP.currentUnit = unitNum;
  recordStudyActivity('unit_opened', {
    subjectId: subjectId || APP.currentSubject?.id || '',
    subjectName: APP.currentSubject?.name || '',
    unitId: unitNum
  });
  navigateTo('unit-content');
  const pg = document.getElementById('page-unit-content');
  const subj = APP.currentSubject;
  const subjectName = subj?.name || 'Subject';

  document.querySelectorAll('.tab-pane').forEach(p => {
    p.classList.remove('active');
    p.style.display = 'none';
  });

  document.getElementById('unit-content-title').textContent = `${subj?.icon || '📚'} Unit ${unitNum} — ${subjectName}`;
  document.getElementById('unit-content-sub').textContent = `Explore Roadmap, Notes, and PYQs`;
  document.getElementById('topbar-title').textContent = `Unit ${unitNum}`;
  document.getElementById('topbar-breadcrumb').innerHTML = `${subjectName} / <span>Unit ${unitNum}</span>`;
  {
    const displayUnit = window.aimeasyUnitLabel ? window.aimeasyUnitLabel(unitNum) : `Unit - ${unitNum}`;
    document.getElementById('unit-content-title').textContent = `${subj?.icon || ''} ${displayUnit} - ${subjectName}`.trim();
    document.getElementById('topbar-title').textContent = displayUnit;
    document.getElementById('topbar-breadcrumb').innerHTML = `${subjectName} / <span>${displayUnit}</span>`;
  }

  switchTab('videos');
  setTimeout(restoreRoadmapSidebarState, 10);

  renderVideoList(subjectId || subj?.id || 'default', unitNum);
  renderNotes(subjectId || subj?.id, unitNum);
  renderPYQ(null, subjectId || subj?.id, unitNum);
  renderIQ(subjectId || subj?.id, unitNum);
  setTimeout(renderPendingUrls, 80);
}

function switchTab(tab) {
  // UPDATE: Fix tab switching — deactivate all panes and buttons first
  document.querySelectorAll('.content-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-pane').forEach(p => {
    p.classList.remove('active');
    p.style.display = 'none';
  });
  // Activate the selected tab pane
  const pane = document.getElementById('tab-' + tab);
  if (pane) {
    pane.classList.add('active');
    pane.style.display = 'block';
  }
  // Activate the selected tab button
  const btn = document.getElementById('tab-btn-' + tab);
  if (btn) btn.classList.add('active');
  APP.currentTab = tab;
}

function backToUnits() {
  document.querySelectorAll('[id^="page-"]').forEach(p => p.style.display = 'none');
  document.getElementById('page-units').style.display = 'block';
  document.getElementById('topbar-title').textContent = APP.currentSubject?.name || 'Subject';
  document.getElementById('topbar-breadcrumb').innerHTML = `Subjects / <span>${APP.currentSubject?.name || ''}</span>`;
}

// ═══════════════════════════════════════════════════
//  VIDEOS
// ═══════════════════════════════════════════════════
// ═══════════════════════════════════════════════════
//  VIDEOS — Dynamic rendering from database
// ═══════════════════════════════════════════════════
async function renderVideoList(subjectId, unitNum) {
  // Database is the source of truth for sub-admin roadmap topics.
  let roadmapTopics = null;
  if (subjectId) {
    const rawId = String(subjectId).startsWith('custom_') ? String(subjectId).replace('custom_', '') : subjectId;
    const dbSubject = APP.currentSubject;
    if (window.aimeasyFetchUnitRoadmap && dbSubject) {
      const { data, error } = await window.aimeasyFetchUnitRoadmap({
        subject: dbSubject,
        unit: { id: unitNum, name: `Unit ${unitNum}`, dbUnitId: dbSubject?.dbUnitIds?.[unitNum] },
      });
      if (error) {
        console.warn('[ROADMAP] Student Load Failed', error);
        console.warn('[STUDENT] Roadmap Failed', error);
        showToast?.('Roadmap load failed: ' + (error.message || JSON.stringify(error)), 'red');
      } else {
        console.log('[ROADMAP] Student Load Success', {
          subjectId: data?.subjectId,
          unitId: data?.unitId,
          topicCount: data?.topics?.length || 0,
        });
        console.log('[STUDENT] Roadmap Loaded', {
          subjectId: data?.subjectId,
          unitId: data?.unitId,
          topicCount: data?.topics?.length || 0,
        });
        roadmapTopics = data?.topics || [];
      }
    }
  }

  // Student roadmap must come only from Supabase records created by SubAdmin.
  const topics = Array.isArray(roadmapTopics) ? roadmapTopics : [];
  console.log('Topics:', topics);
  const list = document.getElementById('video-list');
  APP.currentVideoIndex = 0;

  // Remove duplicate topics (case-insensitive comparison)
  const uniqueTopics = [];
  const seenTopics = new Set();
  topics.forEach(t => {
    const title = typeof t === 'string' ? t : (t.topicName || t.name || '').toString();
    const normalized = title.toLowerCase().trim();
    if (!seenTopics.has(normalized)) {
      seenTopics.add(normalized);
      uniqueTopics.push(t);
    }
  });

  // Roadmap only renders topic items; videos are a property on the topic.
  const builtinItems = uniqueTopics.map((t, i) => {
    const title = typeof t === 'string' ? t : (t.topicName || t.name || 'Untitled');
    const videos = typeof t === 'string'
      ? []
      : Array.isArray(t.videos)
        ? t.videos.map(video => ({
          url: (video.url || video.youtubeUrl || '').trim(),
          description: video.description || video.title || '',
        })).filter(video => video.url || video.description)
        : [];
    const urls = videos.length
      ? videos.map(video => video.url).filter(Boolean)
      : typeof t === 'string'
        ? []
        : Array.isArray(t.youtubeUrls)
          ? t.youtubeUrls.filter(Boolean)
          : [(t.youtubeUrl || t.url || '').trim()].filter(Boolean);
    const url = urls[0] || null;
    const extraUrls = urls.slice(1);
    return { type: 'builtin', title, url, urls, videos, extraUrls, description: videos[0]?.description || '', index: i, topicIndex: i };
  });

  APP._videoItems = builtinItems;

  list.innerHTML = APP._videoItems.map((item, i) => {
    const isCompleted = item.type === 'builtin' && APP.markedReviews.has(`${subjectId}-${unitNum}-${i}`) ? false : item.type === 'builtin' && i < 2;
    const dur = 'Video';
    const badge = item.type === 'admin' ? ' <span style="font-size:0.65rem;background:var(--teal);color:#fff;padding:1px 5px;border-radius:50px;">▶ VIDEO</span>' :
      item.type === 'approved' ? ' <span style="font-size:0.65rem;background:var(--primary);color:#fff;padding:1px 5px;border-radius:50px;">LINK</span>' : '';
    const extraLinks = item.extraUrls?.length ? `<div class="video-item-extras">${item.extraUrls.map((u, j) => `<button class="video-extra-btn" onclick="event.stopPropagation(); selectTopicUrl(${i},${j + 1})">Video ${j + 2}</button>`).join('')}</div>` : '';
    const videoTree = item.videos?.length ? `<div class="roadmap-video-tree">${item.videos.map((video, vi) => video.description ? `<div class="roadmap-video-child">${vi === item.videos.length - 1 ? '└──' : '├──'} ${video.description}</div>` : '').join('')}</div>` : '';
    return `<div class="video-item ${isCompleted ? 'completed' : ''} ${i === 0 ? 'active' : ''}" id="vi-${i}" onclick="selectVideo(${i},'${item.title.replace(/'/g, '&#39;')}')">
      <div class="video-connector"></div>
      <div class="video-item-dot">${isCompleted ? '✓' : i + 1}</div>
      <div class="video-item-info">
        <div class="video-item-title">${item.title}${badge}</div>
        ${videoTree}
        <div class="video-item-dur">${item.url ? '▶ Embedded Video' : 'No video URL yet'}</div>
        ${extraLinks}
      </div>
    </div>`;
  }).join('');

  list.querySelectorAll('.video-item-dur').forEach(el => el.remove());

  // Select first item
  if (APP._videoItems.length > 0) {
    selectVideoItem(0);
  } else {
    // Show no content message
    const wrapper = document.getElementById('video-embed-wrapper') || document.querySelector('.video-embed-wrapper');
    if (wrapper) {
      wrapper.innerHTML = `
        <div class="video-placeholder">
          <div style="font-size:3.5rem;margin-bottom:4px;">🎬</div>
          <div style="opacity:0.75;font-size:0.95rem;color:#fff;">No roadmap available yet</div>
          <div style="font-size:0.8rem;opacity:0.6;margin-top:1rem;">SubAdmin has not saved roadmap videos for this unit</div>
        </div>`;
    }
    document.getElementById('video-topic-desc').textContent = 'No roadmap records are saved for this subject and unit yet.';
  }
}

function convertYouTubeToEmbed(url) {
  if (!url) return null;
  const videoIdMatch = String(url).match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?(?:.*&)?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([^&?\/\s]+)/);
  const videoId = videoIdMatch ? videoIdMatch[1] : null;
  console.log('[VIDEO] URL Parsed', { url, videoId });
  return videoId;
}

function studentVideoResumeKey(item, idx) {
  const sid = APP.currentSubject?.id || 'default';
  const uid = APP.currentUnit || 1;
  return `student-video:${sid}:${uid}:${idx}:${item?.url || ''}`;
}

function studentVideoStartSeconds(item, idx) {
  const key = studentVideoResumeKey(item, idx);
  return Math.max(0, Math.floor(Number(sessionStorage.getItem(key) || 0)));
}

function storeStudentVideoPosition(item, idx, seconds) {
  if (!item?.url || !Number.isFinite(seconds)) return;
  sessionStorage.setItem(studentVideoResumeKey(item, idx), String(Math.max(0, Math.floor(seconds))));
}

function ensureYouTubeIframeApi(callback) {
  if (window.YT?.Player) {
    callback();
    return;
  }
  const pending = window.__aimeasyYouTubeReadyCallbacks || [];
  pending.push(callback);
  window.__aimeasyYouTubeReadyCallbacks = pending;
  if (!document.getElementById('youtube-iframe-api')) {
    const script = document.createElement('script');
    script.id = 'youtube-iframe-api';
    script.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(script);
  }
  const previousReady = window.onYouTubeIframeAPIReady;
  window.onYouTubeIframeAPIReady = function onYouTubeIframeAPIReady() {
    if (typeof previousReady === 'function') previousReady();
    const callbacks = window.__aimeasyYouTubeReadyCallbacks || [];
    window.__aimeasyYouTubeReadyCallbacks = [];
    callbacks.forEach(fn => fn());
  };
}

function renderStudentYouTubeVideo(wrapper, item, idx, videoId, title) {
  const startSeconds = studentVideoStartSeconds(item, idx);
  wrapper.innerHTML = '<div id="student-video-player" style="width:100%;height:100%;border-radius:var(--radius-lg);overflow:hidden;"></div>';
  console.log('[VIDEO] Embed Created', { videoId, title, startSeconds });
  window.aimeasyStudentVideoPlayer = null;
  ensureYouTubeIframeApi(() => {
    const host = document.getElementById('student-video-player');
    if (!host) return;
    window.aimeasyStudentVideoPlayer = new YT.Player('student-video-player', {
      width: '100%',
      height: '100%',
      videoId,
      playerVars: {
        autoplay: 1,
        start: startSeconds,
        rel: 0,
      },
      events: {
        onReady(event) {
          if (startSeconds > 0) event.target.seekTo(startSeconds, true);
          event.target.playVideo();
          console.log('[VIDEO] Player Loaded', { videoId, title });
          console.log('[STUDENT] Video Loaded', { videoId, title });
        },
        onStateChange(event) {
          const player = event.target;
          if (player?.getCurrentTime) {
            storeStudentVideoPosition(item, idx, player.getCurrentTime());
          }
        }
      }
    });
  });
  const fallbackSrc = `https://www.youtube.com/embed/${videoId}?autoplay=1&enablejsapi=1&start=${startSeconds}`;
  window.setTimeout(() => {
    const host = document.getElementById('student-video-player');
    if (host && !host.querySelector('iframe') && !window.aimeasyStudentVideoPlayer) {
      host.outerHTML = `<iframe id="student-video-player" width="100%" height="100%" src="${fallbackSrc}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="border-radius:var(--radius-lg);"></iframe>`;
    }
  }, 1200);
}

window.aimeasySaveStudentVideoPosition = function aimeasySaveStudentVideoPosition() {
  const item = APP._videoItems?.[APP.currentVideoIndex];
  const player = window.aimeasyStudentVideoPlayer;
  if (item?.url && player?.getCurrentTime) {
    try {
      storeStudentVideoPosition(item, APP.currentVideoIndex, player.getCurrentTime());
    } catch (e) { }
  }
  try {
    player?.stopVideo?.();
    player?.destroy?.();
  } catch (e) { }
  window.aimeasyStudentVideoPlayer = null;
};

window.aimeasyResumeStudentVideo = function aimeasyResumeStudentVideo() {
  const item = APP._videoItems?.[APP.currentVideoIndex];
  if (item?.url) selectVideoItem(APP.currentVideoIndex);
};

function selectVideoItem(idx) {
  APP.currentVideoIndex = idx;
  document.querySelectorAll('.video-item').forEach((el, i) => el.classList.toggle('active', i === idx));
  const item = APP._videoItems?.[idx];
  console.log('Selected Topic:', item);
  if (!item) return;

  const title = item.title;
  const url = item.url;
  console.log('[VIDEO] URL Loaded', { url, title });

  const nowLabel = document.getElementById('now-playing-label');
  if (nowLabel) nowLabel.textContent = title;
  const topicTitleEl = document.getElementById('video-topic-title');
  if (topicTitleEl) topicTitleEl.textContent = title;
  const mobileTopicTitleEl = document.getElementById('video-mobile-topic-title');
  if (mobileTopicTitleEl) mobileTopicTitleEl.textContent = title;

  const sid = APP.currentSubject?.id || 'os';
  const uid = APP.currentUnit || 1;
  const isReview = APP.markedReviews.has(`${sid}-${uid}-${idx}`);
  const rb = document.getElementById('review-btn');
  if (rb) {
    rb.classList.toggle('marked', isReview);
    rb.textContent = isReview ? '🔖 Marked for Review' : '🔖 Mark for Review';
  }

  const wrapper = document.getElementById('video-embed-wrapper') || document.querySelector('.video-embed-wrapper');
  if (!wrapper) {
    console.error('Element not found: video-embed-wrapper');
    return;
  }
  const descEl = document.getElementById('video-topic-desc');
  const placeholder = wrapper.querySelector('.video-placeholder');

  if (url && (url.includes('youtube.com') || url.includes('youtu.be'))) {
    const videoId = convertYouTubeToEmbed(url);
    if (videoId) {
      renderStudentYouTubeVideo(wrapper, item, idx, videoId, title);
      if (placeholder) placeholder.style.display = 'none';
      if (descEl) descEl.textContent = item.description || `Now watching: ${title}`;
      renderTopicInlineNotes(title, sid, uid, idx);
      return;
    }
  }

  if (url) {
    wrapper.innerHTML = `
      <div class="video-placeholder">
        <div style="font-size:3rem;opacity:0.7;">🔗</div>
        <div style="color:#fff;font-size:0.9rem;opacity:0.9;text-align:center;padding:0 1rem;">${title}</div>
        <button class="play-btn-big" onclick="window.open('${url}','_blank')" style="font-size:1rem;">Open ↗</button>
        <div style="opacity:0.6;font-size:0.8rem;color:#fff;">Opens in new tab</div>
      </div>`;
    if (descEl) descEl.textContent = item.description || `External video: ${title}.`;
    renderTopicInlineNotes(title, sid, uid, idx);
    return;
  }

  wrapper.innerHTML = `
    <div class="video-placeholder">
      <div style="font-size:3.5rem;margin-bottom:4px;">🎬</div>
      <div class="play-btn-big" onclick="playCurrentVideo()">▶</div>
      <div style="opacity:0.75;font-size:0.95rem;color:#fff;margin-top:6px;">${title}</div>
    </div>`;
  if (descEl) descEl.textContent = `This topic covers "${title}" — video coming soon.`;
  renderTopicInlineNotes(title, sid, uid, idx);
}

function selectTopicUrl(topicIndex, urlIndex) {
  const item = APP._videoItems?.[topicIndex];
  if (!item) return;
  const url = item.urls?.[urlIndex];
  if (!url) return;

  APP.currentVideoIndex = topicIndex;
  document.querySelectorAll('.video-item').forEach((el, i) => el.classList.toggle('active', i === topicIndex));
  const title = item.title;
  console.log('[VIDEO] URL Loaded', { url, title });
  const nowLabel = document.getElementById('now-playing-label');
  if (nowLabel) nowLabel.textContent = title;
  const topicTitleEl = document.getElementById('video-topic-title');
  if (topicTitleEl) topicTitleEl.textContent = title;
  const mobileTopicTitleEl = document.getElementById('video-mobile-topic-title');
  if (mobileTopicTitleEl) mobileTopicTitleEl.textContent = title;

  const sid = APP.currentSubject?.id || 'os';
  const uid = APP.currentUnit || 1;
  const isReview = APP.markedReviews.has(`${sid}-${uid}-${topicIndex}`);
  const rb = document.getElementById('review-btn');
  if (rb) {
    rb.classList.toggle('marked', isReview);
    rb.textContent = isReview ? '🔖 Marked for Review' : '🔖 Mark for Review';
  }

  const wrapper = document.getElementById('video-embed-wrapper') || document.querySelector('.video-embed-wrapper');
  if (!wrapper) {
    console.error('Element not found: video-embed-wrapper');
    return;
  }
  const descEl = document.getElementById('video-topic-desc');

  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    const videoId = convertYouTubeToEmbed(url);
    if (videoId) {
      renderStudentYouTubeVideo(wrapper, item, topicIndex, videoId, title);
      if (descEl) descEl.textContent = item.videos?.[urlIndex]?.description || `Now watching: ${title}`;
      renderTopicInlineNotes(title, sid, uid, topicIndex);
      return;
    }
  }

  wrapper.innerHTML = `
      <div class="video-placeholder">
        <div style="font-size:3rem;opacity:0.7;">🔗</div>
        <div style="color:#fff;font-size:0.9rem;opacity:0.9;text-align:center;padding:0 1rem;">${title}</div>
        <button class="play-btn-big" onclick="window.open('${url}','_blank')" style="font-size:1rem;">Open ↗</button>
        <div style="opacity:0.6;font-size:0.8rem;color:#fff;">Opens in new tab</div>
      </div>`;
  if (descEl) descEl.textContent = item.videos?.[urlIndex]?.description || `External video: ${title}.`;
  renderTopicInlineNotes(title, sid, uid, topicIndex);
}

// ── Inline topic notes: shows notes for the selected roadmap topic ──
async function renderTopicInlineNotes(topicTitle, subjectId, unitNum, topicIdx) {
  const el = document.getElementById('topic-inline-notes');
  if (!el) return;

  const subject = APP.currentSubject;
  const unitId = unitNum || APP.currentUnit || 1;
  let topicData = null;
  let topicNotes = [];

  if (window.aimeasyFetchUnitRoadmap && window.aimeasyListContent && subject) {
    const ctx = await window.aimeasyFetchUnitRoadmap({
      subject,
      unit: { id: unitId, name: `Unit ${unitId}`, dbUnitId: subject?.dbUnitIds?.[unitId] },
    });
    if (ctx?.data?.subjectId && ctx?.data?.unitId) {
      topicData = (ctx.data.topics || [])[topicIdx] || null;
      const { data } = await window.aimeasyListContent({ subjectId: ctx.data.subjectId, unitId: ctx.data.unitId, contentType: 'note' });
      if (data) {
        topicNotes = data.filter(n => {
          const meta = n.metadata || {};
          return meta.topicIndex === topicIdx || (meta.topicTitle && meta.topicTitle.toLowerCase() === topicTitle.toLowerCase());
        }).map(n => ({
          title: n.title || 'Untitled Note',
          type: n.url?.endsWith('.pdf') ? 'pdf' : (n.url?.endsWith('.doc') || n.url?.endsWith('.docx') ? 'doc' : 'link'),
          link: n.url
        }));
      }
    }
  }

  if (!topicData && !topicNotes.length) {
    el.style.display = 'none';
    return;
  }
  el.style.display = 'block';
  let html = `<div style="font-size:0.78rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--text3);margin-bottom:8px;">📋 Topic Notes</div>`;
  if (topicData?.description) {
    html += `<p style="font-size:0.85rem;color:var(--text2);line-height:1.65;margin-bottom:10px;">${topicData.description}</p>`;
  }
  if (topicData?.keyPoints?.length) {
    html += `<ul style="padding-left:1.2rem;margin-bottom:10px;">` +
      topicData.keyPoints.map(p => `<li style="font-size:0.83rem;color:var(--text2);margin-bottom:4px;">${p}</li>`).join('') +
      `</ul>`;
  }
  topicNotes.forEach(n => {
    html += `<div class="note-row" style="margin-bottom:6px;" onclick="previewNoteInline('${(n.link || '').replace(/'/g, "\\'")}','${n.title.replace(/'/g, "\\'")}')">
      <div class="note-icon">${n.type === 'pdf' ? '📄' : n.type === 'doc' ? '📝' : '🔗'}</div>
      <div class="note-info"><div class="note-title">${n.title}</div><div class="note-desc">Tap to preview</div></div>
      <div class="note-actions"></div>
    </div>`;
  });
  el.innerHTML = html;
}

function selectVideo(idx, title, subjectId, unitNum) {
  // If called from video item click, delegate to selectVideoItem
  selectVideoItem(idx);
}

// ═══════════════════════════════════════════════════
//  ROADMAP SIDEBAR TOGGLE
// ═══════════════════════════════════════════════════
function toggleRoadmapSidebar() {
  const sidebar = document.getElementById('video-sidebar');
  const icon = document.getElementById('sidebar-toggle-icon');
  if (!sidebar) return;
  const isCollapsed = sidebar.classList.toggle('collapsed');
  if (icon) icon.textContent = isCollapsed ? '▶' : '◀';
  try { localStorage.setItem('edusync_roadmap_open', isCollapsed ? '0' : '1'); } catch (e) { }
}

function restoreRoadmapSidebarState() {
  try {
    const open = localStorage.getItem('edusync_roadmap_open');
    if (open === '0') {
      const sidebar = document.getElementById('video-sidebar');
      const icon = document.getElementById('sidebar-toggle-icon');
      if (sidebar) sidebar.classList.add('collapsed');
      if (icon) icon.textContent = '▶';
    }
  } catch (e) { }
}

function prevVideo() {
  const items = document.querySelectorAll('.video-item');
  if (APP.currentVideoIndex > 0) {
    APP.currentVideoIndex--;
    selectVideoItem(APP.currentVideoIndex);
    showToast('← Previous topic', 'blue');
  } else {
    showToast('This is the first topic', 'amber');
  }
}

function nextVideo() {
  const items = document.querySelectorAll('.video-item');
  if (APP.currentVideoIndex < items.length - 1) {
    items[APP.currentVideoIndex].classList.add('completed');
    items[APP.currentVideoIndex].querySelector('.video-item-dot').textContent = '✓';
    APP.currentVideoIndex++;
    selectVideoItem(APP.currentVideoIndex);
    showToast('✅ Progress saved!', 'green');
  } else {
    showToast('🎉 Unit Complete! Amazing work!', 'green');
  }
}

function toggleReview() {
  const sid = APP.currentSubject?.id || 'os';
  const uid = APP.currentUnit || 1;
  const key = `${sid}-${uid}-${APP.currentVideoIndex}`;
  if (APP.markedReviews.has(key)) {
    APP.markedReviews.delete(key);
    document.getElementById('review-btn').classList.remove('marked');
    document.getElementById('review-btn').textContent = '🔖 Mark for Review';
    showToast('Review mark removed', 'amber');
  } else {
    APP.markedReviews.add(key);
    document.getElementById('review-btn').classList.add('marked');
    document.getElementById('review-btn').textContent = '🔖 Marked for Review';
    showToast('📌 Added to weak area review!', 'amber');
  }
}

function playCurrentVideo() {
  const item = APP._videoItems?.[APP.currentVideoIndex];
  if (item?.url) {
    openApprovedVideo(item.url);
  } else {
    showToast('▶ This topic has no video URL yet. Sub admin can add one!', 'blue');
  }
}

toggleReview = function toggleReviewPersistedTopicState() {
  const sid = APP.currentSubject?.id || 'os';
  const uid = APP.currentUnit || 1;
  hydrateMarkedReviews();
  const item = APP._videoItems?.[APP.currentVideoIndex];
  const topicIndex = item?.topicIndex ?? APP.currentVideoIndex;
  const key = topicReviewKey(sid, uid, topicIndex);
  const btn = document.getElementById('review-btn');
  if (APP.markedReviews.has(key)) {
    APP.markedReviews.delete(key);
    btn?.classList.remove('marked');
    if (btn) btn.textContent = 'Mark for Review';
    persistMarkedReviews();
    syncRoadmapNodeStates();
    syncTopicProgressToDb({ subjectId: sid, unitId: uid, topicIndex, topicId: item?.id || item?.topicId || null, status: 'current' });
    showToast('Review mark removed', 'amber');
    return;
  }
  APP.markedReviews.add(key);
  btn?.classList.add('marked');
  if (btn) btn.textContent = 'Marked for Review';
  persistMarkedReviews();
  syncRoadmapNodeStates();
  syncTopicProgressToDb({ subjectId: sid, unitId: uid, topicIndex, topicId: item?.id || item?.topicId || null, status: 'review' });
  showToast('Added to review', 'amber');
};
window.toggleReview = toggleReview;

function playVideo() { playCurrentVideo(); }

// ═══════════════════════════════════════════════════
//  NOTES — only admin-uploaded (no static data)
// ═══════════════════════════════════════════════════
async function loadStudentUnitContentFromDb(subjectId, unitNum) {
  // Deprecated: No longer merging content into local storage.
  // Each render function (renderNotes, renderPYQ, renderIQ) fetches its own data directly from Supabase.
}

async function renderNotes(subjectId, unitNum) {
  const listEl = document.getElementById('notes-list');
  if (!listEl) return;
  listEl.innerHTML = '<div style="text-align:center;padding:3rem;color:var(--text3);"><div style="font-size:3rem;margin-bottom:1rem;">⏳</div><div style="font-weight:600;">Loading notes...</div></div>';

  const subject = APP.currentSubject;
  const unitId = unitNum || APP.currentUnit || 1;
  let customNotes = [];

  if (window.aimeasyFetchUnitRoadmap && window.aimeasyListContent && subject) {
    const ctx = await window.aimeasyFetchUnitRoadmap({
      subject,
      unit: { id: unitId, name: `Unit ${unitId}`, dbUnitId: subject?.dbUnitIds?.[unitId] },
    });
    if (ctx?.data?.subjectId && ctx?.data?.unitId) {
      const { data } = await window.aimeasyListContent({ subjectId: ctx.data.subjectId, unitId: ctx.data.unitId, contentType: 'note' });
      if (data) {
        customNotes = data.map(n => ({
          title: n.title || 'Untitled Note',
          type: n.url?.endsWith('.pdf') ? 'pdf' : (n.url?.endsWith('.doc') || n.url?.endsWith('.docx') ? 'doc' : 'link'),
          link: n.url,
          uploadedAt: n.created_at ? new Date(n.created_at).toLocaleDateString() : 'Recently'
        }));
      }
    }
  }

  listEl.innerHTML = customNotes.length ? customNotes.map(n => `
    <div class="note-row">
      <div class="note-icon">${n.type === 'pdf' ? '📄' : n.type === 'doc' ? '📝' : '🔗'}</div>
      <div class="note-info">
        <div class="note-title">${n.title}</div>
        <div class="note-desc">Uploaded ${n.uploadedAt}</div>
      </div>
      <div class="note-actions">
        ${n.link ? `
          <button class="btn btn-ghost btn-sm" onclick="previewNoteInline('${n.link.replace(/'/g, "\\'")}','${n.title.replace(/'/g, "\\'")}')">👁️ Preview</button>
        ` : `
          <button class="btn btn-ghost btn-sm" onclick="showToast('📄 No file linked','amber')">Preview</button>
        `}
      </div>
    </div>`).join('') :
    `<div style="text-align:center;padding:3rem;color:var(--text3);">
      <div style="font-size:3rem;margin-bottom:1rem;">📄</div>
      <div style="font-weight:600;">No content available yet</div>
      <div style="font-size:0.82rem;margin-top:4px;">Creator will upload notes for this unit</div>
    </div>`;
}

// ═══════════════════════════════════════════════════
//  NOTE PREVIEW - opens inside AIIENS Edu (no redirect)
// ═══════════════════════════════════════════════════
function previewNoteInline(link, title) {
  if (!link) { showToast('No preview available for this note', 'amber'); return; }
  const modal = document.getElementById('note-preview-modal');
  const bodyEl = document.getElementById('note-preview-body');
  const titleEl = document.getElementById('note-preview-title');
  const dlBtn = document.getElementById('note-download-btn');
  titleEl.textContent = title || 'Note Preview';
  dlBtn.onclick = function () { downloadNote(link, title); };
  // Determine embed strategy
  let embedHTML = '';
  if (link.includes('drive.google.com')) {
    // Convert Google Drive share links to embed format
    const fileIdMatch = link.match(/\/d\/([a-zA-Z0-9_-]+)/);
    const embedUrl = fileIdMatch
      ? `https://drive.google.com/file/d/${fileIdMatch[1]}/preview`
      : link.replace('/view', '/preview').replace('?usp=sharing', '');
    embedHTML = `<iframe src="${embedUrl}" allow="autoplay"></iframe>`;
  } else if (link.endsWith('.pdf') || link.includes('pdf')) {
    embedHTML = `<iframe src="${link}#toolbar=1&navpanes=0"></iframe>`;
  } else {
    embedHTML = `<iframe src="${link}"></iframe>`;
  }
  bodyEl.innerHTML = embedHTML;
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function downloadNote(link, title) {
  if (!link) { showToast('No download available', 'amber'); return; }
  // For Google Drive links convert to direct download
  const fileIdMatch = link.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (fileIdMatch) {
    const dlUrl = `https://drive.google.com/uc?export=download&id=${fileIdMatch[1]}`;
    const a = document.createElement('a');
    a.href = dlUrl;
    a.download = title || 'note';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } else {
    window.open(link, '_blank');
  }
  showToast('📥 Downloading...', 'green');
}

function closeNotePreview() {
  const modal = document.getElementById('note-preview-modal');
  modal.classList.remove('open');
  document.body.style.overflow = '';
  // Clear iframe to stop any media
  document.getElementById('note-preview-body').innerHTML = '';
}

document.addEventListener('click', function (e) {
  const npmEl = document.getElementById('note-preview-modal');
  if (npmEl && e.target === npmEl) closeNotePreview();
});

document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape' && document.getElementById('note-preview-modal')?.classList.contains('open')) {
    closeNotePreview();
  }
});


async function renderPYQ(filterYear, subjectId, unitNum) {
  const listEl = document.getElementById('pyq-list');
  if (!listEl) return;
  listEl.innerHTML = '<div style="text-align:center;padding:3rem;color:var(--text3);"><div style="font-size:3rem;margin-bottom:1rem;">⏳</div><div style="font-weight:600;">Loading questions...</div></div>';

  const subjectName = APP.currentSubject?.name || '';
  const uNum = unitNum || APP.currentUnit || 1;
  const subject = APP.currentSubject;
  let customPYQs = [];

  if (window.aimeasyFetchUnitRoadmap && window.aimeasyListContent && subject) {
    const ctx = await window.aimeasyFetchUnitRoadmap({
      subject,
      unit: { id: uNum, name: `Unit ${uNum}`, dbUnitId: subject?.dbUnitIds?.[uNum] },
    });
    if (ctx?.data?.subjectId && ctx?.data?.unitId) {
      const { data } = await window.aimeasyListContent({ subjectId: ctx.data.subjectId, unitId: ctx.data.unitId, contentType: 'pyq' });
      if (data) {
        customPYQs = data.map(p => {
          const meta = p.metadata || {};
          return {
            q: p.title || p.body || 'Untitled Question',
            year: String(meta.year || '2024'),
            count: parseInt(meta.count) || 1,
            ans: meta.answer || p.body || 'Answer not provided.',
            isAdmin: true
          };
        });
      }
    }
  }

  // Build year filter dynamically
  const years = [...new Set(customPYQs.map(p => p.year))].sort((a, b) => b - a);
  const filtersEl = document.getElementById('pyq-filters');
  if (filtersEl) {
    filtersEl.innerHTML = years.length > 0 ?
      `<div class="pyq-filter ${!filterYear || filterYear === 'all' ? 'active' : ''}" onclick="filterPYQ(this,'all')">All Years</div>` +
      years.map(y => `<div class="pyq-filter ${filterYear === y ? 'active' : ''}" onclick="filterPYQ(this,'${y}')">${y}</div>`).join('') :
      '';
  }

  const data = filterYear && filterYear !== 'all' ? customPYQs.filter(p => p.year === filterYear) : customPYQs;

  listEl.innerHTML = data.length ? data.map((p, i) => `
    <div class="pyq-item" id="pyq-${i}">
      <div class="pyq-header" onclick="togglePYQ(${i})">
        <div class="pyq-q">Q${i + 1}. ${p.q}</div>
        <div class="pyq-meta">
          <span class="pyq-year">📅 ${p.year}</span>
          <span class="pyq-count">× ${p.count} times</span>
        </div>
      </div>
      <div class="pyq-answer">${p.ans}</div>
    </div>`).join('') :
    `<div style="text-align:center;padding:3rem;color:var(--text3);">
      <div style="font-size:3rem;margin-bottom:1rem;">📝</div>
      <div style="font-weight:600;">No content available yet</div>
      <div style="font-size:0.82rem;margin-top:4px;">Creator will upload questions for this unit</div>
    </div>`;
}

function togglePYQ(i) {
  document.getElementById('pyq-' + i)?.classList.toggle('expanded');
}

function filterPYQ(el, year) {
  document.querySelectorAll('.pyq-filter').forEach(f => f.classList.remove('active'));
  el.classList.add('active');
  renderPYQ(year);
}

// ═══════════════════════════════════════════════════
//  IMPORTANT QUESTIONS — only admin-uploaded (no static data)
// ═══════════════════════════════════════════════════
async function renderIQ(subjectId, unitNum) {
  const listEl = document.getElementById('iq-list');
  if (!listEl) return;
  listEl.innerHTML = '<div style="text-align:center;padding:3rem;color:var(--text3);"><div style="font-size:3rem;margin-bottom:1rem;">⏳</div><div style="font-weight:600;">Loading questions...</div></div>';

  const subjectName = APP.currentSubject?.name || '';
  const uNum = unitNum || APP.currentUnit || 1;
  const subject = APP.currentSubject;
  let customIQs = [];

  if (window.aimeasyFetchUnitRoadmap && window.aimeasyListContent && subject) {
    const ctx = await window.aimeasyFetchUnitRoadmap({
      subject,
      unit: { id: uNum, name: `Unit ${uNum}`, dbUnitId: subject?.dbUnitIds?.[uNum] },
    });
    if (ctx?.data?.subjectId && ctx?.data?.unitId) {
      const { data } = await window.aimeasyListContent({ subjectId: ctx.data.subjectId, unitId: ctx.data.unitId, contentType: 'iq' });
      if (data) {
        customIQs = data.map(q => {
          const meta = q.metadata || {};
          return {
            q: q.title || q.body || 'Untitled Question',
            priority: meta.priority || 'med',
            tags: (meta.tags || '').split(',').map(t => t.trim()).filter(Boolean),
            isAdmin: true
          };
        });
      }
    }
  }

  listEl.innerHTML = customIQs.length ? customIQs.map((q, i) => `
    <div class="iq-item">
      <div class="iq-header">
        <div class="iq-q">Q${i + 1}. ${q.q}</div>
        <div class="iq-actions">
          <button class="btn-icon" onclick="showToast('🔖 Bookmarked!','amber')" title="Bookmark">🔖</button>
          <button class="btn-icon" onclick="showToast('📋 Copied!','blue')" title="Copy">📋</button>
        </div>
      </div>
      <div class="iq-footer">
        <span class="priority-badge priority-${q.priority}">${q.priority === 'high' ? '🔴 High Priority' : q.priority === 'med' ? '🟡 Medium' : '🟢 Low'}</span>
        ${q.tags.map(t => `<span class="tag">${t}</span>`).join('')}
      </div>
    </div>`).join('') :
    `<div style="text-align:center;padding:3rem;color:var(--text3);">
      <div style="font-size:3rem;margin-bottom:1rem;">⭐</div>
      <div style="font-weight:600;">No content available yet</div>
      <div style="font-size:0.82rem;margin-top:4px;">Creator will add questions for this unit</div>
    </div>`;
}

// ═══════════════════════════════════════════════════
//  CALCULATOR
// ═══════════════════════════════════════════════════
const JNTUK_SEMESTERS = ['1-1', '1-2', '2-1', '2-2', '3-1', '3-2', '4-1', '4-2'];
const GRADES = { S: 10, A: 9, B: 8, C: 7, D: 6, E: 5, F: 0, 'No Credits': 0 };

function calcHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function normalizeCalcSemLabel(label) {
  const value = String(label || '').replace(/^Semester\s+/i, '').trim();
  if (JNTUK_SEMESTERS.includes(value)) return value;
  const oldMatch = value.match(/^\d+$/);
  if (oldMatch) return JNTUK_SEMESTERS[Math.max(0, Math.min(JNTUK_SEMESTERS.length - 1, Number(value) - 1))];
  return value || JNTUK_SEMESTERS[0];
}

function makeCalcSemester(semKey) {
  return { id: 'sem-' + semKey, semKey, label: 'Semester ' + semKey, rows: [], sgpa: null, credits: 0 };
}

function normalizeCalcRow(row = {}) {
  const name = row.name || row.subjectName || '';
  const dbId = row.dbId || row.subjectId || row.rawId || null;
  const isCustom = row.isCustom !== false && !dbId;
  return {
    name,
    credits: String(row.credits || '3'),
    grade: GRADES[row.grade] !== undefined ? row.grade : 'A',
    isCustom,
    dbId,
    code: row.code || '',
  };
}

function migrateCalcState() {
  const seen = new Set();
  APP.calcSemesters = (APP.calcSemesters || []).map((sem, index) => {
    const semKey = sem.semKey || normalizeCalcSemLabel(sem.label || String(index + 1));
    const migrated = { ...makeCalcSemester(semKey), ...sem, semKey, label: 'Semester ' + semKey };
    migrated.rows = (sem.rows || []).map(normalizeCalcRow);
    migrated.credits = Number(sem.credits || 0);
    return migrated;
  }).filter((sem) => {
    if (!JNTUK_SEMESTERS.includes(sem.semKey) || seen.has(sem.semKey)) return false;
    seen.add(sem.semKey);
    return true;
  }).sort((a, b) => JNTUK_SEMESTERS.indexOf(a.semKey) - JNTUK_SEMESTERS.indexOf(b.semKey));

  if (APP.currentSemId) {
    const current = APP.calcSemesters.find(s => s.id === APP.currentSemId);
    if (!current && APP.calcSemesters.length) APP.currentSemId = APP.calcSemesters[0].id;
  }
}

function getNextCalcSemesterKey() {
  const existing = new Set((APP.calcSemesters || []).map(s => s.semKey || normalizeCalcSemLabel(s.label)));
  return JNTUK_SEMESTERS.find(sem => !existing.has(sem)) || null;
}

function loadCalcState() {
  try {
    const saved = localStorage.getItem('edusync_cgpa_data');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && Array.isArray(parsed.calcSemesters) && parsed.calcSemesters.length) {
        APP.calcSemesters = parsed.calcSemesters;
        APP.currentSemId = parsed.currentSemId || parsed.calcSemesters[0].id;
        console.log('CGPA loaded', parsed);
        return true;
      }
    }
  } catch (e) {
    console.warn('Failed to load CGPA calculator state:', e);
  }
  return false;
}

function saveCalcState() {
  try {
    const data = {
      calcSemesters: APP.calcSemesters,
      currentSemId: APP.currentSemId
    };
    localStorage.setItem('edusync_cgpa_data', JSON.stringify(data));
    console.log('Saving CGPA', data);
  } catch (e) {
    console.warn('Failed to save CGPA calculator state:', e);
  }
}

async function initCalc() {
  if (window.__aiiensHydrationPromise) {
    await window.__aiiensHydrationPromise;
  }
  loadCalcState();

  if (!APP.calcSemesters.length) {
    APP.calcSemesters.push({ id: 'sem-1', label: 'Semester 1', rows: [], sgpa: null });
    APP.currentSemId = 'sem-1';
  }
  renderSemTabs();
  renderCalcSemTitle();
  if (!document.getElementById('calc-tbody').children.length) {
    const sem = APP.calcSemesters.find(s => s.id === APP.currentSemId);
    if (sem && sem.rows && sem.rows.length) {
      sem.rows.forEach(r => addCalcRow(r.name, r.credits, r.grade));
    } else {
      loadSubjectsForCurrentSemester();
    }
  }

  // Restore SGPA & CGPA UI displays
  const sem = APP.calcSemesters.find(s => s.id === APP.currentSemId);
  if (sem && sem.sgpa !== null) {
    const sgpaEl = document.getElementById('sgpa-result');
    if (sgpaEl) sgpaEl.textContent = sem.sgpa.toFixed(2);
  } else {
    const sgpaEl = document.getElementById('sgpa-result');
    if (sgpaEl) sgpaEl.textContent = '–';
  }

  const calcdSems = APP.calcSemesters.filter(s => s.sgpa !== null);
  const cgpaEl = document.getElementById('cgpa-result');
  if (cgpaEl) {
    if (calcdSems.length > 0) {
      const cgpa = Math.min(10, calcdSems.reduce((s, x) => s + x.sgpa, 0) / calcdSems.length);
      cgpaEl.textContent = cgpa.toFixed(2);
      const summaryEl = document.getElementById('all-sems-summary');
      const listEl = document.getElementById('all-sems-list');
      if (summaryEl && listEl && calcdSems.length > 1) {
        summaryEl.style.display = 'block';
        listEl.innerHTML = calcdSems.map(s =>
          '<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border);font-size:0.82rem;">' +
          '<span style="font-weight:600;">' + s.label + '</span>' +
          '<span style="color:var(--primary);font-weight:700;">' + s.sgpa.toFixed(2) + '</span></div>'
        ).join('') +
          '<div style="display:flex;justify-content:space-between;padding:8px 0;font-size:0.88rem;">' +
          '<span style="font-weight:700;">Overall CGPA</span>' +
          '<span style="color:var(--teal);font-weight:800;">' + cgpa.toFixed(2) + '</span></div>';
      }
    } else {
      cgpaEl.textContent = '–';
    }
  }
}

function addSemester() {
  const num = APP.calcSemesters.length + 1;
  const semId = 'sem-' + num;
  saveCurrentSemRows();
  APP.calcSemesters.push({ id: semId, label: 'Semester ' + num, rows: [], sgpa: null });
  APP.currentSemId = semId;
  document.getElementById('calc-tbody').innerHTML = '';
  APP.calcRows = [];
  renderSemTabs();
  renderCalcSemTitle();
  saveCalcState();
  showToast('Semester ' + num + ' added!', 'green');
}

function saveCurrentSemRows() {
  const sem = APP.calcSemesters.find(s => s.id === APP.currentSemId);
  if (!sem) return;
  const rows = [];
  document.querySelectorAll('#calc-tbody tr').forEach(row => {
    const inputs = row.querySelectorAll('input,select');
    rows.push({ name: inputs[0]?.value || '', credits: inputs[1]?.value || '3', grade: inputs[2]?.value || 'A' });
  });
  sem.rows = rows;
  saveCalcState();
}

function switchSem(semId) {
  saveCurrentSemRows();
  APP.currentSemId = semId;
  const sem = APP.calcSemesters.find(s => s.id === semId);
  document.getElementById('calc-tbody').innerHTML = '';
  APP.calcRows = [];
  if (sem && sem.rows.length) {
    sem.rows.forEach(r => addCalcRow(r.name, r.credits, r.grade));
  } else {
    loadSubjectsForCurrentSemester();
  }
  renderSemTabs();
  renderCalcSemTitle();
  if (sem && sem.sgpa !== null) {
    document.getElementById('sgpa-result').textContent = sem.sgpa.toFixed(2);
  } else {
    document.getElementById('sgpa-result').textContent = '–';
  }
  saveCalcState();
}

function renderSemTabs() {
  const container = document.getElementById('sem-tabs');
  if (!container) return;
  container.innerHTML = APP.calcSemesters.map(function (s) {
    var cls = s.id === APP.currentSemId ? 'btn-primary' : 'btn-ghost';
    var lbl = s.label + (s.sgpa !== null ? ' · ' + s.sgpa.toFixed(2) : '');
    return '<button class="btn ' + cls + ' btn-sm" onclick="switchSem(\'' + s.id + '\')">' + lbl + '</button>';
  }).join('');
}

function renderCalcSemTitle() {
  const sem = APP.calcSemesters.find(s => s.id === APP.currentSemId);
  const el = document.getElementById('calc-sem-title');
  if (el && sem) el.textContent = sem.label + ' Subjects';
}

function addCalcRow(name, credits, defaultGrade) {
  const id = Date.now() + Math.random();
  APP.calcRows.push(id);
  const tbody = document.getElementById('calc-tbody');
  const tr = document.createElement('tr');
  tr.id = 'row-' + id;
  const selGrade = defaultGrade || 'A';
  const selCredits = credits || '3';
  const gradeOptions = Object.keys(GRADES).map(g =>
    '<option value="' + g + '"' + (g === selGrade ? ' selected' : '') + '>' + g + '</option>'
  ).join('');
  tr.innerHTML =
    '<td class="input-cell"><input type="text" placeholder="Subject name" value="' + (name || '') + '" style="min-width:140px;"></td>' +
    '<td class="input-cell"><input type="number" min="1" max="5" value="' + selCredits + '" style="width:60px;text-align:center;"></td>' +
    '<td class="input-cell"><select style="width:70px;">' + gradeOptions + '</select></td>' +
    '<td style="text-align:center;font-weight:700;" class="pts-cell">' + (GRADES[selGrade] || 0) + '</td>' +
    '<td><button style="background:none;border:none;cursor:pointer;color:var(--red);font-size:1rem;padding:4px;" onclick="removeCalcRow(\'' + id + '\')">✕</button></td>';
  tbody.appendChild(tr);
  if (selGrade === 'F') tr.classList.add('fail-row');

  // Real-time updates and saving
  const select = tr.querySelector('select');
  select.addEventListener('change', function () {
    const pts = tr.querySelector('.pts-cell');
    pts.textContent = GRADES[this.value] ?? 0;
    if (this.value === 'F') tr.classList.add('fail-row');
    else tr.classList.remove('fail-row');
    saveCurrentSemRows();
  });

  tr.querySelectorAll('input').forEach(input => {
    input.addEventListener('input', () => {
      saveCurrentSemRows();
    });
  });

  saveCurrentSemRows();
}

function removeCalcRow(id) {
  document.getElementById('row-' + id)?.remove();
  APP.calcRows = APP.calcRows.filter(r => r !== id);
  saveCurrentSemRows();
}

function clearCalc() {
  document.getElementById('calc-tbody').innerHTML = '';
  APP.calcRows = [];
  document.getElementById('sgpa-result').textContent = '–';
  document.getElementById('sgpa-grade').textContent = 'Calculate to see your grade';
  document.getElementById('backlog-warn').style.display = 'none';
  const sem = APP.calcSemesters.find(s => s.id === APP.currentSemId);
  if (sem) { sem.rows = []; sem.sgpa = null; }
  renderSemTabs();
  saveCalcState();
  showToast('Semester cleared', 'blue');
}

async function renderCalc() {
  if (!APP.calcSemesters.length) {
    await initCalc();
  } else {
    renderSemTabs();
    renderCalcSemTitle();
    if (!document.getElementById('calc-tbody').children.length) {
      const sem = APP.calcSemesters.find(s => s.id === APP.currentSemId);
      if (sem && sem.rows.length) {
        sem.rows.forEach(r => addCalcRow(r.name, r.credits, r.grade));
      } else {
        loadSubjectsForCurrentSemester();
      }
    }
  }
}

function calculateGPA() {
  const rows = document.querySelectorAll('#calc-tbody tr');
  let totalPoints = 0, totalCredits = 0;
  const failed = [], gradeCount = {};
  rows.forEach(row => {
    const inputs = row.querySelectorAll('input,select');
    const credits = parseInt(inputs[1]?.value) || 0;
    const grade = inputs[2]?.value || 'F';
    const pts = GRADES[grade] ?? 0;
    totalPoints += credits * pts;
    totalCredits += credits;
    if (grade === 'F' || grade === 'Fail') failed.push(inputs[0]?.value || 'Unknown Subject');
    gradeCount[grade] = (gradeCount[grade] || 0) + 1;
  });
  if (!totalCredits) { showToast('Add subjects first', 'red'); return; }
  const sgpa = parseFloat((totalPoints / totalCredits).toFixed(2));

  // Store in current semester
  const sem = APP.calcSemesters.find(s => s.id === APP.currentSemId);
  if (sem) sem.sgpa = sgpa;
  saveCurrentSemRows();
  renderSemTabs();

  document.getElementById('sgpa-result').textContent = sgpa.toFixed(2);
  // Real CGPA = average of all calculated sems
  const calcdSems = APP.calcSemesters.filter(s => s.sgpa !== null);
  if (calcdSems.length > 0) {
    const cgpa = Math.min(10, calcdSems.reduce((s, x) => s + x.sgpa, 0) / calcdSems.length);
    document.getElementById('cgpa-result').textContent = cgpa.toFixed(2);
    const summaryEl = document.getElementById('all-sems-summary');
    const listEl = document.getElementById('all-sems-list');
    if (summaryEl && listEl && calcdSems.length > 1) {
      summaryEl.style.display = 'block';
      listEl.innerHTML = calcdSems.map(s =>
        '<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border);font-size:0.82rem;">' +
        '<span style="font-weight:600;">' + s.label + '</span>' +
        '<span style="color:var(--primary);font-weight:700;">' + s.sgpa.toFixed(2) + '</span></div>'
      ).join('') +
        '<div style="display:flex;justify-content:space-between;padding:8px 0;font-size:0.88rem;">' +
        '<span style="font-weight:700;">Overall CGPA</span>' +
        '<span style="color:var(--teal);font-weight:800;">' + cgpa.toFixed(2) + '</span></div>';
    }
  } else {
    document.getElementById('cgpa-result').textContent = sgpa.toFixed(2);
  }
  saveCalcState();
  const gradeLabel = sgpa >= 9 ? 'Outstanding 🏆' : sgpa >= 8 ? 'Excellent 🌟' : sgpa >= 7 ? 'Very Good 👍' : sgpa >= 6 ? 'Good ✅' : sgpa >= 5 ? 'Average ⚠️' : 'Needs Improvement 📚';
  document.getElementById('sgpa-grade').textContent = gradeLabel;

  // Grade distribution bars
  const colors = { S: 'var(--green)', A: 'var(--teal)', B: 'var(--primary)', C: 'var(--lavender)', D: 'var(--amber)', E: '#f97316', F: 'var(--red)', 'No Credits': 'var(--text3)' };
  const maxCount = Math.max(...Object.values(gradeCount), 1);
  document.getElementById('grade-dist').innerHTML = `
    <div style="display:flex;gap:4px;align-items:flex-end;height:60px;margin-bottom:6px;">
      ${Object.entries(GRADES).map(([g]) => {
    const cnt = gradeCount[g] || 0;
    const h = cnt ? Math.max(8, (cnt / maxCount) * 52) : 0;
    return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;">
          <div style="width:100%;height:${h}px;border-radius:4px 4px 0 0;background:${colors[g] || 'var(--border)'};transition:height 0.5s;"></div>
          <div style="font-size:0.65rem;font-weight:700;color:var(--text3);">${g}</div>
        </div>`;
  }).join('')}
    </div>`;

  // Backlogs
  if (failed.length > 0) {
    APP.backlogSubjects = [...new Set([...APP.backlogSubjects, ...failed])];
    document.getElementById('backlog-badge').textContent = APP.backlogSubjects.length;
    document.getElementById('backlog-warn').style.display = 'block';
    document.getElementById('backlog-warn-subjects').textContent = `Subjects moved to Backlog: ${failed.join(', ')}`;
    showToast(`⚠️ ${failed.length} backlog subject(s) detected!`, 'red');
  } else {
    document.getElementById('backlog-warn').style.display = 'none';
    showToast(`✅ SGPA: ${sgpa} — Great work!`, 'green');
  }
}

// ═══════════════════════════════════════════════════
//  SKILLS UP PAGE
// ═══════════════════════════════════════════════════
function loadCalcState() {
  try {
    const saved = localStorage.getItem('edusync_cgpa_data');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && Array.isArray(parsed.calcSemesters) && parsed.calcSemesters.length) {
        APP.calcSemesters = parsed.calcSemesters;
        APP.currentSemId = parsed.currentSemId || parsed.calcSemesters[0].id;
        migrateCalcState();
        return true;
      }
    }
  } catch (e) {
    console.warn('Failed to load CGPA calculator state:', e);
  }
  return false;
}

function saveCurrentSemRows() {
  const sem = APP.calcSemesters.find(s => s.id === APP.currentSemId);
  if (!sem) return;
  sem.rows = Array.from(document.querySelectorAll('#calc-tbody tr')).map(row => ({
    name: row.querySelector('[data-calc-name]')?.value || '',
    credits: row.querySelector('[data-calc-credits]')?.value || '0',
    grade: row.querySelector('[data-calc-grade]')?.value || 'A',
    isCustom: row.dataset.custom === 'true',
    dbId: row.dataset.dbId || null,
    code: row.dataset.code || '',
  })).filter(row => row.name || row.isCustom || row.dbId);
  saveCalcState();
}

function calculateWeightedCgpa(semesters) {
  const credits = semesters.reduce((sum, sem) => sum + Number(sem.credits || 0), 0);
  if (!credits) return 0;
  return Math.min(10, semesters.reduce((sum, sem) => sum + Number(sem.sgpa || 0) * Number(sem.credits || 0), 0) / credits);
}

function updateAddSemesterState() {
  const done = !getNextCalcSemesterKey();
  const btn = document.getElementById('calc-add-semester-btn');
  const msg = document.getElementById('calc-semester-limit-msg');
  if (btn) {
    btn.disabled = done;
    btn.classList.toggle('disabled', done);
  }
  if (msg) msg.style.display = done ? 'block' : 'none';
}

async function getCalcProfileFilters() {
  const appUser = APP.user || {};
  let profile = null;
  const sc = window.__AIMEASY_SUPABASE__;
  try {
    const session = sc ? (await sc.auth.getSession())?.data?.session : null;
    if (session?.user?.id) {
      const { data } = await sc.from('profiles')
        .select('university_name,regulation_code,branch_name,branch,semester')
        .eq('id', session.user.id)
        .maybeSingle();
      profile = data;
    }
  } catch (e) {
    console.warn('[Calculator] Profile filters unavailable', e);
  }
  const sem = APP.calcSemesters.find(s => s.id === APP.currentSemId);
  return {
    semester: sem?.semKey || normalizeCalcSemLabel(sem?.label),
    university_name: profile?.university_name || appUser.university_name || appUser.university || null,
    branch: profile?.branch_name || profile?.branch || appUser.branch_name || appUser.branch || null,
    regulation_code: profile?.regulation_code || appUser.regulation_code || appUser.regulation || null,
  };
}

function isPublishedSubject(row) {
  const status = String(row?.status || 'active').trim().toLowerCase();
  return !['inactive', 'deleted', 'draft', 'unpublished'].includes(status);
}

async function loadSubjectsForCurrentSemester() {
  const sem = APP.calcSemesters.find(s => s.id === APP.currentSemId);
  const tbody = document.getElementById('calc-tbody');
  if (!sem || !tbody) return;
  const customRows = (sem.rows || []).map(normalizeCalcRow).filter(row => row.isCustom);
  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text3);padding:1.3rem;">Loading published subjects...</td></tr>';
  let autoRows = [];
  try {
    const filters = await getCalcProfileFilters();
    if (window.aimeasyFetchSubjects) {
      const { data, error } = await window.aimeasyFetchSubjects(filters);
      if (error) throw error;
      const gradeByDbId = new Map((sem.rows || []).filter(row => row.dbId).map(row => [String(row.dbId), row.grade]));
      autoRows = (data || []).filter(isPublishedSubject).map(subject => ({
        name: subject.name,
        credits: String(subject.credits || '0'),
        grade: gradeByDbId.get(String(subject.id)) || 'A',
        isCustom: false,
        dbId: subject.id,
        code: subject.code || '',
      }));
    }
  } catch (error) {
    console.warn('[Calculator] Subject auto-load failed', error?.message || error);
  }
  sem.rows = [...autoRows, ...customRows];
  tbody.innerHTML = '';
  APP.calcRows = [];
  if (!sem.rows.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text3);padding:1.3rem;">No published subjects found for this semester. Use Add Custom Subject for additional papers.</td></tr>';
  } else {
    sem.rows.forEach(row => addCalcRow(row));
  }
  saveCurrentSemRows();
  calculateGPA({ silent: true });
}

async function initCalc() {
  if (window.__aiiensHydrationPromise) await window.__aiiensHydrationPromise;
  loadCalcState();
  migrateCalcState();
  if (!APP.calcSemesters.length) {
    const first = makeCalcSemester(JNTUK_SEMESTERS[0]);
    APP.calcSemesters.push(first);
    APP.currentSemId = first.id;
  }
  renderSemTabs();
  renderCalcSemTitle();
  const tbody = document.getElementById('calc-tbody');
  if (tbody && !tbody.children.length) {
    await loadSubjectsForCurrentSemester();
  }
  calculateGPA({ silent: true });
  updateAddSemesterState();
}

async function addSemester() {
  const nextSem = getNextCalcSemesterKey();
  if (!nextSem) {
    updateAddSemesterState();
    showToast('All semesters have already been added.', 'blue');
    return;
  }
  saveCurrentSemRows();
  const sem = makeCalcSemester(nextSem);
  APP.calcSemesters.push(sem);
  APP.currentSemId = sem.id;
  document.getElementById('calc-tbody').innerHTML = '';
  APP.calcRows = [];
  renderSemTabs();
  renderCalcSemTitle();
  saveCalcState();
  await loadSubjectsForCurrentSemester();
  showToast('Semester ' + nextSem + ' added!', 'green');
}

async function switchSem(semId) {
  saveCurrentSemRows();
  APP.currentSemId = semId;
  const sem = APP.calcSemesters.find(s => s.id === semId);
  document.getElementById('calc-tbody').innerHTML = '';
  APP.calcRows = [];
  await loadSubjectsForCurrentSemester();
  renderSemTabs();
  renderCalcSemTitle();
  document.getElementById('sgpa-result').textContent = sem?.sgpa !== null && sem?.sgpa !== undefined ? Number(sem.sgpa).toFixed(2) : 'â€“';
  calculateGPA({ silent: true });
  updateAddSemesterState();
  saveCalcState();
}

function renderSemTabs() {
  const container = document.getElementById('sem-tabs');
  if (!container) return;
  migrateCalcState();
  container.innerHTML = APP.calcSemesters.map((sem) => {
    const cls = sem.id === APP.currentSemId ? 'btn-primary' : 'btn-ghost';
    const label = sem.label + (sem.sgpa !== null && sem.sgpa !== undefined ? ' - ' + Number(sem.sgpa).toFixed(2) : '');
    return '<button class="btn ' + cls + ' btn-sm" onclick="switchSem(\'' + sem.id + '\')">' + calcHtml(label) + '</button>';
  }).join('');
  updateAddSemesterState();
}

function renderCalcSemTitle() {
  const sem = APP.calcSemesters.find(s => s.id === APP.currentSemId);
  const el = document.getElementById('calc-sem-title');
  if (el && sem) el.textContent = sem.label + ' Subjects';
}

function addCalcRow(rowOrName, credits, defaultGrade) {
  const rowData = typeof rowOrName === 'object'
    ? normalizeCalcRow(rowOrName)
    : normalizeCalcRow({ name: rowOrName, credits, grade: defaultGrade, isCustom: true });
  const id = Date.now() + Math.random();
  APP.calcRows.push(id);
  const tbody = document.getElementById('calc-tbody');
  tbody.querySelector('td[colspan="5"]')?.parentElement?.remove();
  const tr = document.createElement('tr');
  tr.id = 'row-' + id;
  tr.dataset.custom = rowData.isCustom ? 'true' : 'false';
  if (rowData.dbId) tr.dataset.dbId = rowData.dbId;
  if (rowData.code) tr.dataset.code = rowData.code;
  tr.classList.add(rowData.isCustom ? 'custom-row' : 'locked-row');
  const selGrade = rowData.grade || 'A';
  const gradeOptions = Object.keys(GRADES).map(g => '<option value="' + g + '"' + (g === selGrade ? ' selected' : '') + '>' + g + '</option>').join('');
  const nameField = '<input data-calc-name type="text" placeholder="Subject name" value="' + calcHtml(rowData.name) + '">';
  const creditField = '<input data-calc-credits type="number" min="0" max="10" step="0.5" value="' + calcHtml(rowData.credits) + '">';
  tr.innerHTML =
    '<td class="input-cell calc-subject-cell">' + nameField + '</td>' +
    '<td class="input-cell calc-credit-cell">' + creditField + '</td>' +
    '<td class="input-cell calc-grade-cell"><select data-calc-grade>' + gradeOptions + '</select></td>' +
    '<td class="calc-points-cell pts-cell">' + (GRADES[selGrade] || 0) + '</td>' +
    '<td class="calc-delete-cell"><button style="background:none;border:none;cursor:pointer;color:var(--red);font-size:1rem;padding:4px;" onclick="removeCalcRow(\'' + id + '\')" aria-label="Remove subject">x</button></td>';
  tbody.appendChild(tr);
  if (selGrade === 'F') tr.classList.add('fail-row');
  tr.querySelector('[data-calc-grade]').addEventListener('change', function () {
    tr.querySelector('.pts-cell').textContent = GRADES[this.value] ?? 0;
    tr.classList.toggle('fail-row', this.value === 'F');
    saveCurrentSemRows();
    calculateGPA({ silent: true });
  });
  tr.querySelectorAll('input').forEach(input => input.addEventListener('input', () => {
    saveCurrentSemRows();
    calculateGPA({ silent: true });
  }));
  saveCurrentSemRows();
}

function clearCalc() {
  document.getElementById('calc-tbody').innerHTML = '';
  APP.calcRows = [];
  document.getElementById('sgpa-result').textContent = 'â€“';
  document.getElementById('sgpa-grade').textContent = 'Calculate to see your grade';
  document.getElementById('backlog-warn').style.display = 'none';
  const sem = APP.calcSemesters.find(s => s.id === APP.currentSemId);
  if (sem) { sem.rows = []; sem.sgpa = null; sem.credits = 0; }
  renderSemTabs();
  updateAddSemesterState();
  saveCalcState();
  showToast('Semester cleared', 'blue');
}

async function renderCalc() {
  if (!APP.calcSemesters.length) await initCalc();
  else {
    migrateCalcState();
    renderSemTabs();
    renderCalcSemTitle();
    if (!document.getElementById('calc-tbody').children.length) {
      await loadSubjectsForCurrentSemester();
    }
    calculateGPA({ silent: true });
  }
  updateAddSemesterState();
}

function calculateGPA(options = {}) {
  const rows = document.querySelectorAll('#calc-tbody tr');
  let totalPoints = 0, totalCredits = 0;
  const failed = [], gradeCount = {};
  rows.forEach(row => {
    const name = row.querySelector('[data-calc-name]')?.value || 'Unknown Subject';
    const credits = parseFloat(row.querySelector('[data-calc-credits]')?.value) || 0;
    const grade = row.querySelector('[data-calc-grade]')?.value || 'F';
    const pts = GRADES[grade] ?? 0;
    if (grade !== 'F' && grade !== 'No Credits') {
      totalPoints += credits * pts;
      totalCredits += credits;
    }
    if (grade === 'F') failed.push(name);
    gradeCount[grade] = (gradeCount[grade] || 0) + 1;
  });
  if (!totalCredits) {
    if (!options.silent) showToast('Add credit-bearing subjects first', 'red');
    return;
  }
  const sgpa = parseFloat((totalPoints / totalCredits).toFixed(2));
  const sem = APP.calcSemesters.find(s => s.id === APP.currentSemId);
  if (sem) { sem.sgpa = sgpa; sem.credits = totalCredits; }
  saveCurrentSemRows();
  renderSemTabs();
  document.getElementById('sgpa-result').textContent = sgpa.toFixed(2);
  document.getElementById('sgpa-grade').textContent = sgpa >= 9 ? 'Outstanding' : sgpa >= 8 ? 'Excellent' : sgpa >= 7 ? 'Very Good' : sgpa >= 6 ? 'Good' : sgpa >= 5 ? 'Pass' : 'Needs Improvement';
  const calcdSems = APP.calcSemesters.filter(s => s.sgpa !== null && s.sgpa !== undefined && Number(s.credits || 0) > 0);
  const cgpa = calcdSems.length ? calculateWeightedCgpa(calcdSems) : sgpa;
  document.getElementById('cgpa-result').textContent = cgpa.toFixed(2);
  const summaryEl = document.getElementById('all-sems-summary');
  const listEl = document.getElementById('all-sems-list');
  if (summaryEl && listEl) {
    summaryEl.style.display = calcdSems.length > 1 ? 'block' : 'none';
    listEl.innerHTML = calcdSems.map(s =>
      '<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border);font-size:0.82rem;">' +
      '<span style="font-weight:600;">' + calcHtml(s.label) + '</span>' +
      '<span style="color:var(--primary);font-weight:700;">' + Number(s.sgpa).toFixed(2) + '</span></div>'
    ).join('') +
      '<div style="display:flex;justify-content:space-between;padding:8px 0;font-size:0.88rem;">' +
      '<span style="font-weight:700;">Overall CGPA</span>' +
      '<span style="color:var(--teal);font-weight:800;">' + cgpa.toFixed(2) + '</span></div>';
  }
  const colors = { S: 'var(--green)', A: 'var(--teal)', B: 'var(--primary)', C: 'var(--lavender)', D: 'var(--amber)', E: '#f97316', F: 'var(--red)', 'No Credits': 'var(--text3)' };
  const maxCount = Math.max(...Object.values(gradeCount), 1);
  const dist = document.getElementById('grade-dist');
  if (dist) dist.innerHTML = '<div style="display:flex;gap:4px;align-items:flex-end;height:60px;margin-bottom:6px;">' +
    Object.keys(GRADES).map(g => {
      const cnt = gradeCount[g] || 0;
      const h = cnt ? Math.max(8, (cnt / maxCount) * 52) : 0;
      return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;min-width:0;">' +
        '<div style="width:100%;height:' + h + 'px;border-radius:4px 4px 0 0;background:' + (colors[g] || 'var(--border)') + ';transition:height 0.5s;"></div>' +
        '<div style="font-size:0.65rem;font-weight:700;color:var(--text3);text-align:center;">' + calcHtml(g) + '</div></div>';
    }).join('') + '</div>';
  if (failed.length > 0) {
    APP.backlogSubjects = [...new Set([...APP.backlogSubjects, ...failed])];
    const badge = document.getElementById('backlog-badge');
    if (badge) badge.textContent = APP.backlogSubjects.length;
    document.getElementById('backlog-warn').style.display = 'block';
    document.getElementById('backlog-warn-subjects').textContent = `Subjects moved to Backlog: ${failed.join(', ')}`;
    if (!options.silent) showToast(`${failed.length} backlog subject(s) detected!`, 'red');
  } else {
    document.getElementById('backlog-warn').style.display = 'none';
    if (!options.silent) showToast(`SGPA: ${sgpa} - Great work!`, 'green');
  }
  saveCalcState();
}

async function renderStudentSkillUpPage() {
  const root = document.getElementById('page-skills');
  const supabase = window.__AIMEASY_SUPABASE__;
  if (!root) return;
  if (!supabase) {
    root.innerHTML = '<div class="empty-state-card">Supabase is required to load SkillUp.</div>';
    return;
  }
  const user = await supabase.auth?.getUser?.().then(({ data }) => data?.user).catch(() => null);
  const [{ data: banners }, { data: workshops }, { data: registrations }, { data: contentItems }] = await Promise.all([
    supabase.from('live_workshop_banners').select('*').eq('is_active', true).order('created_at', { ascending: false }),
    supabase.from('live_workshops').select('*').eq('status', 'published').order('workshop_date', { ascending: true }),
    user?.id
      ? supabase.from('live_workshop_registrations').select('*').eq('user_id', user.id)
      : Promise.resolve({ data: [] }),
    supabase.from('content_items').select('*').order('created_at', { ascending: false }),
  ]);
  const rows = workshops || [];
  const registeredIds = new Set((registrations || []).map(row => row.workshop_id).filter(Boolean));
  const registered = rows.filter(row => registeredIds.has(row.id));
  const upcoming = rows.filter(row => !registeredIds.has(row.id));
  const bannerRows = (banners || []).length ? banners : [{
    banner_title: 'SkillUp Workshops',
    banner_subtitle: 'Build practical skills with published sessions and courses',
    banner_image: rows.find(row => row.banner_image)?.banner_image || '',
  }];
  const courseGroups = new Map();
  (contentItems || []).filter(isSkillUpContentItem).forEach((item) => {
    let metadata = item.metadata || {};
    if (typeof metadata === 'string') {
      try { metadata = JSON.parse(metadata); } catch { metadata = {}; }
    }
    const key = metadata.courseId || metadata.course_id || metadata.course || metadata.skill || item.subject_id || item.created_by || item.id;
    if (!courseGroups.has(key)) courseGroups.set(key, []);
    courseGroups.get(key).push({ ...item, metadata });
  });
  const courses = Array.from(courseGroups.entries()).map(([key, items], index) => {
    const first = items[0] || {};
    return {
      id: key,
      name: first.metadata?.course || first.metadata?.skill || first.title || 'SkillUp Content',
      description: first.body || first.description || '',
      category: first.metadata?.category || 'SkillUp',
      level: first.metadata?.level || 'Self-paced',
      duration: first.metadata?.duration || 'Self-paced',
      videos: items.filter(item => item.content_type === 'video').length,
      notes: items.filter(item => ['note', 'pdf'].includes(item.content_type)).length,
      createdBy: first.created_by || 'Admin/Sub Admin',
      index,
    };
  });
  const bannerSlide = (banner, index) => {
    const image = banner.banner_image || banner.image_url || banner.banner_url || '';
    return `<article class="live-workshop-carousel-slide ${index === 0 ? 'active' : ''}" ${image ? `style="background-image:url('${String(image).replace(/'/g, "\\'")}')"` : ''}>
      <div class="live-workshop-carousel-copy"><span>${v10Html(banner.banner_title || banner.title || 'SkillUp')}</span><h1>${v10Html(banner.banner_subtitle || banner.subtitle || 'Upcoming expert sessions')}</h1></div>
    </article>`;
  };
  root.innerHTML = `
    <div class="live-skillup-page">
      <section class="live-workshop-carousel live-skillup-banner" aria-label="SkillUp banners">
        <div class="live-workshop-carousel-track">${bannerRows.map(bannerSlide).join('')}</div>
      </section>
      <section class="live-workshop-section"><div class="section-heading">Registered Workshops</div><div class="live-workshop-scroll-row">${registered.length ? registered.map(row => studentSkillUpWorkshopCard(row, true)).join('') : '<div class="empty-state-card live-scroll-empty">No registered workshops yet.</div>'}</div></section>
      <section class="live-workshop-section"><div class="section-heading">Upcoming Workshops</div><div class="live-workshop-scroll-row">${upcoming.length ? upcoming.map(row => studentSkillUpWorkshopCard(row, false)).join('') : '<div class="empty-state-card live-scroll-empty">Upcoming workshops available soon.</div>'}</div></section>
      <section class="live-workshop-section"><div class="section-heading">Courses</div><div class="live-skillup-grid">${courses.length ? courses.map(studentSkillUpCourseCard).join('') : '<div class="empty-state-card">Courses will appear here as soon as Admin or Sub Admin publishes content.</div>'}</div></section>
    </div>`;
  enableSkillUpHorizontalScrolling(root);
}

function isSkillUpContentItem(item) {
  let metadata = item?.metadata || {};
  if (typeof metadata === 'string') {
    try { metadata = JSON.parse(metadata); } catch { metadata = {}; }
  }
  if (item?.content_type === 'feature' || metadata.type === 'platform_feature') return false;
  return Boolean(
    metadata.courseId || metadata.course_id || metadata.skillId || metadata.skill_id ||
    metadata.course || metadata.skill || metadata.type === 'skillup' || metadata.module === 'skillup'
  );
}

function skillUpTheme(value, index = 0) {
  const seed = String(value ?? index);
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  return `skillup-theme-${Math.abs(hash) % 5}`;
}

function enableSkillUpHorizontalScrolling(root = document) {
  root.querySelectorAll?.('.live-workshop-scroll-row, .live-skillup-grid').forEach((row) => {
    if (row.dataset.wheelScrollReady) return;
    row.dataset.wheelScrollReady = 'true';
    row.addEventListener('wheel', (event) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX) || row.scrollWidth <= row.clientWidth) return;
      event.preventDefault();
      row.scrollBy({ left: event.deltaY, behavior: 'smooth' });
    }, { passive: false });
  });
}

function studentSkillUpWorkshopCard(row, registered, index = 0) {
  const action = registered
    ? `<a class="btn btn-primary" href="${v10EscapeAttr(row.join_link || '#')}" target="_blank" rel="noreferrer">Join</a>`
    : `<button class="btn btn-primary" type="button" onclick="openLiveWorkshopRegisterModal?.('${v10EscapeJs(row.id)}')">Register</button>`;
  return `<article class="live-workshop-card ${skillUpTheme(row.id, index)}">
    ${row.banner_image ? `<img class="live-workshop-card-img" src="${v10EscapeAttr(row.banner_image)}" alt="${v10Html(row.workshop_name)} banner" loading="lazy">` : ''}
    <h3>${v10Html(row.workshop_name)}</h3>
    <div class="live-workshop-info-pills">
      <span>${v10Html(row.speaker_name || 'Speaker TBA')}</span>
      <span>${v10Html(row.workshop_date || '')}</span>
      <span>${v10Html(row.workshop_time || '')}</span>
    </div>
    <p class="live-workshop-description">${v10Html(row.description || '')}</p>
    <div class="live-workshop-card-action">${action}</div>
  </article>`;
}

function studentSkillUpCourseCard(card) {
  return `<article class="subject-card live-skillup-card" style="animation-delay:${(card.index || 0) * 0.06}s">
    <div class="subject-card-header"><div class="subject-icon">Course</div><div class="subject-name">${v10Html(card.name)}</div><div class="subject-code">${v10Html(card.category)} - ${v10Html(card.level)}</div></div>
    <div class="subject-card-body"><div class="subject-meta"><span class="badge badge-teal">${Number(card.videos || 0)} Videos</span><span class="badge badge-lavender">${Number(card.notes || 0)} PDFs/Notes</span><span class="badge badge-primary">${v10Html(card.duration)}</span></div>
    <p style="font-size:0.78rem;color:var(--text2);margin:8px 0;">${v10Html(card.description || '')}</p><p style="font-size:0.72rem;color:var(--text3);margin:0;">Published by ${v10Html(card.createdBy || 'Admin/Sub Admin')}</p></div>
  </article>`;
}

function renderSkillsPage() {
  renderStudentSkillUpPage();
  return;
  const grid = document.getElementById('skills-grid');
  const empty = document.getElementById('skills-empty');
  if (!grid) return;
  const skills = JSON.parse(localStorage.getItem('edusync_skills') || '[]');
  if (!skills.length) {
    grid.innerHTML = '';
    if (empty) {
      empty.style.display = 'block';
      empty.innerHTML = `<div class="coming-soon-wrap">
        <div class="coming-soon-orbit">
          <div class="orbit-center">⚡</div>
          <div class="orbit-ring" style="width:120px;height:120px;"></div>
          <div class="orbit-ring" style="width:170px;height:170px;"></div>
        </div>
        <h2 style="font-size:1.8rem;font-weight:800;margin-bottom:8px;">Skills Up</h2>
        <p style="color:var(--text2);max-width:400px;line-height:1.6;font-size:0.95rem;">Skill courses will appear here once the Admin adds them from the Admin Dashboard → Skills Up tab.</p>
      </div>`;
    }
    return;
  }
  if (empty) empty.style.display = 'none';
  const colorMap = { coding: 'teal', aptitude: 'lavender', communication: 'blue', ai: 'amber', certification: 'green', other: 'primary' };
  grid.innerHTML = skills.map((s, i) => {
    const col = colorMap[s.category] || 'primary';
    const skillVideos = JSON.parse(localStorage.getItem('edusync_skill_videos') || '[]').filter(v => v.skillId == s.id);
    const skillNotes = JSON.parse(localStorage.getItem('edusync_skill_notes') || '[]').filter(n => n.skillId == s.id);
    return `<div class="subject-card" onclick="openSkillCourse('${s.id}')" style="animation-delay:${i * 0.06}s">
      <div class="subject-card-header" style="background:linear-gradient(135deg,var(--${col}-light),rgba(255,255,255,0.5));">
        <div class="subject-icon">${s.icon || '⚡'}</div>
        <div class="subject-name">${s.name}</div>
        <div class="subject-code">${s.category || 'Skill'} · ${s.level || 'Beginner'}</div>
      </div>
      <div class="subject-card-body">
        <div class="subject-meta">
          <span class="badge badge-${col}">${skillVideos.length} Videos</span>
          <span class="badge badge-primary">${s.duration || 'Self-paced'}</span>
        </div>
        <p style="font-size:0.78rem;color:var(--text2);margin:8px 0;">${s.description || ''}</p>
        ${skillNotes.length ? `<div style="font-size:0.75rem;color:var(--text3);">📄 ${skillNotes.length} note${skillNotes.length > 1 ? 's' : ''} available</div>` : ''}
        <div class="progress-bar" style="margin-top:8px;"><div class="progress-fill" style="width:0%;"></div></div>
      </div>
    </div>`;
  }).join('');
}

function openSkillCourse(id) {
  const skills = JSON.parse(localStorage.getItem('edusync_skills') || '[]');
  const skill = skills.find(s => s.id == id);
  if (!skill) return;
  APP.currentSubject = { id: 'skill_' + id, name: skill.name, icon: skill.icon || '⚡', credits: 0, progress: 0, isSkill: true, skillId: id };
  document.querySelectorAll('[id^="page-"]').forEach(p => p.style.display = 'none');
  document.getElementById('page-units').style.display = 'block';
  document.getElementById('units-subject-name').textContent = (skill.icon || '⚡') + ' ' + skill.name;
  document.getElementById('units-tags').innerHTML = `<span class="badge badge-teal">${skill.category || 'Skill'}</span><span class="badge badge-lavender">${skill.level || 'Beginner'}</span>`;
  document.getElementById('topbar-title').textContent = skill.name;
  document.getElementById('topbar-breadcrumb').innerHTML = `Skills Up / <span>${skill.name}</span>`;
  // Build units from skill videos/notes grouped by topic
  const skillVideos = JSON.parse(localStorage.getItem('edusync_skill_videos') || '[]').filter(v => v.skillId == id);
  const skillNotes = JSON.parse(localStorage.getItem('edusync_skill_notes') || '[]').filter(n => n.skillId == id);
  APP._skillVideos = skillVideos;
  APP._skillNotes = skillNotes;
  renderUnits(APP.currentSubject);
}

// ═══════════════════════════════════════════════════
//  BACKLOG
// ═══════════════════════════════════════════════════
function renderBacklog() {
  const grid = document.getElementById('backlog-grid');
  if (!APP.backlogSubjects.length) {
    grid.innerHTML = `<div class="backlog-empty">
      <div class="empty-icon">🎉</div>
      <h3>No Backlogs!</h3>
      <p>Great job! You have no backlog subjects. Keep maintaining your grades.</p>
    </div>`;
    return;
  }
  grid.innerHTML = `<div class="subject-grid">${APP.backlogSubjects.map((s, i) => `
    <div class="subject-card" onclick="openBacklogSubject('${s}')" style="animation-delay:${i * 0.07}s">
      <div class="subject-card-header" style="background:linear-gradient(135deg,var(--red-light),#fff);">
        <div class="subject-icon">⚠️</div>
        <div class="subject-name">${s}</div>
        <div class="subject-code">Backlog — Needs Attention</div>
      </div>
      <div class="subject-card-body">
        <div class="subject-meta">
          <span class="badge badge-red">Backlog</span>
          <span class="badge badge-primary">5 Units</span>
        </div>
        <div class="subject-progress-row">
          <span class="subject-progress-label">Completion</span>
          <span class="subject-progress-val" style="color:var(--red);">0%</span>
        </div>
        <div class="progress-bar"><div class="progress-fill" style="width:0%;background:var(--red);"></div></div>
      </div>
    </div>`).join('')}</div>`;
}

function openBacklogSubject(name) {
  APP.currentSubject = { id: 'default', name, icon: '⚠️', credits: 3, progress: 0 };
  document.querySelectorAll('[id^="page-"]').forEach(p => p.style.display = 'none');
  document.getElementById('page-units').style.display = 'block';
  document.getElementById('units-subject-name').textContent = `⚠️ ${name}`;
  document.getElementById('units-tags').innerHTML = `<span class="badge badge-red">Backlog</span><span class="badge badge-primary">5 Units</span>`;
  document.getElementById('topbar-title').textContent = name;
  document.getElementById('topbar-breadcrumb').innerHTML = `Backlog / <span>${name}</span>`;
  renderUnits(APP.currentSubject);
}

function openSubjectFromRecent(id) {
  navigateTo('subjects');
  setTimeout(() => openSubject(id), 100);
  showToast('Opening recent activity...', 'blue');
}

// ═══════════════════════════════════════════════════
//  HEATMAP
// ═══════════════════════════════════════════════════
function buildHeatmap() {
  const hm = document.getElementById('heatmap');
  if (!hm) return;
  const intensities = ['', 'h1', 'h2', 'h3', 'h4'];
  for (let i = 0; i < 91; i++) {
    const cell = document.createElement('div');
    const r = Math.random();
    cell.className = 'heatmap-cell ' + (i > 77 ? intensities[3 + Math.floor(r * 2)] : r > 0.4 ? intensities[1 + Math.floor(r * 3)] : '');
    cell.style.animationDelay = (i * 8) + 'ms';
    cell.style.animation = `heatmap-appear 0.3s ease ${i * 6}ms both`;
    cell.title = `Day ${i + 1}`;
    hm.appendChild(cell);
  }
}

// ═══════════════════════════════════════════════════
//  CHATBOT
// ═══════════════════════════════════════════════════
function toggleChat() {
  APP.chatOpen = !APP.chatOpen;
  document.getElementById('chat-window').classList.toggle('open', APP.chatOpen);
  if (APP.chatOpen) document.getElementById('chat-input').focus();
}

function openChat() {
  APP.chatOpen = false;
  toggleChat();
}

async function sendChat() {
  const input = document.getElementById('chat-input');
  const sendBtn = document.querySelector('.chat-send');
  if (window.__aiiensChatPending) return;
  const msg = input.value.trim();
  if (!msg) return;
  input.value = '';
  addChatMsg(msg, 'user');
  window.__aiiensChatPending = true;
  if (sendBtn) {
    sendBtn.disabled = true;
    sendBtn.setAttribute('aria-busy', 'true');
  }
  showTyping();
  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg }),
    });
    const data = await response.json().catch(() => ({}));
    removeTyping();
    addChatMsg(data.answer || "Sorry, I'm unable to answer right now. Please try again later.", 'bot');
  } catch (error) {
    removeTyping();
    addChatMsg("Sorry, I'm unable to answer right now. Please try again later.", 'bot');
  } finally {
    window.__aiiensChatPending = false;
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.removeAttribute('aria-busy');
    }
    input.focus();
  }
}

function quickChat(msg) {
  document.getElementById('chat-input').value = msg;
  sendChat();
}

function addChatMsg(text, type) {
  const msgs = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = `chat-msg ${type}`;
  const safeText = String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  div.innerHTML = `<div class="chat-bubble">${safeText.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</div>`;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function showTyping() {
  const msgs = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = 'chat-msg bot'; div.id = 'typing-indicator';
  div.innerHTML = `<div class="chat-bubble"><div class="chat-typing"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div></div>`;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function removeTyping() {
  document.getElementById('typing-indicator')?.remove();
}

// ═══════════════════════════════════════════════════
//  LOGOUT
// ═══════════════════════════════════════════════════
function setModalOpenState(modalId, open) {
  const modal = document.getElementById(modalId);
  if (!modal) return null;
  modal.classList.toggle('open', open);
  modal.style.removeProperty('pointer-events');
  modal.style.removeProperty('z-index');
  return modal;
}

function openLogoutModal() {
  setModalOpenState('logout-modal', true);
}

function closeLogoutModal() {
  setModalOpenState('logout-modal', false);
}

async function confirmLogout() {
  // Clear all user-specific state prefixed keys to prevent session leak
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key && (key.startsWith('edusync_') || key.startsWith('aimeasy_'))) {
      localStorage.removeItem(key);
    }
  }

  APP.session = false; APP.user = null;
  APP.calcSemesters = [];
  APP.currentSemId = '';

  closeLogoutModal();
  showToast('👋 Logged out successfully', 'blue');

  if (window.__AIMEASY_SUPABASE__) {
    try {
      await window.__AIMEASY_SUPABASE__.auth.signOut();
    } catch (e) {
      console.warn('Supabase signOut failed:', e);
    }
  }

  setTimeout(() => showScreen('screen-landing'), 500);
  document.getElementById('chat-fab').style.display = 'none';
  document.getElementById('chat-window').classList.remove('open');
}

window.openLogoutModal = globalThis.openLogoutModal = openLogoutModal;
window.closeLogoutModal = globalThis.closeLogoutModal = closeLogoutModal;
window.confirmLogout = globalThis.confirmLogout = confirmLogout;

// ═══════════════════════════════════════════════════
//  TOAST
// ═══════════════════════════════════════════════════
let toastTimeout;
function showToast(msg, type) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast show ${type || ''}`;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => t.classList.remove('show'), 2800);
}

// ═══════════════════════════════════════════════════
//  SEARCH
// ═══════════════════════════════════════════════════
function handleSearch(val) {
  if (!val.trim()) return;
  // Fuzzy search subjects
  const all = Object.values(SUBJECTS_DB).flat();
  const found = all.find(s => s.name.toLowerCase().includes(val.toLowerCase()));
  if (found) showToast(`Found: ${found.name} — press Enter to open`, 'blue');
}

// ═══════════════════════════════════════════════════
//  TEACHER PORTAL (launched via Google Sign-In)
// ═══════════════════════════════════════════════════
// openTeacherLogin / closeTeacherLogin / submitTeacherLogin removed —
// teacher now signs in via the shared Google Auth screen (same as student)

function launchTeacherPortal(teacher) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const ts = document.getElementById('screen-teacher');
  ts.classList.add('active');
  // Render teacher portal UI
  ts.innerHTML = `
    <header class="admin-topbar">
      <div style="display:flex;align-items:center;gap:12px;">
        <div class="logo-icon" style="width:32px;height:32px;font-size:0.85rem;background:linear-gradient(135deg,var(--teal),var(--primary));">T</div>
        <div>
          <div style="font-weight:800;font-size:1rem;letter-spacing:-0.02em;">AIIENS Edu Teacher Portal</div>
          <div style="font-size:0.72rem;color:var(--text3);">${teacher.dept} Department</div>
        </div>
      </div>
      <div style="display:flex;gap:10px;align-items:center;">
        <span class="badge badge-teal" style="font-size:0.75rem;padding:5px 12px;">👨‍🏫 ${teacher.name}</span>
        <button class="btn btn-ghost btn-sm" onclick="teacherLogout()">Logout</button>
      </div>
    </header>
    <div style="padding:2rem;max-width:1100px;margin:0 auto;width:100%;">
      <div style="margin-bottom:2rem;">
        <h2 style="font-size:1.6rem;font-weight:800;letter-spacing:-0.02em;margin-bottom:4px;">Welcome, ${teacher.name}! 👋</h2>
        <p style="font-size:0.88rem;color:var(--text2);">Subject: ${teacher.subject} · ${teacher.dept} Department</p>
      </div>

      <!-- Stats Row -->
      <div class="admin-grid" style="margin-bottom:2rem;">
        <div class="admin-stat-card">
          <div class="admin-stat-accent" style="background:var(--primary);"></div>
          <div style="font-size:2.2rem;font-weight:800;color:var(--primary);">124</div>
          <div style="font-size:0.88rem;font-weight:600;margin-top:4px;">Students Enrolled</div>
          <div style="font-size:0.75rem;color:var(--text3);margin-top:4px;">Across 3 sections</div>
        </div>
        <div class="admin-stat-card">
          <div class="admin-stat-accent" style="background:var(--teal);"></div>
          <div style="font-size:2.2rem;font-weight:800;color:var(--teal);">18</div>
          <div style="font-size:0.88rem;font-weight:600;margin-top:4px;">Materials Uploaded</div>
          <div style="font-size:0.75rem;color:var(--text3);margin-top:4px;">Videos, Notes & PYQs</div>
        </div>
        <div class="admin-stat-card">
          <div class="admin-stat-accent" style="background:var(--lavender);"></div>
          <div style="font-size:2.2rem;font-weight:800;color:var(--lavender);">5</div>
          <div style="font-size:0.88rem;font-weight:600;margin-top:4px;">Units Covered</div>
          <div style="font-size:0.75rem;color:var(--text3);margin-top:4px;">Full syllabus available</div>
        </div>
        <div class="admin-stat-card">
          <div class="admin-stat-accent" style="background:var(--amber);"></div>
          <div style="font-size:2.2rem;font-weight:800;color:var(--amber);">87%</div>
          <div style="font-size:0.88rem;font-weight:600;margin-top:4px;">Avg Attendance</div>
          <div style="font-size:0.75rem;color:var(--text3);margin-top:4px;">This semester</div>
        </div>
      </div>

      <!-- Quick Actions -->
      <div class="card" style="margin-bottom:1.5rem;">
        <div class="section-heading">⚡ Quick Actions</div>
        <div style="display:flex;gap:12px;flex-wrap:wrap;">
          <button class="btn btn-primary" onclick="showToast('📤 Upload material — connect to Sub Admin panel','blue')">📤 Upload Material</button>
          <button class="btn btn-teal" onclick="showToast('📝 Quiz builder coming soon!','blue')">📝 Create Quiz</button>
          <button class="btn btn-lavender" onclick="showToast('📊 Analytics dashboard coming soon!','blue')">📊 View Analytics</button>
          <button class="btn btn-ghost" onclick="showToast('📣 Announcement sent to all students!','green')">📣 Announce</button>
        </div>
      </div>

      <!-- Recent Activity -->
      <div class="card">
        <div class="section-heading">🕐 Recent Activity</div>
        ${[
      { icon: '🎬', title: 'Uploaded: OS Unit 3 — Memory Management Video', time: '2 hours ago', color: 'var(--teal-light)' },
      { icon: '📄', title: 'Added Notes: Virtual Memory Concepts PDF', time: 'Yesterday', color: 'var(--primary-light)' },
      { icon: '📝', title: 'Added 5 PYQs for Unit 2 (2019–2023)', time: '2 days ago', color: 'var(--lavender-light)' },
      { icon: '✅', title: 'Reviewed 8 student URL submissions', time: '3 days ago', color: 'var(--green-light)' },
    ].map(a => `
          <div class="recent-item">
            <div class="recent-thumb" style="background:${a.color};">${a.icon}</div>
            <div class="recent-info">
              <div class="recent-title">${a.title}</div>
              <div class="recent-sub">${teacher.subject}</div>
            </div>
            <div class="recent-time">${a.time}</div>
          </div>`).join('')}
      </div>
    </div>
  `;
}

function teacherLogout() {
  APP.role = null;
  APP.teacherData = null;
  showScreen('screen-landing');
  showToast('👋 Logged out of Teacher Portal', 'blue');
}

// ═══════════════════════════════════════════════════
//  TASK 1: ADMIN ICON & LOGIN
// ═══════════════════════════════════════════════════
let adminLoginType = 'admin';

function toggleAdminDropdown(e) {
  if (e) e.stopPropagation();
  const dd = document.getElementById('admin-dropdown');
  const isOpen = dd.classList.contains('open');
  dd.classList.toggle('open', !isOpen);
}

// Close dropdown when clicking anywhere outside
document.addEventListener('click', function (e) {
  const wrap = document.getElementById('admin-dropdown-wrap');
  if (wrap && !wrap.contains(e.target)) {
    document.getElementById('admin-dropdown')?.classList.remove('open');
  }
});

function closeAdminDropdownOutside() {
  document.getElementById('admin-dropdown')?.classList.remove('open');
}
function openAdminLogin(type) {
  console.log(type === 'admin' ? '[ROLE CLICK] Admin' : '[ROLE CLICK] Sub Admin');

  // Ensure adsense placeholders are not injected dynamically (legacy compat)
  // (Used only for legacy UI; harmless if function doesn't exist.)

  adminLoginType = type;
  window.__aiiensAdminLoginType = type;
  document.getElementById('admin-dropdown').classList.remove('open');
  const isAdmin = type === 'admin';
  document.getElementById('admin-modal-icon').textContent = isAdmin ? '🛡️' : '👤';
  document.getElementById('admin-modal-title').textContent = isAdmin ? 'Admin Login' : 'Sub Admin Login';
  document.getElementById('admin-modal-sub').textContent = isAdmin
    ? 'Enter your admin credentials to access the full dashboard'
    : 'Enter your sub-admin credentials to manage content';
  const userIdInput = document.getElementById('admin-userid');
  const passwordInput = document.getElementById('admin-password');
  [userIdInput, passwordInput].forEach((input) => {
    if (!input) return;
    input.disabled = false;
    input.readOnly = false;
    input.style.removeProperty('pointer-events');
  });
  userIdInput.value = '';
  passwordInput.value = '';
  document.getElementById('admin-login-err').style.display = 'none';
  setModalOpenState('admin-login-modal', true);
  setTimeout(() => userIdInput?.focus(), 0);
}

window.openAdminLogin = openAdminLogin;
// Hardening: make sure it is reachable even if some loaders use globalThis.
globalThis.openAdminLogin = openAdminLogin;


function closeAdminLogin() {
  setModalOpenState('admin-login-modal', false);
}

async function submitAdminLogin() {
  const uid = document.getElementById('admin-userid').value.trim();
  const pwd = document.getElementById('admin-password').value.trim();
  const err = document.getElementById('admin-login-err');
  const client = window.__AIMEASY_SUPABASE__;
  const loginType = window.__aiiensAdminLoginType || adminLoginType || 'admin';

  if (!client) {
    err.style.display = 'block';
    err.innerHTML = '❌ Supabase client not initialized';
    return;
  }

  if (!uid || !pwd) {
    err.style.display = 'block';
    err.innerHTML = '❌ Please fill in all fields';
    return;
  }

  showLoading('Verifying credentials...');

  try {
    const table = loginType === 'admin' ? 'admin_accounts' : 'sub_admin_accounts';
    const { data: account, error: lookupError } = await client
      .from(table)
      .select('*')
      .eq('username', uid)
      .maybeSingle();

    if (lookupError || !account) {
      hideLoading();
      err.style.display = 'block';
      err.innerHTML = '❌ Invalid Admin or Sub Admin credentials';
      return;
    }

    if (account.password !== pwd) {
      hideLoading();
      err.style.display = 'block';
      err.innerHTML = '❌ Invalid Admin or Sub Admin credentials';
      return;
    }

    if (account.status && String(account.status).toLowerCase() !== 'active') {
      hideLoading();
      err.style.display = 'block';
      err.innerHTML = '❌ Account is not active';
      return;
    }

    err.style.display = 'none';
    APP.session = true;
    APP.portalAuth = true;

    if (loginType === 'admin') {
      APP.role = 'admin';
      APP.adminType = 'admin';
      APP.user = account;
      APP.subAdminData = null;

      closeAdminLogin();
      showLoading('Logging in as Administrator...');
      setTimeout(() => {
        hideLoading();
        launchAdminDashboard();
      }, 800);
    } else {
      APP.role = 'subadmin';
      APP.adminType = 'subadmin';
      APP.subAdminData = account;
      APP.user = null;

      closeAdminLogin();
      showLoading('Logging in as Sub Admin...');
      setTimeout(() => {
        hideLoading();
        launchSubAdmin();
      }, 800);
    }
  } catch (ex) {
    hideLoading();
    err.style.display = 'block';
    err.innerHTML = '❌ Error logging in: ' + (ex.message || String(ex));
  }
}


// ═══════════════════════════════════════════════════
//  TASK 2: GOOGLE AUTH
// ═══════════════════
function syncGoogleAuthScreen() {
  if (!APP.role) APP.role = localStorage.getItem('aimeasy_active_role') || 'student';

  const isTeacher = APP.role === 'teacher' || APP.role === 'content_creator' || APP.role === 'creator';
  const titleEl = document.getElementById('google-auth-title');
  const subEl = document.getElementById('google-auth-sub');
  const roleTagEl = document.getElementById('google-auth-role-tag');
  if (titleEl) titleEl.textContent = isTeacher ? 'Sign in as Teacher' : 'Sign in as Student';
  if (subEl) {
    subEl.textContent = isTeacher
      ? 'Choose your Google account to continue as a Teacher. Your content, courses, and teaching resources will be synced automatically.'
      : 'Choose your Google account to continue as a Student. Your progress will be synced automatically.';
  }
  if (roleTagEl) {
    roleTagEl.textContent = isTeacher ? 'Teacher Login' : 'Student Login';
    roleTagEl.style.background = isTeacher ? 'var(--teal-light)' : 'var(--primary-light)';
    roleTagEl.style.color = isTeacher ? 'var(--teal)' : 'var(--primary)';
  }

  const teacherAccounts = document.getElementById('teacher-accounts');
  const studentAccounts = document.getElementById('student-accounts');
  if (teacherAccounts) teacherAccounts.style.display = isTeacher ? 'block' : 'none';
  if (studentAccounts) studentAccounts.style.display = isTeacher ? 'none' : 'block';
}
window.syncGoogleAuthScreen = syncGoogleAuthScreen;

function proceedWithRole() {
  // Teacher bypass
  if (APP.role === 'teacher') {
    if (APP.session && APP.user) {
      showLoading('Signing you in...');
      setTimeout(() => { hideLoading(); launchTeacherPortal(APP.user); }, 900);
      return;
    }
  }

  // Student: if logged in, decide whether we must ask personal/academic
  if (APP.session && APP.user && APP.role !== 'teacher') {
    const user = APP.user || {};
    const hasPersonal = !!(user.name && user.phone);
    const hasAcademic = !!(user.university && user.regulation && user.branch && user.semester);

    if (!hasPersonal) {
      showScreen('screen-profile');
      document.getElementById('profile-step1')?.style && (document.getElementById('profile-step1').style.display = 'block');
      document.getElementById('profile-step2')?.style && (document.getElementById('profile-step2').style.display = 'none');
      document.getElementById('step1')?.classList.add('active');
      document.getElementById('step2')?.classList.remove('active');
      return;
    }

    if (!hasAcademic) {
      showScreen('screen-profile');
      document.getElementById('profile-step1')?.style && (document.getElementById('profile-step1').style.display = 'none');
      document.getElementById('profile-step2')?.style && (document.getElementById('profile-step2').style.display = 'block');
      document.getElementById('step1')?.classList.add('done');
      document.getElementById('step2')?.classList.add('active');
      document.getElementById('step2')?.classList.remove('done');
      return;
    }

    showLoading('Signing you in...');
    setTimeout(() => { hideLoading(); launchApp(); }, 900);
    return;
  }

  if (!APP.role) APP.role = 'student';
  syncGoogleAuthScreen();
  showScreen('screen-google-auth');
}

function googleSignIn(accountType) {
  // IMPORTANT: `accountType` is kept for legacy UI buttons.
  // Real OAuth should happen for actual Google account selection.
  showLoading('Authenticating with Google...');

  try {
    const supabaseClient = window.__AIMEASY_SUPABASE__;
    if (!supabaseClient) {
      window.__aimeasyOAuthStartInFlight = false;
      hideLoading();
      logAuth('Supabase client missing; falling back to legacy mock');
      showToast('Auth not configured (Supabase missing)', 'red');
      return;
    }

    logAuth('OAuth Started (googleSignIn)', {
      accountType,
      role: APP.role,
      href: window.location.href,
    });
    try {
      sessionStorage.setItem('aimeasy_login_portal', APP.role === 'content_creator' ? 'content_creator' : 'student');
    } catch (e) { }

    // Legacy mock accounts are disabled. All roles use the real OAuth path.
    if (false && (accountType === 'teacher1' || accountType === 'teacher2')) {
      const TEACHER_PROFILES = {
        teacher1: { name: 'Prof. Ramesh Kumar', googleId: 'teacher1', email: 'ramesh.kumar@jntuk.edu.in', role: 'teacher', dept: 'CSE', subject: 'Operating Systems' },
        teacher2: { name: 'Prof. Lakshmi Prasad', googleId: 'teacher2', email: 'lakshmi.prasad@jntuk.edu.in', role: 'teacher', dept: 'ECE', subject: 'Digital Electronics' },
      };
      const profile = TEACHER_PROFILES[accountType];
      setTimeout(() => {
        hideLoading();
        APP.role = 'teacher';
        APP.teacherData = profile;
        launchTeacherPortal(profile);
        showToast(`✅ Welcome, ${profile.name}!`, 'green');
      }, 700);
      return;
    }

    // Real Google OAuth for student and content creator accounts.
    // Persist current intended role in-memory; role selection screen already sets APP.role.
    // After redirect, syncSessionFromSupabase() + auth-state listener will route to dashboard.
    window.aimeasyStartGoogleOAuth(APP.role)
      .then(({ data, error }) => {
        logAuth('OAuth signInWithOAuth returned', { data, error });
        if (error) {
          window.__aimeasyOAuthStartInFlight = false;
          hideLoading();
          showToast(`Google sign-in error: ${error.message || String(error)}`, 'red');
        }
        // On success, the browser will redirect; no further UI update needed.
      })
      .catch((e) => {
        window.__aimeasyOAuthStartInFlight = false;
        logAuth('OAuth signInWithOAuth threw', { error: String(e) });
        hideLoading();
        showToast('Google sign-in failed. Check console logs.', 'red');
      });
  } catch (e) {
    window.__aimeasyOAuthStartInFlight = false;
    logAuth('googleSignIn exception', { error: String(e) });
    hideLoading();
  }
}

// ═══════════════════════════════════════════════════
//  TASK 3: DYNAMIC SEMESTER BASED ON YEAR
// ═══════════════════════════════════════════════════
function updateSemesterOptions() {
  const year = document.getElementById('p-year')?.value;
  const semSelect = document.getElementById('p-semester');
  if (!semSelect || !document.getElementById('p-year')) return;
  semSelect.innerHTML = '';
  if (!year) {
    semSelect.innerHTML = '<option value="">Select Year first</option>';
    return;
  }
  const semMap = {
    '1': [{ v: '1-1', l: 'Sem 1-1' }, { v: '1-2', l: 'Sem 1-2' }],
    '2': [{ v: '2-1', l: 'Sem 2-1' }, { v: '2-2', l: 'Sem 2-2' }],
    '3': [{ v: '3-1', l: 'Sem 3-1' }, { v: '3-2', l: 'Sem 3-2' }],
    '4': [{ v: '4-1', l: 'Sem 4-1' }, { v: '4-2', l: 'Sem 4-2' }],
  };
  semSelect.innerHTML = '<option value="">Select Semester</option>' +
    semMap[year].map(s => `<option value="${s.v}">${s.l}</option>`).join('');
}

// Override submitProfile to save branch and persist to localStorage
function submitProfile() {
  const uni = document.getElementById('p-university').value;
  const reg = document.getElementById('p-regulation').value;
  const branch = document.getElementById('p-branch').value;
  const year = document.getElementById('p-year').value;
  const sem = document.getElementById('p-semester').value;
  if (!uni || !reg || !branch || !year || !sem) { showToast('Please fill all academic fields', 'red'); return; }

  const nextUser = {
    ...(APP.user || {}),
    university: uni,
    university_name: uni,
    university_id: APP.user?.university_id || null,

    regulation: reg,
    regulation_code: reg,
    regulation_id: APP.user?.regulation_id || null,

    branch,
    branch_name: branch,
    branch_id: APP.user?.branch_id || null,

    year,
    semester: sem,

    // Mark onboarding completion for both legacy + new profile completion checks
    onboarding_completed: true,
    onboarding_completed_at: new Date().toISOString(),
  };

  APP.user = nextUser;

  // Persist for legacy routing
  localStorage.setItem('edusync_session_user', JSON.stringify(nextUser));
  if (nextUser.googleId) {
    localStorage.setItem('edusync_user_' + nextUser.googleId, JSON.stringify(nextUser));
  }

  showLoading('Setting up your personalized dashboard...');

  // If Supabase flow exists, also upsert onboarding_completed so new auth/profile gating passes.
  // This makes the “Go to Dashboard” button work reliably after Google redirect.
  (async () => {
    try {
      const supabase = window.__AIMEASY_SUPABASE__;
      const authUser = supabase?.auth?.getUser ? (await supabase.auth.getUser()).data?.user : null;
      const authId = authUser?.id || nextUser?.id;

      if (supabase && authId) {
        // Use existing profileService if it was attached globally; otherwise do minimal upsert here.
        if (typeof window.ensureProfileForAuthUser === 'function') {
          await window.ensureProfileForAuthUser(authUser || { id: authId, email: nextUser.email }, window.APP?.role || 'student');
        } else {
          // Minimal upsert matching profileService field names
          await supabase.from('profiles').upsert({
            id: authId,
            full_name: nextUser.full_name || nextUser.name || null,
            name: nextUser.name || nextUser.full_name || null,
            email: nextUser.email || null,
            role: nextUser.role || (window.APP?.role || 'student'),

            phone_number: nextUser.phone_number || nextUser.phone || null,
            phone: nextUser.phone || nextUser.phone_number || null,

            university_id: nextUser.university_id || null,
            university_name: nextUser.university_name || null,

            regulation_id: nextUser.regulation_id || null,
            regulation_code: nextUser.regulation_code || nextUser.regulation || null,

            branch_id: nextUser.branch_id || null,
            branch_name: nextUser.branch_name || nextUser.branch || null,

            semester: nextUser.semester || null,
            year: nextUser.year || null,

            onboarding_completed: true,
            onboarding_completed_at: new Date().toISOString(),
          }, { onConflict: 'id' });
        }
      }
    } catch (e) {
      // Don’t block dashboard launch on Supabase issues; legacy fallback still works.
      console.warn('submitProfile Supabase upsert failed:', e);
    } finally {
      hideLoading();
      launchApp();
    }
  })();
}

// ─── buildSemSwitcher is defined above (subjects section) ───

// ═══════════════════════════════════════════════════
//  TASK 7: VIDEO URL SUGGESTION SYSTEM
// ═══════════════════════════════════════════════════
function submitVideoSuggestion() {
  const input = document.getElementById('suggest-url-input');
  const url = input.value.trim();
  if (!url) { showToast('Please enter a URL', 'red'); return; }
  if (!url.startsWith('http')) { showToast('Please enter a valid URL', 'red'); return; }
  // Store in localStorage as pending request
  const requests = JSON.parse(localStorage.getItem('edusync_url_requests') || '[]');
  const req = {
    id: Date.now(),
    url,
    subject: APP.currentSubject?.name || 'Unknown',
    unit: APP.currentUnit || 1,
    submittedBy: APP.user?.name || 'Student',
    submittedAt: new Date().toLocaleString(),
    status: 'pending'
  };
  requests.push(req);
  localStorage.setItem('edusync_url_requests', JSON.stringify(requests));
  input.value = '';
  renderPendingUrls();
  showToast('✅ URL submitted! Awaiting admin approval.', 'green');
}

function renderPendingUrls() {
  const list = document.getElementById('suggest-pending-list');
  if (!list) return;
  const requests = JSON.parse(localStorage.getItem('edusync_url_requests') || '[]');
  const subReqs = requests.filter(r => r.subject === (APP.currentSubject?.name || ''));
  if (!subReqs.length) { list.innerHTML = ''; return; }
  list.innerHTML = `<div style="font-size:0.78rem;font-weight:700;color:var(--text2);margin-bottom:6px;">Your Submissions:</div>` +
    subReqs.map(r => `
      <div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:4px;font-size:0.78rem;">
        <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text2);">${r.url}</span>
        <span class="badge ${r.status === 'approved' ? 'badge-green' : r.status === 'rejected' ? 'badge-red' : 'badge-amber'}">${r.status === 'approved' ? '✅ Approved' : r.status === 'rejected' ? '❌ Rejected' : '⏳ Pending'}</span>
        ${r.status === 'approved' ? `<button class="btn btn-primary btn-sm" onclick="openApprovedVideo('${r.url}')">Watch</button>` : ''}
      </div>`).join('');
}

function openApprovedVideo(url) {
  // Re-render the video list so the approved video now shows in the sidebar
  const sid = APP.currentSubject?.id || 'os';
  const uid = APP.currentUnit || 1;
  renderVideoList(sid, uid);
  // Find the item index for this URL and select it
  const idx = (APP._videoItems || []).findIndex(v => v.url === url);
  if (idx >= 0) {
    selectVideoItem(idx);
    showToast('▶ Playing approved video!', 'green');
  } else {
    // Fallback: embed directly
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      const videoId = url.match(/(?:v=|youtu\.be\/|embed\/)([^&?/]+)/)?.[1];
      if (videoId) {
        document.querySelector('.video-embed-wrapper').innerHTML = `<iframe width="100%" height="100%" src="https://www.youtube.com/embed/${videoId}" frameborder="0" allowfullscreen style="border-radius:var(--radius-lg);"></iframe>`;
        return;
      }
    }
    window.open(url, '_blank');
  }
}

// ═══════════════════════════════════════════════════
//  TASK 10: ADMIN DASHBOARD (legacy — overridden below)
// ═══════════════════════════════════════════════════
function launchAdminDashboard_LEGACY() {
  // Overridden by new launchAdminDashboard with sidebar
}

function renderAdminDashboard(activeTab) {
  activeTab = activeTab || 'overview';
  const urlRequests = JSON.parse(localStorage.getItem('edusync_url_requests') || '[]');
  const pending = urlRequests.filter(r => r.status === 'pending').length;
  const approved = urlRequests.filter(r => r.status === 'approved').length;
  const rejected = urlRequests.filter(r => r.status === 'rejected').length;
  const customSubjects = JSON.parse(localStorage.getItem('edusync_custom_subjects') || '[]');
  const adminVideos = JSON.parse(localStorage.getItem('edusync_admin_videos') || '[]');
  const adminNotes = JSON.parse(localStorage.getItem('edusync_admin_notes') || '[]');
  const adminPYQs = JSON.parse(localStorage.getItem('edusync_admin_pyqs') || '[]');
  const adminIQs = JSON.parse(localStorage.getItem('edusync_admin_iqs') || '[]');
  const subAdmins = JSON.parse(localStorage.getItem('edusync_subadmins') || '[]');

  const tabs = [
    { id: 'overview', label: '📊 Overview' },
    { id: 'subjects', label: '📚 Subjects' },
    { id: 'videos', label: '🎬 Videos' },
    { id: 'notes', label: '📄 Notes' },
    { id: 'pyq', label: '📝 PYQs' },
    { id: 'iq', label: '⭐ Imp. Questions' },
    { id: 'skills', label: '⚡ Skills Up' },
    { id: 'urls', label: '🔗 URL Requests' },
    { id: 'subadmins', label: '👤 Sub Admins' },
  ];

  const allSubjectNames = [...new Set([...Object.values(SUBJECTS_DB).flat().map(s => s.name), ...customSubjects.map(s => s.name)])].sort();
  const subjectOptions = `<option value="">All Subjects</option>${allSubjectNames.map(n => `<option value="${n}">${n}</option>`).join('')}`;
  const unitOptions = `<option value="">All Units</option>${[1, 2, 3, 4, 5].map(u => `<option value="${u}">Unit ${u}</option>`).join('')}`;

  document.getElementById('admin-content').innerHTML = `
    <div style="margin-bottom:1.5rem;">
      <h2 style="font-size:1.6rem;font-weight:800;letter-spacing:-0.02em;margin-bottom:4px;">Admin Dashboard</h2>
      <p style="font-size:0.88rem;color:var(--text2);">Full control — manage all content, sub admins, and student submissions</p>
    </div>
    <!-- Admin Tabs -->
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:1.6rem;border-bottom:1px solid var(--border);padding-bottom:1rem;">
      ${tabs.map(t => `<button class="btn ${activeTab === t.id ? 'btn-lavender' : 'btn-ghost'} btn-sm" onclick="renderAdminDashboard('${t.id}')">${t.label}${t.id === 'urls' && pending ? ` <span style="background:#fff;color:var(--amber);border-radius:50%;font-size:0.65rem;width:16px;height:16px;display:inline-flex;align-items:center;justify-content:center;margin-left:4px;">${pending}</span>` : ''}${t.id === 'subadmins' ? ` <span style="background:rgba(255,255,255,0.2);border-radius:50px;font-size:0.65rem;padding:0 5px;">${subAdmins.length}</span>` : ''}</button>`).join('')}
    </div>
    <!-- TAB CONTENT -->
    ${activeTab === 'overview' ? `
    <div class="admin-grid">
      <div class="admin-stat-card"><div class="admin-stat-accent" style="background:var(--primary);"></div>
        <div style="font-size:2.2rem;font-weight:800;color:var(--primary);">1,284</div>
        <div style="font-size:0.88rem;font-weight:600;margin-top:4px;">Total Student Logins</div>
        <div style="font-size:0.75rem;color:var(--text3);margin-top:4px;">↑ 12% this week</div></div>
      <div class="admin-stat-card"><div class="admin-stat-accent" style="background:var(--teal);"></div>
        <div style="font-size:2.2rem;font-weight:800;color:var(--teal);">${customSubjects.length + Object.values(SUBJECTS_DB).flat().length}</div>
        <div style="font-size:0.88rem;font-weight:600;margin-top:4px;">Total Subjects</div>
        <div style="font-size:0.75rem;color:var(--text3);margin-top:4px;">${customSubjects.length} custom created</div></div>
      <div class="admin-stat-card"><div class="admin-stat-accent" style="background:var(--amber);"></div>
        <div style="font-size:2.2rem;font-weight:800;color:var(--amber);">${pending}</div>
        <div style="font-size:0.88rem;font-weight:600;margin-top:4px;">Pending URL Requests</div>
        <div style="font-size:0.75rem;color:var(--text3);margin-top:4px;">Needs review</div></div>
      <div class="admin-stat-card"><div class="admin-stat-accent" style="background:var(--green);"></div>
        <div style="font-size:2.2rem;font-weight:800;color:var(--green);">${adminVideos.length}</div>
        <div style="font-size:0.88rem;font-weight:600;margin-top:4px;">Videos Uploaded</div>
        <div style="font-size:0.75rem;color:var(--text3);margin-top:4px;">Across all subjects</div></div>
      <div class="admin-stat-card"><div class="admin-stat-accent" style="background:var(--lavender);"></div>
        <div style="font-size:2.2rem;font-weight:800;color:var(--lavender);">${adminNotes.length}</div>
        <div style="font-size:0.88rem;font-weight:600;margin-top:4px;">Notes Uploaded</div>
        <div style="font-size:0.75rem;color:var(--text3);margin-top:4px;">${adminPYQs.length} PYQs · ${adminIQs.length} IQs</div></div>
      <div class="admin-stat-card"><div class="admin-stat-accent" style="background:var(--red);"></div>
        <div style="font-size:2.2rem;font-weight:800;color:var(--red);">${subAdmins.length}</div>
        <div style="font-size:0.88rem;font-weight:600;margin-top:4px;">Sub Admins</div>
        <div style="font-size:0.75rem;color:var(--text3);margin-top:4px;">Active accounts</div></div>
    </div>
    <div class="admin-pending-list">
      <div class="admin-pending-header"><h4>⏳ Recent URL Requests</h4><span class="badge badge-amber">${pending} pending</span></div>
      ${urlRequests.slice(-5).reverse().map((r, i) => `
        <div class="admin-pending-item">
          <div style="flex:1;min-width:0;">
            <div style="font-size:0.85rem;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${r.url}</div>
            <div style="font-size:0.75rem;color:var(--text3);">${r.subject} · Unit ${r.unit} · by ${r.submittedBy} · ${r.submittedAt}</div>
          </div>
          <span class="badge ${r.status === 'approved' ? 'badge-green' : r.status === 'rejected' ? 'badge-red' : 'badge-amber'}">${r.status}</span>
        </div>`).join('') || '<div style="padding:2rem;text-align:center;color:var(--text3);">No URL requests yet</div>'}
    </div>` : ''}

    ${activeTab === 'subjects' ? `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.4rem;align-items:start;">
      <div class="card">
        <h3 style="margin-bottom:1rem;">➕ Add Subject</h3>
        <div class="form-row">
          <div class="input-group"><label>Branch</label>
            <select class="select" id="adm-branch"><option value="">Select Branch</option>
              ${(window.__aiiensRuntimeBranchNames || []).map(b => `<option>${b}</option>`).join('')}
            </select></div>
          <div class="input-group"><label>Year</label>
            <select class="select" id="adm-year"><option value="">Select Year</option>
              <option value="1">1st</option><option value="2">2nd</option><option value="3">3rd</option><option value="4">4th</option>
            </select></div>
        </div>
        <div class="form-row">
          <div class="input-group"><label>Semester</label>
            <select class="select" id="adm-sem"><option value="">Select Sem</option>
              ${['1-1', '1-2', '2-1', '2-2', '3-1', '3-2', '4-1', '4-2'].map(s => `<option>${s}</option>`).join('')}
            </select></div>
          <div class="input-group"><label>Regulation</label>
            <select class="select" id="adm-reg"><option value="">Regulation</option><option>R23</option><option>R20</option><option>R16</option></select></div>
        </div>
        <div class="input-group"><label>University</label>
          <select class="select" id="adm-uni"><option value="">Select University</option></select></div>
        <div class="input-group"><label>Subject Name</label>
          <input class="input" id="adm-subname" placeholder="e.g. Data Structures"></div>
        <div class="form-row">
          <div class="input-group"><label>Code</label><input class="input" id="adm-subcode" placeholder="CS301"></div>
          <div class="input-group"><label>Credits</label><input class="input" id="adm-credits" type="number" min="1" max="6" value="3"></div>
        </div>
        <button class="btn btn-primary" onclick="adminCreateSubject()" style="width:100%;">+ Create Subject</button>
      </div>
      <div>
        <div class="card" style="margin-bottom:1.2rem;border:2px solid var(--teal-mid);">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.8rem;">
            <h3 style="color:var(--teal);">👤 Sub Admin Created Subjects (${customSubjects.length})</h3>
            <span class="badge badge-teal">${customSubjects.length} subjects</span>
          </div>
          <p style="font-size:0.8rem;color:var(--text2);margin-bottom:1rem;">These subjects were created by sub admins. You can delete them below.</p>
          <div id="adm-subjects-list" style="max-height:400px;overflow-y:auto;">
            ${customSubjects.length ? customSubjects.map(s => `
              <div style="display:flex;align-items:center;gap:8px;padding:10px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:6px;font-size:0.82rem;background:var(--teal-light);">
                <div style="flex:1;">
                  <div style="font-weight:600;">${s.name} <span class="badge badge-primary">${s.code}</span></div>
                  <div style="font-size:0.72rem;color:var(--text3);margin-top:2px;">${s.branch} · ${s.sem} · ${s.reg} · ${s.uni}</div>
                </div>
                <span class="badge badge-teal">${s.branch}</span>
                <button class="btn btn-danger btn-sm" onclick="adminDeleteSubject(${s.id});renderAdminDashboard('subjects')">🗑 Delete</button>
              </div>`).join('') : '<div style="color:var(--text3);text-align:center;padding:1.5rem;">No sub admin subjects yet</div>'}
          </div>
        </div>
      </div>
    </div>` : ''}

    ${activeTab === 'videos' ? `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.4rem;align-items:start;">
      <div class="card">
        <h3 style="margin-bottom:1rem;">🎬 Add/Edit Video</h3>
        <div class="input-group"><label>Title</label><input class="input" id="adm-vtitle" placeholder="e.g. Unit 1 Introduction Video"></div>
        <div class="input-group"><label>YouTube / Video URL</label><input class="input" id="adm-vurl" placeholder="https://youtube.com/watch?v=..."></div>
        <div class="form-row">
          <div class="input-group"><label>Subject</label><select class="select" id="adm-vsubject">${subjectOptions}</select></div>
          <div class="input-group"><label>Unit</label><select class="select" id="adm-vunit">${unitOptions}</select></div>
        </div>
        <button class="btn btn-primary" onclick="adminUploadVideo()" style="width:100%;">📤 Upload Video</button>
      </div>
      <div class="card">
        <h3 style="margin-bottom:1rem;">All Videos (${adminVideos.length})</h3>
        <div style="max-height:500px;overflow-y:auto;">
          ${adminVideos.length ? adminVideos.map(v => `
            <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:6px;font-size:0.82rem;">
              <div style="flex:1;">
                <div style="font-weight:600;">🎬 ${v.title}</div>
                <div style="font-size:0.72rem;color:var(--text3);">${v.subject || 'All'} · Unit ${v.unit || 'All'}</div>
                <div style="font-size:0.68rem;color:var(--primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${v.url}</div>
              </div>
              <span class="badge badge-green">Live</span>
              <button class="btn btn-danger btn-sm" onclick="adminDeleteVideo(${v.id});renderAdminDashboard('videos')">✕</button>
            </div>`).join('') : '<div style="color:var(--text3);text-align:center;padding:1.5rem;">No videos yet</div>'}
        </div>
      </div>
    </div>` : ''}

    ${activeTab === 'notes' ? `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.4rem;align-items:start;">
      <div class="card">
        <h3 style="margin-bottom:1rem;">📄 Add/Edit Notes</h3>
        <div class="input-group"><label>Notes Title</label><input class="input" id="adm-ntitle" placeholder="e.g. Unit 1 Handwritten Notes"></div>
        <div class="form-row">
          <div class="input-group"><label>Type</label>
            <select class="select" id="adm-ntype"><option value="pdf">📄 PDF</option><option value="doc">📝 DOC</option><option value="link">🔗 Link</option></select></div>
          <div class="input-group"><label>Unit</label><select class="select" id="adm-nunit">${unitOptions}</select></div>
        </div>
        <div class="input-group"><label>Subject</label><select class="select" id="adm-nsubject">${subjectOptions}</select></div>
        <div class="input-group"><label>Link / URL (Google Drive, PDF link)</label>
          <input class="input" id="adm-nlink" placeholder="https://..."></div>
        <button class="btn btn-primary" onclick="adminUploadNotes()" style="width:100%;">📤 Upload Notes</button>
      </div>
      <div class="card">
        <h3 style="margin-bottom:1rem;">All Notes (${adminNotes.length})</h3>
        <div style="max-height:500px;overflow-y:auto;">
          ${adminNotes.length ? adminNotes.map(n => `
            <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:6px;font-size:0.82rem;">
              <div style="flex:1;">
                <div style="font-weight:600;">${n.type === 'pdf' ? '📄' : n.type === 'doc' ? '📝' : '🔗'} ${n.title}</div>
                <div style="font-size:0.72rem;color:var(--text3);">${n.subject || 'All'} · Unit ${n.unit || 'All'} · ${n.type?.toUpperCase()}</div>
              </div>
              <span class="badge badge-green">Live</span>
              <button class="btn btn-danger btn-sm" onclick="adminDeleteNote(${n.id});renderAdminDashboard('notes')">✕</button>
            </div>`).join('') : '<div style="color:var(--text3);text-align:center;padding:1.5rem;">No notes yet</div>'}
        </div>
      </div>
    </div>` : ''}

    ${activeTab === 'pyq' ? `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.4rem;align-items:start;">
      <div class="card">
        <h3 style="margin-bottom:1rem;">📝 Add/Edit PYQ</h3>
        <div class="form-row">
          <div class="input-group"><label>Exam Year</label><input class="input" id="adm-pyqyear" placeholder="2023" type="number"></div>
          <div class="input-group"><label>Repeated Count</label><input class="input" id="adm-pyqcount" placeholder="e.g. 3" type="number" value="1"></div>
        </div>
        <div class="input-group"><label>Question</label>
          <textarea class="input" id="adm-pyqtext" rows="3" placeholder="Type the question..." style="resize:vertical;"></textarea></div>
        <div class="input-group"><label>Answer (optional)</label>
          <textarea class="input" id="adm-pyqans" rows="2" placeholder="Type the answer..." style="resize:vertical;"></textarea></div>
        <div class="form-row">
          <div class="input-group"><label>Subject</label><select class="select" id="adm-pyqsubject">${subjectOptions}</select></div>
          <div class="input-group"><label>Unit</label><select class="select" id="adm-pyqunit">${unitOptions}</select></div>
        </div>
        <button class="btn btn-primary" onclick="adminUploadPYQ()" style="width:100%;">📤 Upload PYQ</button>
      </div>
      <div class="card">
        <h3 style="margin-bottom:1rem;">All PYQs (${adminPYQs.length})</h3>
        <div style="max-height:500px;overflow-y:auto;">
          ${adminPYQs.length ? adminPYQs.map(p => `
            <div style="display:flex;align-items:flex-start;gap:8px;padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:6px;font-size:0.82rem;">
              <div style="flex:1;">
                <div style="font-weight:600;line-height:1.4;">${p.question.substring(0, 80)}${p.question.length > 80 ? '...' : ''}</div>
                <div style="font-size:0.72rem;color:var(--text3);">${p.subject || 'All'} · Unit ${p.unit || 'All'} · ${p.year} · ×${p.count}</div>
              </div>
              <span class="badge badge-green">Live</span>
              <button class="btn btn-danger btn-sm" onclick="adminDeletePYQ(${p.id});renderAdminDashboard('pyq')">✕</button>
            </div>`).join('') : '<div style="color:var(--text3);text-align:center;padding:1.5rem;">No PYQs yet</div>'}
        </div>
      </div>
    </div>` : ''}

    ${activeTab === 'iq' ? `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.4rem;align-items:start;">
      <div class="card">
        <h3 style="margin-bottom:1rem;">⭐ Add/Edit Important Question</h3>
        <div class="input-group"><label>Question</label>
          <textarea class="input" id="adm-iqtext" rows="3" placeholder="Type the important question..." style="resize:vertical;"></textarea></div>
        <div class="form-row">
          <div class="input-group"><label>Priority</label>
            <select class="select" id="adm-iqpriority">
              <option value="high">🔴 High Priority</option>
              <option value="med">🟡 Medium Priority</option>
              <option value="low">🟢 Low Priority</option>
            </select></div>
          <div class="input-group"><label>Tags (comma separated)</label>
            <input class="input" id="adm-iqtags" placeholder="Unit 1, Memory"></div>
        </div>
        <div class="form-row">
          <div class="input-group"><label>Subject</label><select class="select" id="adm-iqsubject">${subjectOptions}</select></div>
          <div class="input-group"><label>Unit</label><select class="select" id="adm-iqunit">${unitOptions}</select></div>
        </div>
        <button class="btn btn-primary" onclick="adminUploadIQ()" style="width:100%;">+ Add Question</button>
      </div>
      <div class="card">
        <h3 style="margin-bottom:1rem;">All Imp. Questions (${adminIQs.length})</h3>
        <div style="max-height:500px;overflow-y:auto;">
          ${adminIQs.length ? adminIQs.map(q => `
            <div style="display:flex;align-items:flex-start;gap:8px;padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:6px;font-size:0.82rem;">
              <div style="flex:1;">
                <div style="font-weight:600;line-height:1.4;">${q.question.substring(0, 80)}${q.question.length > 80 ? '...' : ''}</div>
                <div style="display:flex;gap:4px;margin-top:4px;flex-wrap:wrap;">
                  <span class="badge ${q.priority === 'high' ? 'badge-red' : q.priority === 'med' ? 'badge-amber' : 'badge-green'}">${q.priority}</span>
                  <span class="badge badge-teal">${q.subject || 'All'}</span>
                </div>
              </div>
              <button class="btn btn-danger btn-sm" onclick="adminDeleteIQ(${q.id});renderAdminDashboard('iq')">✕</button>
            </div>`).join('') : '<div style="color:var(--text3);text-align:center;padding:1.5rem;">No important questions yet</div>'}
        </div>
      </div>
    </div>` : ''}

    ${activeTab === 'skills' ? `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.4rem;align-items:start;">
      <div class="card">
        <h3 style="margin-bottom:1rem;">⚡ Add Skill Course</h3>
        <div class="input-group"><label>Skill Name</label><input class="input" id="adm-skillname" placeholder="e.g. Python Programming"></div>
        <div class="input-group"><label>Description</label><textarea class="input" id="adm-skilldesc" rows="2" placeholder="Brief description of this skill..." style="resize:vertical;"></textarea></div>
        <div class="form-row">
          <div class="input-group"><label>Category</label>
            <select class="select" id="adm-skillcat">
              <option value="coding">💻 Coding</option>
              <option value="aptitude">🧠 Aptitude</option>
              <option value="communication">🗣️ Communication</option>
              <option value="ai">🤖 AI & ML</option>
              <option value="certification">🏆 Certification</option>
              <option value="other">⭐ Other</option>
            </select></div>
          <div class="input-group"><label>Level</label>
            <select class="select" id="adm-skilllevel">
              <option value="Beginner">🟢 Beginner</option>
              <option value="Intermediate">🟡 Intermediate</option>
              <option value="Advanced">🔴 Advanced</option>
            </select></div>
        </div>
        <div class="form-row">
          <div class="input-group"><label>Icon (emoji)</label><input class="input" id="adm-skillicon" placeholder="e.g. 💻" maxlength="4"></div>
          <div class="input-group"><label>Duration</label><input class="input" id="adm-skillduration" placeholder="e.g. 8 hours"></div>
        </div>
        <button class="btn btn-primary" onclick="adminCreateSkill()" style="width:100%;margin-bottom:1rem;">⚡ Create Skill Course</button>
        
        <hr style="border-color:var(--border);margin:1rem 0;">
        <h4 style="margin-bottom:0.8rem;">🎬 Add Video to Skill</h4>
        <div class="input-group"><label>Skill</label>
          <select class="select" id="adm-skillvid-skill">${(() => { const sk = JSON.parse(localStorage.getItem('edusync_skills') || '[]'); return sk.length ? sk.map(s => `<option value="${s.id}">${s.name}</option>`).join('') : '<option value="">No skills yet</option>'; })()}</select></div>
        <div class="input-group"><label>Video Title</label><input class="input" id="adm-skillvid-title" placeholder="e.g. Intro to Python"></div>
        <div class="input-group"><label>YouTube URL</label><input class="input" id="adm-skillvid-url" placeholder="https://youtube.com/watch?v=..." type="url"></div>
        <div class="input-group"><label>Topic/Subtopic Name</label><input class="input" id="adm-skillvid-topic" placeholder="e.g. Variables and Data Types"></div>
        <button class="btn btn-teal" onclick="adminAddSkillVideo()" style="width:100%;">📤 Add Video</button>

        <hr style="border-color:var(--border);margin:1rem 0;">
        <h4 style="margin-bottom:0.8rem;">📄 Add Notes to Skill</h4>
        <div class="input-group"><label>Skill</label>
          <select class="select" id="adm-skillnote-skill">${(() => { const sk = JSON.parse(localStorage.getItem('edusync_skills') || '[]'); return sk.length ? sk.map(s => `<option value="${s.id}">${s.name}</option>`).join('') : '<option value="">No skills yet</option>'; })()}</select></div>
        <div class="input-group"><label>Notes Title</label><input class="input" id="adm-skillnote-title" placeholder="e.g. Python Cheatsheet"></div>
        <div class="input-group"><label>Link (PDF/Google Drive)</label><input class="input" id="adm-skillnote-url" placeholder="https://..." type="url"></div>
        <button class="btn btn-lavender" onclick="adminAddSkillNote()" style="width:100%;">📤 Add Notes</button>
      </div>
      <div class="card">
        <h3 style="margin-bottom:1rem;">⚡ All Skill Courses (${JSON.parse(localStorage.getItem('edusync_skills') || '[]').length})</h3>
        <div style="max-height:600px;overflow-y:auto;">
          ${(() => {
        const skills = JSON.parse(localStorage.getItem('edusync_skills') || '[]');
        const skillVideos = JSON.parse(localStorage.getItem('edusync_skill_videos') || '[]');
        const skillNotes = JSON.parse(localStorage.getItem('edusync_skill_notes') || '[]');
        if (!skills.length) return '<div style="color:var(--text3);text-align:center;padding:1.5rem;">No skill courses yet</div>';
        return skills.map(s => {
          const vids = skillVideos.filter(v => v.skillId == s.id);
          const notes = skillNotes.filter(n => n.skillId == s.id);
          return `
              <div style="border:1px solid var(--border);border-radius:var(--radius-md);margin-bottom:10px;overflow:hidden;">
                <div style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:var(--lavender-light);">
                  <span style="font-size:1.4rem;">${s.icon || '⚡'}</span>
                  <div style="flex:1;">
                    <div style="font-weight:700;font-size:0.9rem;">${s.name}</div>
                    <div style="font-size:0.72rem;color:var(--text3);">${s.category} · ${s.level} · ${vids.length} videos · ${notes.length} notes</div>
                  </div>
                  <button class="btn btn-danger btn-sm" onclick="adminDeleteSkill(${s.id});renderAdminDashboard('skills')">🗑 Delete</button>
                </div>
                ${vids.length ? '<div style="padding:6px 12px;background:var(--surface2);font-size:0.78rem;">' + vids.map(v => `<div style="display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid var(--border);">🎬 <span style="flex:1;">${v.title}</span><button class="btn btn-danger btn-sm" style="padding:2px 8px;font-size:0.7rem;" onclick="adminDeleteSkillVideo(${v.id});renderAdminDashboard('skills')">✕</button></div>`).join('') + '</div>' : ''}
                ${notes.length ? '<div style="padding:6px 12px;background:var(--surface2);font-size:0.78rem;">' + notes.map(n => `<div style="display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid var(--border);">📄 <span style="flex:1;">${n.title}</span><button class="btn btn-danger btn-sm" style="padding:2px 8px;font-size:0.7rem;" onclick="adminDeleteSkillNote(${n.id});renderAdminDashboard('skills')">✕</button></div>`).join('') + '</div>' : ''}
              </div>`;
        }).join('');
      })()}
        </div>
      </div>
    </div>` : ''}

    ${activeTab === 'urls' ? `
    <div class="card">
      <h3 style="margin-bottom:1rem;">🔗 Student URL Requests — Approve or Reject</h3>
      <div id="adm-url-list">
        ${urlRequests.length ? urlRequests.map((r, i) => `
          <div style="display:flex;align-items:flex-start;gap:10px;padding:12px;border:1px solid var(--border);border-radius:var(--radius-md);margin-bottom:8px;">
            <div style="flex:1;min-width:0;">
              <div style="font-size:0.88rem;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${r.url}</div>
              <div style="font-size:0.75rem;color:var(--text3);margin-top:2px;">${r.subject} · Unit ${r.unit} · by ${r.submittedBy} · ${r.submittedAt}</div>
            </div>
            <span class="badge ${r.status === 'approved' ? 'badge-green' : r.status === 'rejected' ? 'badge-red' : 'badge-amber'}">${r.status}</span>
            ${r.status === 'pending' ? `
              <button class="btn btn-teal btn-sm" onclick="adminApproveUrl(${i})">✅ Approve</button>
              <button class="btn btn-danger btn-sm" onclick="adminRejectUrl(${i})">❌ Reject</button>
            `: ''}
          </div>`).join('') : '<div style="padding:2rem;text-align:center;color:var(--text3);">No URL requests yet</div>'}
      </div>
    </div>` : ''}

    ${activeTab === 'subadmins' ? `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.4rem;align-items:start;">
      <div class="card">
        <h3 style="margin-bottom:1rem;">➕ Create Sub Admin</h3>
        <div class="form-row">
          <div class="input-group"><label>Username</label><input class="input" id="adm-sa-user" placeholder="e.g. ravi_cse"></div>
          <div class="input-group"><label>Password</label><input class="input" id="adm-sa-pass" type="password" placeholder="Set password"></div>
        </div>
        <div class="input-group"><label>Branch</label>
          <select class="select" id="adm-sa-branch"><option value="">Select Branch</option>
            ${(window.__aiiensRuntimeBranchNames || []).map(b => `<option>${b}</option>`).join('')}
          </select></div>
        <div id="adm-sa-err" style="display:none;font-size:0.82rem;color:var(--red);margin-bottom:10px;padding:8px 12px;background:var(--red-light);border-radius:var(--radius-sm);"></div>
        <div id="adm-sa-ok" style="display:none;font-size:0.82rem;color:var(--green);margin-bottom:10px;padding:8px 12px;background:var(--green-light);border-radius:var(--radius-sm);"></div>
        <button class="btn btn-primary" onclick="adminCreateSubAdmin()" style="width:100%;">Create Sub Admin</button>
      </div>
      <div class="card">
        <h3 style="margin-bottom:1rem;">All Sub Admins (${subAdmins.length})</h3>
        <div style="max-height:500px;overflow-y:auto;">
          ${subAdmins.length ? subAdmins.map((sa, i) => `
            <div style="display:flex;align-items:center;gap:8px;padding:10px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:6px;font-size:0.82rem;">
              <div style="flex:1;">
                <div style="font-weight:600;">${sa.username}</div>
                <div style="font-size:0.72rem;color:var(--text3);">${sa.branch} · Created: ${sa.createdAt}</div>
              </div>
              <span class="badge badge-green">Active</span>
              <button class="btn btn-danger btn-sm" onclick="adminDeleteSubAdmin(${i});renderAdminDashboard('subadmins')">✕</button>
            </div>`).join('') : '<div style="color:var(--text3);text-align:center;padding:1.5rem;">No sub admins created yet</div>'}
        </div>
      </div>
    </div>` : ''}
  `;
}

// ─── Admin CRUD helpers ───────────────────────────────────────────────────────
function adminCreateSubject() {
  const branch = document.getElementById('adm-branch')?.value;
  const year = document.getElementById('adm-year')?.value;
  const sem = document.getElementById('adm-sem')?.value;
  const reg = document.getElementById('adm-reg')?.value;
  const uni = document.getElementById('adm-uni')?.value;
  const name = document.getElementById('adm-subname')?.value.trim();
  const code = document.getElementById('adm-subcode')?.value.trim();
  const credits = document.getElementById('adm-credits')?.value;
  if (!branch || !year || !sem || !reg || !uni || !name || !code) { showToast('Fill all fields', 'red'); return; }
  const subjects = JSON.parse(localStorage.getItem('edusync_custom_subjects') || '[]');
  subjects.push({ branch, year, sem, reg, uni, name, code, credits, id: Date.now() });
  localStorage.setItem('edusync_custom_subjects', JSON.stringify(subjects));
  showToast('✅ Subject created and live!', 'green');
  renderAdminDashboard('subjects');
}
function adminDeleteSubject(id) {
  const subjects = JSON.parse(localStorage.getItem('edusync_custom_subjects') || '[]');
  localStorage.setItem('edusync_custom_subjects', JSON.stringify(subjects.filter(s => s.id !== id)));
  showToast('Subject deleted', 'red');
}
function adminUploadVideo() {
  const title = document.getElementById('adm-vtitle')?.value.trim();
  const url = document.getElementById('adm-vurl')?.value.trim();
  const subject = document.getElementById('adm-vsubject')?.value;
  const unit = document.getElementById('adm-vunit')?.value;
  if (!title || !url) { showToast('Fill title and URL', 'red'); return; }
  const videos = JSON.parse(localStorage.getItem('edusync_admin_videos') || '[]');
  videos.push({ id: Date.now(), title, url, subject, unit: unit ? parseInt(unit) : null, uploadedAt: new Date().toLocaleString() });
  localStorage.setItem('edusync_admin_videos', JSON.stringify(videos));
  showToast('✅ Video uploaded and live!', 'green');
  renderAdminDashboard('videos');
}
function adminDeleteVideo(id) {
  const v = JSON.parse(localStorage.getItem('edusync_admin_videos') || '[]');
  localStorage.setItem('edusync_admin_videos', JSON.stringify(v.filter(x => x.id !== id)));
  showToast('Video deleted', 'red');
}
function adminUploadNotes() {
  const title = document.getElementById('adm-ntitle')?.value.trim();
  const type = document.getElementById('adm-ntype')?.value;
  const unit = document.getElementById('adm-nunit')?.value;
  const subject = document.getElementById('adm-nsubject')?.value;
  const link = document.getElementById('adm-nlink')?.value.trim();
  if (!title) { showToast('Fill title', 'red'); return; }
  const notes = JSON.parse(localStorage.getItem('edusync_admin_notes') || '[]');
  notes.push({ id: Date.now(), title, type, subject, unit: unit ? parseInt(unit) : null, link, uploadedAt: new Date().toLocaleString() });
  localStorage.setItem('edusync_admin_notes', JSON.stringify(notes));
  showToast('✅ Notes uploaded and live!', 'green');
  renderAdminDashboard('notes');
}
function adminDeleteNote(id) {
  const n = JSON.parse(localStorage.getItem('edusync_admin_notes') || '[]');
  localStorage.setItem('edusync_admin_notes', JSON.stringify(n.filter(x => x.id !== id)));
  showToast('Note deleted', 'red');
}
function adminUploadPYQ() {
  const year = document.getElementById('adm-pyqyear')?.value;
  const count = document.getElementById('adm-pyqcount')?.value;
  const question = document.getElementById('adm-pyqtext')?.value.trim();
  const answer = document.getElementById('adm-pyqans')?.value.trim();
  const subject = document.getElementById('adm-pyqsubject')?.value;
  const unit = document.getElementById('adm-pyqunit')?.value;
  if (!question || !year) { showToast('Fill question and year', 'red'); return; }
  const pyqs = JSON.parse(localStorage.getItem('edusync_admin_pyqs') || '[]');
  pyqs.push({ id: Date.now(), question, answer, year, count: parseInt(count) || 1, subject, unit: unit ? parseInt(unit) : null });
  localStorage.setItem('edusync_admin_pyqs', JSON.stringify(pyqs));
  showToast('✅ PYQ added and live!', 'green');
  renderAdminDashboard('pyq');
}
function adminDeletePYQ(id) {
  const p = JSON.parse(localStorage.getItem('edusync_admin_pyqs') || '[]');
  localStorage.setItem('edusync_admin_pyqs', JSON.stringify(p.filter(x => x.id !== id)));
  showToast('PYQ deleted', 'red');
}
function adminUploadIQ() {
  const question = document.getElementById('adm-iqtext')?.value.trim();
  const priority = document.getElementById('adm-iqpriority')?.value;
  const tags = document.getElementById('adm-iqtags')?.value;
  const subject = document.getElementById('adm-iqsubject')?.value;
  const unit = document.getElementById('adm-iqunit')?.value;
  if (!question) { showToast('Fill question', 'red'); return; }
  const iqs = JSON.parse(localStorage.getItem('edusync_admin_iqs') || '[]');
  iqs.push({ id: Date.now(), question, priority, tags, subject, unit: unit ? parseInt(unit) : null });
  localStorage.setItem('edusync_admin_iqs', JSON.stringify(iqs));
  showToast('✅ Important question added!', 'green');
  renderAdminDashboard('iq');
}
function adminDeleteIQ(id) {
  const q = JSON.parse(localStorage.getItem('edusync_admin_iqs') || '[]');
  localStorage.setItem('edusync_admin_iqs', JSON.stringify(q.filter(x => x.id !== id)));
  showToast('Question deleted', 'red');
}
async function adminCreateSubAdmin() {
  const username = document.getElementById('adm-sa-user')?.value.trim();
  const password = document.getElementById('adm-sa-pass')?.value.trim();
  const branch = document.getElementById('adm-sa-branch')?.value;
  const errEl = document.getElementById('adm-sa-err');
  const okEl = document.getElementById('adm-sa-ok');
  if (!username || !password || !branch) {
    if (errEl) { errEl.textContent = 'Fill all fields (User ID, Password, Branch)'; errEl.style.display = 'block'; }
    return;
  }
  if (errEl) errEl.style.display = 'none';
  const subAdmins = JSON.parse(localStorage.getItem('edusync_subadmins') || '[]');
  if (subAdmins.find(sa => sa.username === username)) {
    if (errEl) { errEl.textContent = 'User ID already exists'; errEl.style.display = 'block'; }
    return;
  }
  subAdmins.push({ username, password, branch, createdAt: new Date().toLocaleString() });
  localStorage.setItem('edusync_subadmins', JSON.stringify(subAdmins));
  console.log('STARTING SUBADMIN INSERT', username);
  if (window.supabase) {
    const { data, error } = await window.supabase
      .from('sub_admin_accounts')
      .insert([
        {
          username,
          password,
          status: 'active'
        }
      ])
      .select();

    console.log('INSERT DATA:', data);
    console.log('INSERT ERROR:', error);

    if (error) {
      console.error('SUBADMIN INSERT ERROR:', error);
      showToast('❌ Failed to save subadmin to database', 'red');
    } else {
      console.log('SUBADMIN INSERT SUCCESS:', username);
    }
  }
  if (okEl) { okEl.textContent = '✅ Sub Admin "' + username + '" created for branch ' + branch; okEl.style.display = 'block'; setTimeout(() => { if (okEl) okEl.style.display = 'none'; }, 3000); }
  showToast('✅ Sub Admin created!', 'green');
  renderAdminDashboard('subadmins');
}
function adminDeleteSubAdmin(index) {
  const subAdmins = JSON.parse(localStorage.getItem('edusync_subadmins') || '[]');
  subAdmins.splice(index, 1);
  localStorage.setItem('edusync_subadmins', JSON.stringify(subAdmins));
  showToast('Sub Admin deleted', 'red');
}

// ─── Admin Skills Up CRUD ─────────────────────────────────────────────────────
function adminCreateSkill() {
  const name = document.getElementById('adm-skillname')?.value.trim();
  const desc = document.getElementById('adm-skilldesc')?.value.trim();
  const category = document.getElementById('adm-skillcat')?.value;
  const level = document.getElementById('adm-skilllevel')?.value;
  const icon = document.getElementById('adm-skillicon')?.value.trim() || '⚡';
  const duration = document.getElementById('adm-skillduration')?.value.trim() || 'Self-paced';
  if (!name) { showToast('Enter skill name', 'red'); return; }
  const skills = JSON.parse(localStorage.getItem('edusync_skills') || '[]');
  skills.push({ id: Date.now(), name, description: desc, category, level, icon, duration, topics: 5 });
  localStorage.setItem('edusync_skills', JSON.stringify(skills));
  showToast('✅ Skill course created!', 'green');
  renderAdminDashboard('skills');
}
function adminDeleteSkill(id) {
  const skills = JSON.parse(localStorage.getItem('edusync_skills') || '[]');
  localStorage.setItem('edusync_skills', JSON.stringify(skills.filter(s => s.id !== id)));
  // Also delete associated videos and notes
  const vids = JSON.parse(localStorage.getItem('edusync_skill_videos') || '[]');
  localStorage.setItem('edusync_skill_videos', JSON.stringify(vids.filter(v => v.skillId !== id)));
  const notes = JSON.parse(localStorage.getItem('edusync_skill_notes') || '[]');
  localStorage.setItem('edusync_skill_notes', JSON.stringify(notes.filter(n => n.skillId !== id)));
  showToast('Skill course deleted', 'red');
}
function adminAddSkillVideo() {
  const skillId = document.getElementById('adm-skillvid-skill')?.value;
  const title = document.getElementById('adm-skillvid-title')?.value.trim();
  const url = document.getElementById('adm-skillvid-url')?.value.trim();
  const topic = document.getElementById('adm-skillvid-topic')?.value.trim();
  if (!skillId || !title || !url) { showToast('Fill all fields', 'red'); return; }
  const vids = JSON.parse(localStorage.getItem('edusync_skill_videos') || '[]');
  vids.push({ id: Date.now(), skillId: parseInt(skillId), title, url, topic, addedAt: new Date().toLocaleString() });
  localStorage.setItem('edusync_skill_videos', JSON.stringify(vids));
  showToast('✅ Video added to skill!', 'green');
  renderAdminDashboard('skills');
}
function adminDeleteSkillVideo(id) {
  const vids = JSON.parse(localStorage.getItem('edusync_skill_videos') || '[]');
  localStorage.setItem('edusync_skill_videos', JSON.stringify(vids.filter(v => v.id !== id)));
  showToast('Video removed', 'red');
}
function adminAddSkillNote() {
  const skillId = document.getElementById('adm-skillnote-skill')?.value;
  const title = document.getElementById('adm-skillnote-title')?.value.trim();
  const url = document.getElementById('adm-skillnote-url')?.value.trim();
  if (!skillId || !title) { showToast('Fill all fields', 'red'); return; }
  const notes = JSON.parse(localStorage.getItem('edusync_skill_notes') || '[]');
  notes.push({ id: Date.now(), skillId: parseInt(skillId), title, url, addedAt: new Date().toLocaleString() });
  localStorage.setItem('edusync_skill_notes', JSON.stringify(notes));
  showToast('✅ Notes added to skill!', 'green');
  renderAdminDashboard('skills');
}
function adminDeleteSkillNote(id) {
  const notes = JSON.parse(localStorage.getItem('edusync_skill_notes') || '[]');
  localStorage.setItem('edusync_skill_notes', JSON.stringify(notes.filter(n => n.id !== id)));
  showToast('Notes removed', 'red');
}

function adminApproveUrl(index) {
  const requests = JSON.parse(localStorage.getItem('edusync_url_requests') || '[]');
  if (requests[index]) { requests[index].status = 'approved'; }
  localStorage.setItem('edusync_url_requests', JSON.stringify(requests));
  renderAdminDashboard('urls');
  renderSAUrlRequests();
  showToast('✅ URL approved!', 'green');
}

function adminRejectUrl(index) {
  const requests = JSON.parse(localStorage.getItem('edusync_url_requests') || '[]');
  if (requests[index]) { requests[index].status = 'rejected'; }
  localStorage.setItem('edusync_url_requests', JSON.stringify(requests));
  renderAdminDashboard('urls');
  renderSAUrlRequests();
  showToast('❌ URL request rejected.', 'red');
}

function adminLogout() {
  APP.adminType = null;
  showScreen('screen-landing');
  showToast('Logged out of admin', 'blue');
}

// ═══════════════════════════════════════════════════
//  TASKS 11-15: SUB ADMIN SYSTEM (legacy helpers kept)
// ═══════════════════════════════════════════════════
function launchSubAdmin_LEGACY() {
  // Overridden by new launchSubAdmin defined later
}

function subAdminBack_LEGACY() {
  // Overridden
}

function switchSubAdminTab(tab, el) {
  document.querySelectorAll('.subadmin-tab').forEach(t => t.classList.remove('active'));
  if (el) el.classList.add('active');
  const content = document.getElementById('subadmin-tab-content');

  if (tab === 'subjects') {
    content.innerHTML = `
      <div class="card" style="max-width:560px;">
        <h3 style="margin-bottom:1.2rem;">📚 Create Subject</h3>
        <div class="form-row">
          <div class="input-group"><label>Branch</label>
            <select class="select" id="sa-branch"><option value="">Select Branch</option>
              ${(window.__aiiensRuntimeBranchNames || []).map(b => `<option>${b}</option>`).join('')}
            </select></div>
          <div class="input-group"><label>Year</label>
            <select class="select" id="sa-year"><option value="">Select Year</option>
              <option value="1">1st Year</option><option value="2">2nd Year</option>
              <option value="3">3rd Year</option><option value="4">4th Year</option>
            </select></div>
        </div>
        <div class="form-row">
          <div class="input-group"><label>Semester</label>
            <select class="select" id="sa-sem"><option value="">Select Semester</option>
              ${['1-1', '1-2', '2-1', '2-2', '3-1', '3-2', '4-1', '4-2'].map(s => `<option>${s}</option>`).join('')}
            </select></div>
          <div class="input-group"><label>Regulation</label>
            <select class="select" id="sa-reg"><option value="">Select Regulation</option>
              <option>R23</option><option>R20</option></select></div>
        </div>
        <div class="input-group"><label>University</label>
          <select class="select" id="sa-uni"><option value="">Select University</option>
            <option value="">Select University</option>
          </select></div>
        <div class="input-group"><label>Subject Name</label>
          <input class="input" id="sa-subname" placeholder="e.g. Data Structures and Algorithms"></div>
        <div class="form-row">
          <div class="input-group"><label>Subject Code</label>
            <input class="input" id="sa-subcode" placeholder="e.g. CS301"></div>
          <div class="input-group"><label>Credits</label>
            <input class="input" id="sa-credits" placeholder="e.g. 3" type="number" min="1" max="5"></div>
        </div>
        <button class="btn btn-lavender" onclick="createSubject()" style="width:100%;margin-top:0.5rem;">+ Create Subject</button>
        <div id="sa-subjects-list" style="margin-top:1.2rem;"></div>
      </div>
      <!-- Learning Roadmap Creator (shown after subject is created) -->
      <div id="sa-roadmap-creator" style="display:none;margin-top:1.4rem;max-width:900px;">
        <div class="card">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.2rem;">
            <div>
              <h3 style="margin-bottom:4px;">📍 Create Learning Roadmap</h3>
              <p style="font-size:0.82rem;color:var(--text2);">Define subtopics for each of the 5 units. Students will see these as their learning path.</p>
            </div>
            <span id="sa-roadmap-subject-label" class="badge badge-lavender" style="font-size:0.8rem;padding:6px 14px;"></span>
          </div>
          <div id="sa-roadmap-units" style="display:flex;flex-direction:column;gap:1rem;"></div>
          <button class="btn btn-primary" onclick="saveRoadmap()" style="width:100%;margin-top:1.2rem;">💾 Save Learning Roadmap</button>
        </div>
      </div>`;
    renderSASubjects();
  } else if (tab === 'videos') {
    // Build subject options from both builtin and custom subjects
    const customSubjects = JSON.parse(localStorage.getItem('edusync_custom_subjects') || '[]');
    const builtinSubjectNames = Object.values(SUBJECTS_DB).flat().map(s => s.name);
    const customSubjectNames = customSubjects.map(s => s.name);
    const allSubjectNames = [...new Set([...builtinSubjectNames, ...customSubjectNames])].sort();
    content.innerHTML = `
      <div class="card" style="max-width:700px;">
        <h3 style="margin-bottom:1.2rem;">🎬 Upload Video</h3>
        <p style="font-size:0.82rem;color:var(--text2);margin-bottom:1rem;">Paste a YouTube URL — it will appear as an <strong>embedded video</strong> in the student's subject page.</p>
        <div class="input-group"><label>Video Title</label><input class="input" id="sa-vtitle" placeholder="e.g. Unit 1 Introduction"></div>
        <div class="input-group"><label>YouTube / Video URL</label><input class="input" id="sa-vurl" placeholder="https://youtube.com/watch?v=..." type="url"></div>
        <div class="form-row">
          <div class="input-group"><label>Subject</label>
            <select class="select" id="sa-vsubject" onchange="updateRoadmapTopicSelector()">
              <option value="">All Subjects</option>
              ${allSubjectNames.map(n => `<option value="${n}">${n}</option>`).join('')}
            </select>
          </div>
          <div class="input-group"><label>Unit</label>
            <select class="select" id="sa-vunit" onchange="updateRoadmapTopicSelector()">
              <option value="">All Units</option>
              ${[1, 2, 3, 4, 5].map(u => `<option value="${u}">Unit ${u}</option>`).join('')}
            </select></div>
        </div>
        <div class="input-group" id="sa-vtopic-group" style="display:none;">
          <label>📍 Learning Roadmap Topic</label>
          <select class="select" id="sa-vtopic"><option value="">Select a topic (optional)</option></select>
          <div style="font-size:0.75rem;color:var(--text3);margin-top:4px;">Link this video to a specific topic in the learning roadmap</div>
        </div>
        <button class="btn btn-lavender" onclick="uploadVideo()" style="width:100%;margin-top:0.5rem;">📤 Upload Video</button>
        <div id="sa-videos-list" style="margin-top:1.2rem;"></div>
      </div>`;
    renderUploadedVideosList();
  } else if (tab === 'notes') {
    const customSubjects = JSON.parse(localStorage.getItem('edusync_custom_subjects') || '[]');
    const builtinSubjectNames = Object.values(SUBJECTS_DB).flat().map(s => s.name);
    const customSubjectNames = customSubjects.map(s => s.name);
    const allSubjectNames = [...new Set([...builtinSubjectNames, ...customSubjectNames])].sort();
    content.innerHTML = `
      <div class="card" style="max-width:560px;">
        <h3 style="margin-bottom:0.5rem;">📄 Upload Notes</h3>
        <p style="font-size:0.82rem;color:var(--text2);margin-bottom:1rem;">Notes uploaded here will appear in the student's <strong>Notes tab</strong> for the selected subject & unit.</p>
        <div class="input-group"><label>Notes Title</label><input class="input" id="sa-ntitle" placeholder="e.g. Unit 1 Handwritten Notes"></div>
        <div class="form-row">
          <div class="input-group"><label>Type</label>
            <select class="select" id="sa-ntype">
              <option value="pdf">📄 PDF</option>
              <option value="doc">📝 DOC</option>
              <option value="link">🔗 Link</option>
            </select>
          </div>
          <div class="input-group"><label>Unit</label>
            <select class="select" id="sa-nunit"><option value="">All Units</option>
              ${[1, 2, 3, 4, 5].map(u => `<option value="${u}">Unit ${u}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="input-group"><label>Subject</label>
          <select class="select" id="sa-nsubject">
            <option value="">All Subjects</option>
            ${allSubjectNames.map(n => `<option value="${n}">${n}</option>`).join('')}
          </select>
        </div>
        <div class="input-group"><label>Link / URL (Google Drive, PDF URL etc.)</label>
          <input class="input" id="sa-nlink" placeholder="https://drive.google.com/..." type="url">
        </div>
        <button class="btn btn-lavender" onclick="uploadNotes()" style="width:100%;margin-top:0.5rem;">📤 Upload Notes</button>
        <div id="sa-notes-list" style="margin-top:1.2rem;"></div>
      </div>`;
    renderUploadedNotesList();
  } else if (tab === 'pyq') {
    const customSubjects = JSON.parse(localStorage.getItem('edusync_custom_subjects') || '[]');
    const allSubjectNames = [...new Set([...Object.values(SUBJECTS_DB).flat().map(s => s.name), ...customSubjects.map(s => s.name)])].sort();
    content.innerHTML = `
      <div class="card" style="max-width:600px;">
        <h3 style="margin-bottom:0.5rem;">📝 Upload Previous Year Questions</h3>
        <p style="font-size:0.82rem;color:var(--text2);margin-bottom:1rem;">PYQs uploaded here will appear in the student's <strong>Previous Year Qs tab</strong>.</p>
        <div class="form-row">
          <div class="input-group"><label>Exam Year</label><input class="input" id="sa-pyqyear" placeholder="e.g. 2023" type="number" min="2000" max="2099"></div>
          <div class="input-group"><label>Repeated Count</label><input class="input" id="sa-pyqcount" placeholder="e.g. 3" type="number" min="1" value="1"></div>
        </div>
        <div class="input-group"><label>Question Text</label>
          <textarea class="input" id="sa-pyqtext" placeholder="Type the question here..." rows="3" style="resize:vertical;"></textarea>
        </div>
        <div class="input-group"><label>Answer (optional)</label>
          <textarea class="input" id="sa-pyqans" placeholder="Type the answer or explanation..." rows="3" style="resize:vertical;"></textarea>
        </div>
        <div class="form-row">
          <div class="input-group"><label>Subject</label>
            <select class="select" id="sa-pyqsubject">
              <option value="">All Subjects</option>
              ${allSubjectNames.map(n => `<option value="${n}">${n}</option>`).join('')}
            </select>
          </div>
          <div class="input-group"><label>Unit</label>
            <select class="select" id="sa-pyqunit"><option value="">All Units</option>
              ${[1, 2, 3, 4, 5].map(u => `<option value="${u}">Unit ${u}</option>`).join('')}
            </select>
          </div>
        </div>
        <button class="btn btn-lavender" onclick="uploadPYQ()" style="width:100%;margin-top:0.5rem;">📤 Upload Question</button>
        <div id="sa-pyq-list" style="margin-top:1.2rem;"></div>
      </div>`;
    renderUploadedPYQList();
  } else if (tab === 'iq') {
    const customSubjects = JSON.parse(localStorage.getItem('edusync_custom_subjects') || '[]');
    const allSubjectNames = [...new Set([...Object.values(SUBJECTS_DB).flat().map(s => s.name), ...customSubjects.map(s => s.name)])].sort();
    content.innerHTML = `
      <div class="card" style="max-width:560px;">
        <h3 style="margin-bottom:0.5rem;">⭐ Upload Important Questions</h3>
        <p style="font-size:0.82rem;color:var(--text2);margin-bottom:1rem;">Important questions uploaded here will appear in the student's <strong>Important Qs tab</strong>.</p>
        <div class="input-group"><label>Question</label>
          <textarea class="input" id="sa-iqtext" placeholder="Type the important question..." rows="3" style="resize:vertical;"></textarea>
        </div>
        <div class="form-row">
          <div class="input-group"><label>Priority</label>
            <select class="select" id="sa-iqpriority">
              <option value="high">🔴 High Priority</option>
              <option value="med">🟡 Medium Priority</option>
              <option value="low">🟢 Low Priority</option>
            </select>
          </div>
          <div class="input-group"><label>Tags (comma separated)</label>
            <input class="input" id="sa-iqtags" placeholder="e.g. Unit 1, Memory">
          </div>
        </div>
        <div class="form-row">
          <div class="input-group"><label>Subject</label>
            <select class="select" id="sa-iqsubject">
              <option value="">All Subjects</option>
              ${allSubjectNames.map(n => `<option value="${n}">${n}</option>`).join('')}
            </select>
          </div>
          <div class="input-group"><label>Unit</label>
            <select class="select" id="sa-iqunit"><option value="">All Units</option>
              ${[1, 2, 3, 4, 5].map(u => `<option value="${u}">Unit ${u}</option>`).join('')}
            </select>
          </div>
        </div>
        <button class="btn btn-lavender" onclick="uploadIQ()" style="width:100%;margin-top:0.5rem;">+ Add Question</button>
        <div id="sa-iq-list" style="margin-top:1.2rem;"></div>
      </div>`;
    renderUploadedIQList();
  } else if (tab === 'urls') {
    content.innerHTML = `
      <div class="card">
        <h3 style="margin-bottom:1.2rem;">🔗 Manage URL Requests</h3>
        <div id="sa-url-list"></div>
      </div>`;
    renderSAUrlRequests();
  }
}

function createSubject() {
  const branch = document.getElementById('sa-branch').value;
  const year = document.getElementById('sa-year').value;
  const sem = document.getElementById('sa-sem').value;
  const reg = document.getElementById('sa-reg').value;
  const uni = document.getElementById('sa-uni').value;
  const name = document.getElementById('sa-subname').value.trim();
  const code = document.getElementById('sa-subcode').value.trim();
  const credits = document.getElementById('sa-credits').value;
  if (!branch || !year || !sem || !reg || !uni || !name || !code) {
    showToast('Please fill all fields', 'red'); return;
  }
  const newId = Date.now();
  const subjects = JSON.parse(localStorage.getItem('edusync_custom_subjects') || '[]');
  subjects.push({ branch, year, sem, reg, uni, name, code, credits, id: newId });
  localStorage.setItem('edusync_custom_subjects', JSON.stringify(subjects));
  showToast('✅ Subject created! Now build its learning roadmap below.', 'green');
  renderSASubjects();
  // Show roadmap creator for this new subject
  openRoadmapCreator(newId, name);
}

function renderSASubjects() {
  const list = document.getElementById('sa-subjects-list');
  if (!list) return;
  const subjects = JSON.parse(localStorage.getItem('edusync_custom_subjects') || '[]');
  if (!subjects.length) { list.innerHTML = ''; return; }
  const roadmaps = JSON.parse(localStorage.getItem('edusync_roadmaps') || '{}');
  list.innerHTML = `<h4 style="margin-bottom:8px;font-size:0.85rem;">Created Subjects (${subjects.length})</h4>` +
    subjects.map(s => {
      const hasRoadmap = roadmaps[s.id] && roadmaps[s.id].some(u => u.topics.some(t => t.trim()));
      return `
      <div style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:6px;font-size:0.82rem;">
        <div style="flex:1;min-width:0;">
          <div style="font-weight:600;">${s.name} <span class="badge badge-primary">${s.code}</span></div>
          <div style="font-size:0.72rem;color:var(--text3);margin-top:2px;">${s.branch} · Sem ${s.sem} · ${s.reg}</div>
        </div>
        <span class="badge badge-teal">${s.branch}</span>
        ${hasRoadmap ? '<span class="badge badge-green">✅ Roadmap Set</span>' : '<span class="badge badge-amber">⚠️ No Roadmap</span>'}
        <button class="btn btn-ghost btn-sm" onclick="openRoadmapCreator(${s.id}, '${s.name.replace(/'/g, "\\'")}')">📍 ${hasRoadmap ? 'Edit' : 'Create'} Roadmap</button>
      </div>`;
    }).join('');
}

function openRoadmapCreator(subjectId, subjectName) {
  const creator = document.getElementById('sa-roadmap-creator');
  if (!creator) return;
  creator.style.display = 'block';
  creator.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const label = document.getElementById('sa-roadmap-subject-label');
  if (label) label.textContent = subjectName;
  creator.dataset.subjectId = subjectId;
  creator.dataset.subjectName = subjectName;

  const roadmaps = JSON.parse(localStorage.getItem('edusync_roadmaps') || '{}');
  const existing = roadmaps[subjectId] || Array.from({ length: 5 }, (_, i) => ({
    unit: i + 1,
    topics: ['', '', '', '', '']
  }));

  const unitNames = [
    'Unit 1 - Foundations',
    'Unit 2 — Advanced Algorithms & Theory',
    'Unit 3 — Design Patterns & Architecture',
    'Unit 4 — Integration & Performance',
    'Unit 5 - Emerging Topics'
  ];

  const container = document.getElementById('sa-roadmap-units');
  container.innerHTML = existing.map((unit, ui) => `
    <div style="border:1px solid var(--border);border-radius:var(--radius-md);overflow:hidden;">
      <div style="padding:10px 14px;background:linear-gradient(135deg,var(--primary-light),var(--lavender-light));font-weight:700;font-size:0.9rem;display:flex;align-items:center;gap:8px;">
        <span style="width:28px;height:28px;background:var(--primary);color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:0.8rem;flex-shrink:0;">${ui + 1}</span>
        ${unitNames[ui]}
      </div>
      <div style="padding:12px 14px;display:flex;flex-direction:column;gap:8px;" id="roadmap-unit-${ui}">
        ${unit.topics.map((t, ti) => `
          <div style="display:flex;align-items:center;gap:8px;">
            <div style="display:flex;flex-direction:column;align-items:center;gap:2px;">
              <div style="width:14px;height:14px;border-radius:50%;background:${t.trim() ? 'var(--primary)' : 'var(--border)'};border:2px solid var(--surface);flex-shrink:0;"></div>
              ${ti < unit.topics.length - 1 ? '<div style="width:2px;height:16px;background:var(--border);"></div>' : ''}
            </div>
            <input class="input" placeholder="Subtopic ${ti + 1} (e.g. Introduction to Trees)" value="${t}" style="flex:1;font-size:0.85rem;padding:7px 11px;" oninput="refreshRoadmapDots(${ui})" id="topic-${ui}-${ti}">
            <button onclick="removeRoadmapTopic(${ui},${ti})" class="btn-icon" style="padding:6px;font-size:0.8rem;" title="Remove">✕</button>
          </div>
        `).join('')}
        <button class="btn btn-ghost btn-sm" onclick="addRoadmapTopic(${ui})" style="align-self:flex-start;margin-top:4px;">+ Add Topic</button>
      </div>
    </div>
  `).join('');
}

function refreshRoadmapDots(unitIdx) {
  const container = document.getElementById(`roadmap-unit-${unitIdx}`);
  if (!container) return;
  container.querySelectorAll('input').forEach((inp, i) => {
    const dot = container.querySelectorAll('.roadmap-dot')[i];
    if (dot) dot.style.background = inp.value.trim() ? 'var(--primary)' : 'var(--border)';
  });
}

function addRoadmapTopic(unitIdx) {
  const container = document.getElementById(`roadmap-unit-${unitIdx}`);
  if (!container) return;
  const inputs = container.querySelectorAll('input');
  const newIdx = inputs.length;
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'display:flex;align-items:center;gap:8px;';
  wrapper.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;gap:2px;">
      <div style="width:14px;height:14px;border-radius:50%;background:var(--border);border:2px solid var(--surface);flex-shrink:0;"></div>
    </div>
    <input class="input" placeholder="Subtopic ${newIdx + 1}" style="flex:1;font-size:0.85rem;padding:7px 11px;" id="topic-${unitIdx}-${newIdx}">
    <button onclick="this.parentElement.remove()" class="btn-icon" style="padding:6px;font-size:0.8rem;" title="Remove">✕</button>`;
  container.insertBefore(wrapper, container.lastElementChild);
}

function removeRoadmapTopic(unitIdx, topicIdx) {
  const input = document.getElementById(`topic-${unitIdx}-${topicIdx}`);
  if (input) input.closest('div[style*="display:flex"]').remove();
}

function saveRoadmap() {
  const creator = document.getElementById('sa-roadmap-creator');
  const subjectId = creator?.dataset.subjectId;
  const subjectName = creator?.dataset.subjectName;
  if (!subjectId) { showToast('No subject selected', 'red'); return; }

  const roadmaps = JSON.parse(localStorage.getItem('edusync_roadmaps') || '{}');
  const units = [];
  for (let u = 0; u < 5; u++) {
    const container = document.getElementById(`roadmap-unit-${u}`);
    const topics = [];
    if (container) {
      container.querySelectorAll('input').forEach(inp => {
        if (inp.value.trim()) topics.push(inp.value.trim());
      });
    }
    units.push({ unit: u + 1, topics });
  }
  roadmaps[subjectId] = units;
  localStorage.setItem('edusync_roadmaps', JSON.stringify(roadmaps));
  showToast('✅ Learning roadmap saved! Students will see this as their learning path.', 'green');
  creator.style.display = 'none';
  renderSASubjects();
}

function updateRoadmapTopicSelector() {
  const subjectName = document.getElementById('sa-vsubject')?.value;
  const unit = document.getElementById('sa-vunit')?.value;
  const group = document.getElementById('sa-vtopic-group');
  const sel = document.getElementById('sa-vtopic');
  if (!group || !sel) return;
  if (!subjectName || !unit) { group.style.display = 'none'; return; }

  // Find subject id from name
  const customSubjects = JSON.parse(localStorage.getItem('edusync_custom_subjects') || '[]');
  const subj = customSubjects.find(s => s.name === subjectName);
  if (!subj) { group.style.display = 'none'; return; }

  const roadmaps = JSON.parse(localStorage.getItem('edusync_roadmaps') || '{}');
  const roadmap = roadmaps[subj.id];
  if (!roadmap) { group.style.display = 'none'; return; }

  const unitData = roadmap.find(u => u.unit === parseInt(unit));
  if (!unitData || !unitData.topics.length) { group.style.display = 'none'; return; }

  sel.innerHTML = '<option value="">Select a topic (optional)</option>' +
    unitData.topics.map(t => `<option value="${t}">${t}</option>`).join('');
  group.style.display = 'block';
}

function uploadVideo() {
  const title = document.getElementById('sa-vtitle').value.trim();
  const url = document.getElementById('sa-vurl').value.trim();
  const subject = document.getElementById('sa-vsubject').value.trim();
  const unit = document.getElementById('sa-vunit').value;
  const topic = document.getElementById('sa-vtopic')?.value || '';
  if (!title || !url) { showToast('Please fill title and URL', 'red'); return; }
  if (!url.startsWith('http')) { showToast('Please enter a valid URL', 'red'); return; }
  // Save video to localStorage so students can see it
  const videos = JSON.parse(localStorage.getItem('edusync_admin_videos') || '[]');
  videos.push({
    id: Date.now(),
    title, url, subject, unit: parseInt(unit) || 1,
    topic: topic || '',
    uploadedAt: new Date().toLocaleString(),
    uploadedBy: APP.subAdminData?.username || 'Sub Admin'
  });
  localStorage.setItem('edusync_admin_videos', JSON.stringify(videos));
  showToast('✅ Video uploaded! Students can now see it.', 'green');
  document.getElementById('sa-vtitle').value = '';
  document.getElementById('sa-vurl').value = '';
  // Show uploaded videos list
  renderUploadedVideosList();
}

function uploadNotes() {
  const title = document.getElementById('sa-ntitle').value.trim();
  const type = document.getElementById('sa-ntype').value;
  const subject = document.getElementById('sa-nsubject').value;
  const unit = document.getElementById('sa-nunit').value;
  const link = document.getElementById('sa-nlink').value.trim();
  if (!title) { showToast('Please enter a notes title', 'red'); return; }
  const notes = JSON.parse(localStorage.getItem('edusync_admin_notes') || '[]');
  notes.push({ id: Date.now(), title, type, subject, unit: parseInt(unit) || 0, link, uploadedAt: new Date().toLocaleString(), uploadedBy: APP.subAdminData?.username || 'Sub Admin' });
  localStorage.setItem('edusync_admin_notes', JSON.stringify(notes));
  document.getElementById('sa-ntitle').value = '';
  document.getElementById('sa-nlink').value = '';
  showToast('✅ Notes uploaded! Students can now see it.', 'green');
  renderUploadedNotesList();
}

function renderUploadedNotesList() {
  const listEl = document.getElementById('sa-notes-list');
  if (!listEl) return;
  const notes = JSON.parse(localStorage.getItem('edusync_admin_notes') || '[]');
  if (!notes.length) { listEl.innerHTML = ''; return; }
  listEl.innerHTML = '<h4 style="margin-bottom:8px;font-size:0.85rem;">Uploaded Notes (' + notes.length + ')</h4>' +
    notes.map(n => `
      <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:6px;font-size:0.82rem;">
        <span style="flex:1;font-weight:600;">📄 ${n.title}</span>
        <span class="badge badge-teal">${n.subject || 'All'}</span>
        <span class="badge badge-lavender">Unit ${n.unit || 'All'}</span>
        <span class="badge badge-green">Live</span>
        <!-- Sub Admin cannot delete — only view -->
      </div>`).join('');
}

function deleteAdminNote(id) {
  const notes = JSON.parse(localStorage.getItem('edusync_admin_notes') || '[]');
  localStorage.setItem('edusync_admin_notes', JSON.stringify(notes.filter(n => n.id !== id)));
  renderUploadedNotesList();
  showToast('Note removed', 'red');
}

function uploadPYQ() {
  const year = document.getElementById('sa-pyqyear').value.trim();
  const count = document.getElementById('sa-pyqcount').value.trim();
  const question = document.getElementById('sa-pyqtext').value.trim();
  const answer = document.getElementById('sa-pyqans').value.trim();
  const subject = document.getElementById('sa-pyqsubject').value;
  const unit = document.getElementById('sa-pyqunit').value;
  if (!question || !year) { showToast('Please fill question and year', 'red'); return; }
  const pyqs = JSON.parse(localStorage.getItem('edusync_admin_pyqs') || '[]');
  pyqs.push({ id: Date.now(), question, answer, year, count: parseInt(count) || 1, subject, unit: parseInt(unit) || 0, uploadedAt: new Date().toLocaleString() });
  localStorage.setItem('edusync_admin_pyqs', JSON.stringify(pyqs));
  document.getElementById('sa-pyqtext').value = '';
  document.getElementById('sa-pyqans').value = '';
  showToast('✅ PYQ uploaded! Students can now see it.', 'green');
  renderUploadedPYQList();
}

function renderUploadedPYQList() {
  const listEl = document.getElementById('sa-pyq-list');
  if (!listEl) return;
  const pyqs = JSON.parse(localStorage.getItem('edusync_admin_pyqs') || '[]');
  if (!pyqs.length) { listEl.innerHTML = ''; return; }
  listEl.innerHTML = '<h4 style="margin-bottom:8px;font-size:0.85rem;">Uploaded PYQs (' + pyqs.length + ')</h4>' +
    pyqs.map(p => `
      <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:6px;font-size:0.82rem;">
        <span style="flex:1;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">📝 ${p.question}</span>
        <span class="badge badge-amber">${p.year}</span>
        <span class="badge badge-teal">${p.subject || 'All'}</span>
        <span class="badge badge-green">Live</span>
        <!-- Sub Admin cannot delete -->
      </div>`).join('');
}

function deleteAdminPYQ(id) {
  const pyqs = JSON.parse(localStorage.getItem('edusync_admin_pyqs') || '[]');
  localStorage.setItem('edusync_admin_pyqs', JSON.stringify(pyqs.filter(p => p.id !== id)));
  renderUploadedPYQList();
  showToast('PYQ removed', 'red');
}

function uploadIQ() {
  const question = document.getElementById('sa-iqtext').value.trim();
  const priority = document.getElementById('sa-iqpriority').value;
  const tags = document.getElementById('sa-iqtags').value.trim();
  const subject = document.getElementById('sa-iqsubject').value;
  const unit = document.getElementById('sa-iqunit').value;
  if (!question) { showToast('Please enter a question', 'red'); return; }
  const iqs = JSON.parse(localStorage.getItem('edusync_admin_iqs') || '[]');
  iqs.push({ id: Date.now(), question, priority, tags, subject, unit: parseInt(unit) || 0, uploadedAt: new Date().toLocaleString() });
  localStorage.setItem('edusync_admin_iqs', JSON.stringify(iqs));
  document.getElementById('sa-iqtext').value = '';
  document.getElementById('sa-iqtags').value = '';
  showToast('✅ Important question added! Students can now see it.', 'green');
  renderUploadedIQList();
}

function renderUploadedIQList() {
  const listEl = document.getElementById('sa-iq-list');
  if (!listEl) return;
  const iqs = JSON.parse(localStorage.getItem('edusync_admin_iqs') || '[]');
  if (!iqs.length) { listEl.innerHTML = ''; return; }
  listEl.innerHTML = '<h4 style="margin-bottom:8px;font-size:0.85rem;">Added Questions (' + iqs.length + ')</h4>' +
    iqs.map(q => `
      <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:6px;font-size:0.82rem;">
        <span style="flex:1;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">⭐ ${q.question}</span>
        <span class="badge ${q.priority === 'high' ? 'badge-red' : q.priority === 'med' ? 'badge-amber' : 'badge-green'}">${q.priority}</span>
        <span class="badge badge-teal">${q.subject || 'All'}</span>
        <span class="badge badge-green">Live</span>
        <!-- Sub Admin cannot delete -->
      </div>`).join('');
}

function deleteAdminIQ(id) {
  const iqs = JSON.parse(localStorage.getItem('edusync_admin_iqs') || '[]');
  localStorage.setItem('edusync_admin_iqs', JSON.stringify(iqs.filter(q => q.id !== id)));
  renderUploadedIQList();
  showToast('Question removed', 'red');
}

function renderUploadedVideosList() {
  const listEl = document.getElementById('sa-videos-list');
  if (!listEl) return;
  const videos = JSON.parse(localStorage.getItem('edusync_admin_videos') || '[]');
  if (!videos.length) { listEl.innerHTML = ''; return; }
  listEl.innerHTML = '<h4 style="margin-bottom:8px;font-size:0.85rem;">Uploaded Videos (' + videos.length + ')</h4>' +
    videos.map(v => `
      <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:6px;font-size:0.82rem;">
        <span style="flex:1;font-weight:600;">🎬 ${v.title}</span>
        <span class="badge badge-teal">${v.subject || 'All'}</span>
        <span class="badge badge-lavender">Unit ${v.unit || 1}</span>
        <span class="badge badge-green">Live</span>
        <!-- Sub Admin cannot delete -->
      </div>`).join('');
}

function deleteAdminVideo(id) {
  const videos = JSON.parse(localStorage.getItem('edusync_admin_videos') || '[]');
  const filtered = videos.filter(v => v.id !== id);
  localStorage.setItem('edusync_admin_videos', JSON.stringify(filtered));
  renderUploadedVideosList();
  showToast('Video removed', 'red');
}

function renderSAUrlRequests() {
  const list = document.getElementById('sa-url-list');
  if (!list) return;
  const requests = JSON.parse(localStorage.getItem('edusync_url_requests') || '[]');
  if (!requests.length) { list.innerHTML = '<div style="padding:1.5rem;text-align:center;color:var(--text3);">No URL requests yet</div>'; return; }
  list.innerHTML = requests.map((r, i) => `
    <div style="display:flex;align-items:flex-start;gap:10px;padding:12px;border:1px solid var(--border);border-radius:var(--radius-md);margin-bottom:8px;">
      <div style="flex:1;min-width:0;">
        <div style="font-size:0.85rem;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${r.url}</div>
        <div style="font-size:0.75rem;color:var(--text3);">${r.subject} · by ${r.submittedBy} · ${r.submittedAt}</div>
      </div>
      <span class="badge ${r.status === 'approved' ? 'badge-green' : r.status === 'rejected' ? 'badge-red' : 'badge-amber'}">${r.status}</span>
      ${r.status === 'pending' ? `
        <button class="btn btn-teal btn-sm" onclick="adminApproveUrl(${i});renderSAUrlRequests()">✅</button>
        <button class="btn btn-danger btn-sm" onclick="adminRejectUrl(${i});renderSAUrlRequests()">❌</button>
      `: ''}
    </div>`).join('');
}

// ═══════════════════════════════════════════════════
//  OVERRIDE navigateTo to rebuild sem switcher
// ═══════════════════════════════════════════════════
// (We hook into the existing navigateTo by patching its page-specific init block)
// buildSemSwitcher is called after renderSubjects in the patched subjects init


// ═══════════════════════════════════════════════════
//  CREATE SUB ADMIN
// ═══════════════════════════════════════════════════
function openCreateSubAdminModal() {
  document.getElementById('sa-create-username').value = '';
  document.getElementById('sa-create-password').value = '';
  document.getElementById('sa-create-branch').value = '';
  document.getElementById('sa-create-dept').value = '';
  document.getElementById('sa-create-err').style.display = 'none';
  document.getElementById('sa-create-success').style.display = 'none';
  renderExistingSubAdmins();
  document.getElementById('create-subadmin-modal').classList.add('open');
}
function closeCreateSubAdminModal() {
  document.getElementById('create-subadmin-modal').classList.remove('open');
}
async function renderExistingSubAdmins() {
  const { data: subAdmins, error } = await window.supabase
    .from('sub_admin_accounts')
    .select('*');

  if (error) {
    console.error(error);
    return;
  }
  const el = document.getElementById('sa-existing-list');
  if (!el) return;
  if (!subAdmins.length) { el.innerHTML = ''; return; }
  el.innerHTML = '<div style="font-size:0.78rem;font-weight:700;color:var(--text2);margin-bottom:6px;">Existing Sub Admins (' + subAdmins.length + ')</div>' +
    subAdmins.map(sa =>
      '<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:4px;font-size:0.82rem;">' +
      '<span style="flex:1;font-weight:600;">' + sa.username + '</span>' +
      '<span class="badge badge-teal">' + sa.branch + '</span>' +

      '<span class="badge badge-green">Active</span></div>'
    ).join('');
}
function createSubAdmin() {
  const username = document.getElementById('sa-create-username').value.trim();
  const password = document.getElementById('sa-create-password').value.trim();
  const branch = document.getElementById('sa-create-branch').value;
  const dept = document.getElementById('sa-create-dept').value.trim();
  const errEl = document.getElementById('sa-create-err');
  const sucEl = document.getElementById('sa-create-success');
  if (!username || !password || !branch || !dept) {
    errEl.textContent = 'Please fill all fields.';
    errEl.style.display = 'block'; sucEl.style.display = 'none'; return;
  }
  errEl.style.display = 'none';
  const subAdmins = JSON.parse(localStorage.getItem('edusync_subadmins') || '[]');
  if (subAdmins.find(sa => sa.username === username)) {
    errEl.textContent = 'Username already exists.';
    errEl.style.display = 'block'; return;
  }
  subAdmins.push({ username, password, branch, createdAt: new Date().toLocaleString() });
  localStorage.setItem('edusync_subadmins', JSON.stringify(subAdmins));
  sucEl.textContent = 'Sub Admin "' + username + '" created! They can login with these credentials.';
  sucEl.style.display = 'block';
  document.getElementById('sa-create-username').value = '';
  document.getElementById('sa-create-password').value = '';
  document.getElementById('sa-create-branch').value = '';
  document.getElementById('sa-create-dept').value = '';
  renderExistingSubAdmins();
  if (typeof renderAdminDashboard === 'function') renderAdminDashboard();
  showToast('Sub Admin created!', 'green');
}
document.addEventListener('DOMContentLoaded', function () {
  const csaModal = document.getElementById('create-subadmin-modal');
  if (csaModal) csaModal.addEventListener('click', function (e) { if (e.target === this) closeCreateSubAdminModal(); });
});

// Close admin dropdown on outside click (escape)
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeAdminDropdownOutside();
    closeAdminLogin();
  }
});
console.log('ADMIN FUNCTIONS FILE LOADED');

// ═══════════════════════════════════════════════════
//  ADMIN SIDEBAR
// ═══════════════════════════════════════════════════
function toggleAdminSidebar() {
  document.getElementById('admin-sidebar').classList.toggle('open');
  document.getElementById('admin-sidebar-backdrop').classList.toggle('open');
}
window.toggleAdminSidebar = toggleAdminSidebar;
globalThis.toggleAdminSidebar = toggleAdminSidebar;
function closeAdminSidebar() {
  document.getElementById('admin-sidebar').classList.remove('open');
  document.getElementById('admin-sidebar-backdrop').classList.remove('open');
}
window.closeAdminSidebar = closeAdminSidebar;
globalThis.closeAdminSidebar = closeAdminSidebar;
function switchAdminSection(section) {
  closeAdminSidebar();
  document.querySelectorAll('[id^="admin-nav-"]').forEach(el => el.classList.remove('active'));
  const navEl = document.getElementById('admin-nav-' + section);
  if (navEl) navEl.classList.add('active');
  const titles = { dashboard: 'Admin Dashboard', create: 'Create & Manage', subjects: 'All Subjects', approvals: 'URL Approvals' };
  const titleEl = document.getElementById('admin-topbar-title');
  if (titleEl) titleEl.textContent = titles[section] || 'Admin';
  renderAdminSection(section);
}
window.switchAdminSection = switchAdminSection;
globalThis.switchAdminSection = switchAdminSection;
function renderAdminSection(section) {
  const content = document.getElementById('admin-content');
  if (!content) return;
  const customSubjects = JSON.parse(localStorage.getItem('edusync_custom_subjects') || '[]');
  const adminVideos = JSON.parse(localStorage.getItem('edusync_admin_videos') || '[]');
  const adminNotes = JSON.parse(localStorage.getItem('edusync_admin_notes') || '[]');
  const adminPYQs = JSON.parse(localStorage.getItem('edusync_admin_pyqs') || '[]');
  const adminIQs = JSON.parse(localStorage.getItem('edusync_admin_iqs') || '[]');
  const subAdmins = JSON.parse(localStorage.getItem('edusync_subadmins') || '[]');
  const urlRequests = JSON.parse(localStorage.getItem('edusync_url_requests') || '[]');
  const pending = urlRequests.filter(r => r.status === 'pending');
  // Update badge
  const badge = document.getElementById('admin-approval-badge');
  if (badge) { badge.textContent = pending.length; badge.style.display = pending.length ? 'inline-flex' : 'none'; }

  if (section === 'dashboard') {
    const totalBuiltinSubjects = Object.values(SUBJECTS_DB).flat().length;
    content.innerHTML = `
    <div style="padding:2rem;max-width:1200px;margin:0 auto;width:100%;">
      <div style="margin-bottom:1.6rem;">
        <h2 style="font-size:1.5rem;font-weight:800;letter-spacing:-0.02em;margin-bottom:4px;">📊 Admin Dashboard</h2>
        <p style="font-size:0.85rem;color:var(--text3);">Platform overview and analytics</p>
      </div>
      <div class="admin-grid" style="margin-bottom:2rem;">
        <div class="admin-stat-card">
          <div class="admin-stat-accent" style="background:var(--primary);"></div>
          <div style="font-size:2.4rem;font-weight:800;color:var(--primary);">1,284</div>
          <div style="font-size:0.88rem;font-weight:600;margin-top:4px;">Total Students</div>
          <div style="font-size:0.75rem;color:var(--text3);margin-top:4px;">↑ 12% this week</div>
        </div>
        <div class="admin-stat-card">
          <div class="admin-stat-accent" style="background:var(--teal);"></div>
          <div style="font-size:2.4rem;font-weight:800;color:var(--teal);">48</div>
          <div style="font-size:0.88rem;font-weight:600;margin-top:4px;">Total Teachers</div>
          <div style="font-size:0.75rem;color:var(--text3);margin-top:4px;">${subAdmins.length} sub admins</div>
        </div>
        <div class="admin-stat-card">
          <div class="admin-stat-accent" style="background:var(--lavender);"></div>
          <div style="font-size:2.4rem;font-weight:800;color:var(--lavender);">${totalBuiltinSubjects + customSubjects.length}</div>
          <div style="font-size:0.88rem;font-weight:600;margin-top:4px;">Total Subjects</div>
          <div style="font-size:0.75rem;color:var(--text3);margin-top:4px;">${customSubjects.length} custom added</div>
        </div>
        <div class="admin-stat-card">
          <div class="admin-stat-accent" style="background:var(--amber);"></div>
          <div style="font-size:2.4rem;font-weight:800;color:var(--amber);">${pending.length}</div>
          <div style="font-size:0.88rem;font-weight:600;margin-top:4px;">Pending Approvals</div>
          <div style="font-size:0.75rem;color:var(--text3);margin-top:4px;">URL requests</div>
        </div>
        <div class="admin-stat-card">
          <div class="admin-stat-accent" style="background:var(--green);"></div>
          <div style="font-size:2.4rem;font-weight:800;color:var(--green);">${adminVideos.length + adminNotes.length}</div>
          <div style="font-size:0.88rem;font-weight:600;margin-top:4px;">Content Uploaded</div>
          <div style="font-size:0.75rem;color:var(--text3);margin-top:4px;">${adminVideos.length} videos · ${adminNotes.length} notes</div>
        </div>
        <div class="admin-stat-card">
          <div class="admin-stat-accent" style="background:var(--red);"></div>
          <div style="font-size:2.4rem;font-weight:800;color:var(--red);">2.4 GB</div>
          <div style="font-size:0.88rem;font-weight:600;margin-top:4px;">Storage Used</div>
          <div style="font-size:0.75rem;color:var(--text3);margin-top:4px;">of 10 GB limit</div>
        </div>
      </div>
      <!-- Activity overview -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.4rem;margin-bottom:1.4rem;">
        <div class="card">
          <div class="section-heading" style="margin-bottom:1rem;">📈 Average Platform Usage</div>
          ${['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((d, i) => {
      const pct = [62, 78, 85, 71, 90, 45, 38][i];
      return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
              <span style="font-size:0.78rem;color:var(--text2);width:80px;flex-shrink:0;">${d}</span>
              <div style="flex:1;"><div class="progress-bar"><div class="progress-fill" style="width:${pct}%;"></div></div></div>
              <span style="font-size:0.75rem;font-weight:700;color:var(--primary);width:30px;">${pct}%</span>
            </div>`;
    }).join('')}
        </div>
        <div class="card">
          <div class="section-heading" style="margin-bottom:1rem;">📋 Activity Overview</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
            <div style="padding:14px;background:var(--primary-light);border-radius:var(--radius-md);text-align:center;">
              <div style="font-size:1.6rem;font-weight:800;color:var(--primary);">${urlRequests.filter(r => r.status === 'approved').length}</div>
              <div style="font-size:0.75rem;font-weight:600;color:var(--text2);">URLs Approved</div>
            </div>
            <div style="padding:14px;background:var(--teal-light);border-radius:var(--radius-md);text-align:center;">
              <div style="font-size:1.6rem;font-weight:800;color:var(--teal);">${adminPYQs.length + 6}</div>
              <div style="font-size:0.75rem;font-weight:600;color:var(--text2);">PYQs Available</div>
            </div>
            <div style="padding:14px;background:var(--amber-light);border-radius:var(--radius-md);text-align:center;">
              <div style="font-size:1.6rem;font-weight:800;color:var(--amber);">${adminIQs.length + 8}</div>
              <div style="font-size:0.75rem;font-weight:600;color:var(--text2);">Imp. Questions</div>
            </div>
            <div style="padding:14px;background:var(--green-light);border-radius:var(--radius-md);text-align:center;">
              <div style="font-size:1.6rem;font-weight:800;color:var(--green);">0</div>
              <div style="font-size:0.75rem;font-weight:600;color:var(--text2);">Satisfaction</div>
            </div>
          </div>
        </div>
      </div>
    </div>`;
    return;
  }

  if (section === 'create') {
    const allSubAdmins = [...subAdmins];
    const adminFeatures = JSON.parse(localStorage.getItem('edusync_features') || '["Videos","Notes","PYQs","Important Questions"]');
    content.innerHTML = `
    <div style="padding:2rem;max-width:1200px;margin:0 auto;width:100%;">
      <h2 style="font-size:1.4rem;font-weight:800;letter-spacing:-0.02em;margin-bottom:1.5rem;">➕ Create & Manage</h2>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.4rem;align-items:start;">
        <!-- Sub Admin Creation -->
        <div class="card">
          <h3 style="margin-bottom:1rem;">👤 Sub Admin Creation</h3>
          <div class="input-group"><label>Username</label><input class="input" id="adm-sa-user" placeholder="e.g. subadmin2"></div>
          <div class="input-group"><label>Password</label><input class="input" id="adm-sa-pass" placeholder="Secure password" type="password"></div>
          <div class="input-group"><label>Branch</label>
              <select class="select" id="adm-sa-branch"><option value="">Select Branch</option>
                ${(window.__aiiensRuntimeBranchNames || []).map(b => `<option>${b}</option>`).join('')}
              </select>
          </div>
          <div id="adm-sa-err" style="display:none;font-size:0.82rem;color:var(--red);margin-bottom:10px;padding:8px 12px;background:var(--red-light);border-radius:var(--radius-sm);"></div>
          <div id="adm-sa-ok" style="display:none;font-size:0.82rem;color:var(--green);margin-bottom:10px;padding:8px 12px;background:var(--green-light);border-radius:var(--radius-sm);"></div>
          <button class="btn btn-primary" onclick="adminCreateSubAdmin();renderAdminSection('create')" style="width:100%;">+ Create Sub Admin</button>
          <hr style="margin:1.2rem 0;border-color:var(--border);">
          <div style="font-size:0.85rem;font-weight:700;margin-bottom:8px;">Active Sub Admins (${allSubAdmins.length})</div>
          <div style="max-height:300px;overflow-y:auto;">
            ${allSubAdmins.map((sa, i) => `
              <div style="display:flex;align-items:center;gap:8px;padding:9px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:5px;font-size:0.82rem;">
                <div style="flex:1;"><div style="font-weight:600;">${sa.username}</div><div style="font-size:0.72rem;color:var(--text3);">${sa.branch}</div></div>
                <span class="badge badge-green">Active</span>
                <button class="btn btn-danger btn-sm" onclick="adminDeleteSubAdmin(${i});renderAdminSection('create')">✕</button>
              </div>`).join('')}
          </div>
        </div>
        <!-- Feature Management -->
        <div class="card">
          <h3 style="margin-bottom:1rem;">⚡ Feature Management</h3>
          <p style="font-size:0.82rem;color:var(--text2);margin-bottom:1rem;">Dynamically create, edit, and manage platform features.</p>
          <div class="input-group">
            <label>New Feature Name</label>
            <div style="display:flex;gap:8px;">
              <input class="input" id="adm-feature-name" placeholder="e.g. Live Quizzes">
              <button class="btn btn-primary btn-sm" onclick="adminAddFeature()">Add</button>
            </div>
          </div>
          <div style="margin-top:0.8rem;" id="adm-features-list">
            ${adminFeatures.map((f, i) => `
              <div style="display:flex;align-items:center;gap:8px;padding:9px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:5px;font-size:0.85rem;">
                <span style="flex:1;font-weight:600;">⚡ ${f}</span>
                <span class="badge badge-green">Live</span>
                <button class="btn btn-ghost btn-sm" onclick="adminEditFeature(${i})">✏️</button>
                <button class="btn btn-danger btn-sm" onclick="adminDeleteFeature(${i})">✕</button>
              </div>`).join('')}
          </div>
        </div>
      </div>
    </div>`;
    return;
  }

  if (section === 'subjects') {
    const allSems = ['1-1', '1-2', '2-1', '2-2', '3-1', '3-2', '4-1', '4-2'];
    const unis = window.__aiiensRuntimeUniversityNames || [];
    const regs = ['R23', 'R20', 'R19', 'R16'];
    const savedFilter = window._adminSubjectFilter || {};
    const filterUni = savedFilter.uni || '';
    const filterReg = savedFilter.reg || '';
    const filterSem = savedFilter.sem || '';
    // All subjects: builtin + custom
    let allSubjects = [];
    allSems.forEach(sem => {
      const builtins = SUBJECTS_DB[sem] || [];
      builtins.forEach(s => allSubjects.push({ ...s, sem, reg: 'R23', uni: 'JNTUK', isBuiltin: true }));
    });
    customSubjects.forEach(s => allSubjects.push({ ...s, isBuiltin: false }));
    // Apply filters
    let filtered = allSubjects;
    if (filterUni) filtered = filtered.filter(s => s.uni === filterUni);
    if (filterReg) filtered = filtered.filter(s => s.reg === filterReg);
    if (filterSem) filtered = filtered.filter(s => s.sem === filterSem);

    content.innerHTML = `
    <div style="padding:2rem;max-width:1200px;margin:0 auto;width:100%;">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:1.5rem;">
        <h2 style="font-size:1.4rem;font-weight:800;letter-spacing:-0.02em;">📚 All Subjects</h2>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <select class="select" style="width:140px;" onchange="window._adminSubjectFilter=Object.assign(window._adminSubjectFilter||{},{uni:this.value});renderAdminSection('subjects')">
            <option value="">All Universities</option>${unis.map(u => `<option value="${u}" ${filterUni === u ? 'selected' : ''}>${u}</option>`).join('')}
          </select>
          <select class="select" style="width:120px;" onchange="window._adminSubjectFilter=Object.assign(window._adminSubjectFilter||{},{reg:this.value});renderAdminSection('subjects')">
            <option value="">All Regulations</option>${regs.map(r => `<option value="${r}" ${filterReg === r ? 'selected' : ''}>${r}</option>`).join('')}
          </select>
          <select class="select" style="width:110px;" onchange="window._adminSubjectFilter=Object.assign(window._adminSubjectFilter||{},{sem:this.value});renderAdminSection('subjects')">
            <option value="">All Semesters</option>${allSems.map(s => `<option value="${s}" ${filterSem === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>
      </div>
      <div style="font-size:0.82rem;color:var(--text3);margin-bottom:1rem;">Showing ${filtered.length} subjects</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1rem;">
        ${filtered.map(s => `
          <div class="card" style="padding:1.2rem;">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:8px;">
              <div>
                <div style="font-weight:700;font-size:0.92rem;margin-bottom:4px;">${s.icon || '📖'} ${s.name}</div>
                <div style="font-size:0.75rem;color:var(--text3);">${s.code || '—'} · ${s.credits || 3} Cr</div>
              </div>
              ${!s.isBuiltin ? `<button class="btn btn-danger btn-sm" onclick="adminDeleteSubject(${s.id});renderAdminSection('subjects')" title="Delete">✕</button>` : ''}
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              <span class="badge badge-primary">${s.sem}</span>
              <span class="badge badge-teal">${s.uni || 'JNTUK'}</span>
              <span class="badge badge-lavender">${s.reg || 'R23'}</span>
              ${s.isBuiltin ? '<span class="badge badge-green">Built-in</span>' : '<span class="badge badge-amber">Custom</span>'}
            </div>
          </div>`).join('')}
      </div>
    </div>`;
    return;
  }

  if (section === 'approvals') {
    const allReqs = JSON.parse(localStorage.getItem('edusync_url_requests') || '[]');
    const pendingReqs = allReqs.filter(r => r.status === 'pending');
    const approvedReqs = allReqs.filter(r => r.status === 'approved');
    const rejectedReqs = allReqs.filter(r => r.status === 'rejected');

    content.innerHTML = `
    <div style="padding:2rem;max-width:1000px;margin:0 auto;width:100%;">
      <div style="margin-bottom:2rem;">
        <h2 style="font-size:1.6rem;font-weight:800;letter-spacing:-0.02em;margin-bottom:8px;">URL Approvals Queue</h2>
        <p style="font-size:0.9rem;color:var(--text3);">Review, approve, or reject student-submitted resources.</p>
      </div>

      <!-- Stats Cards Row -->
      <div style="display:flex; gap:16px; margin-bottom:2rem; flex-wrap:wrap;">
        <div style="flex:1; min-width:200px; background:var(--surface); border:1px solid var(--border); border-radius:var(--radius-md); padding:1.2rem; display:flex; flex-direction:column; justify-content:center;">
           <div style="font-size:0.75rem; color:var(--text3); font-weight:700; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:8px;">Pending Requests</div>
           <div style="font-size:2rem; font-weight:800; color:var(--amber); line-height:1;">${pendingReqs.length}</div>
        </div>
        <div style="flex:1; min-width:200px; background:var(--surface); border:1px solid var(--border); border-radius:var(--radius-md); padding:1.2rem; display:flex; flex-direction:column; justify-content:center;">
           <div style="font-size:0.75rem; color:var(--text3); font-weight:700; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:8px;">Approved Requests</div>
           <div style="font-size:2rem; font-weight:800; color:var(--green); line-height:1;">${approvedReqs.length}</div>
        </div>
        <div style="flex:1; min-width:200px; background:var(--surface); border:1px solid var(--border); border-radius:var(--radius-md); padding:1.2rem; display:flex; flex-direction:column; justify-content:center;">
           <div style="font-size:0.75rem; color:var(--text3); font-weight:700; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:8px;">Rejected Requests</div>
           <div style="font-size:2rem; font-weight:800; color:var(--red); line-height:1;">${rejectedReqs.length}</div>
        </div>
      </div>

      <!-- Queue List -->
      <div style="display:flex; flex-direction:column; gap:16px;">
        ${!allReqs.length ? '<div style="text-align:center;padding:4rem;color:var(--text3);background:var(--surface);border:1px dashed var(--border);border-radius:var(--radius-md);">🎉 No URL requests in the queue.</div>' :
        allReqs.slice().reverse().map((r, i) => {
          const realIdx = allReqs.length - 1 - i;
          const statusColor = r.status === 'approved' ? 'var(--green)' : r.status === 'rejected' ? 'var(--red)' : 'var(--amber)';
          const statusBg = r.status === 'approved' ? 'rgba(34,197,94,0.1)' : r.status === 'rejected' ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)';
          const statusLabel = r.status === 'pending' ? 'Pending' : r.status === 'approved' ? 'Approved' : 'Rejected';

          return `
            <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-md);padding1.2rem; display:flex; flex-direction:column; gap:12px; transition:box-shadow 0.2s ease;">
              
              <!-- Header Row: Subject / Unit / Topic -->
              <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:12px;">
                <div style="display:flex; align-items:center; flex-wrap:wrap; gap:8px;">
                  <div style="font-weight:700; font-size:1.05rem; color:var(--text1);">${r.subject || 'Unknown Subject'}</div>
                  <div style="color:var(--text3); font-size:0.9rem;">/</div>
                  <div style="font-weight:600; font-size:0.95rem; color:var(--text2);">Unit ${r.unit || '-'}</div>
                  <div style="color:var(--text3); font-size:0.9rem;">/</div>
                  <div style="font-weight:500; font-size:0.95rem; color:var(--text2);">${r.topic || 'No Topic Specified'}</div>
                </div>
                <!-- Status Badge -->
                <div style="background:${statusBg}; color:${statusColor}; border:1px solid ${statusColor}40; padding:4px 10px; border-radius:12px; font-size:0.75rem; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; display:inline-block;">
                  ${statusLabel}
                </div>
              </div>

              <!-- Middle Row: Submitted By & Date -->
              <div style="display:flex; align-items:center; flex-wrap:wrap; gap:24px; font-size:0.85rem; color:var(--text3);">
                <div style="display:flex; align-items:center; gap:6px;">
                  <span style="opacity:0.7;">🁤</span> 
                  <span style="font-weight:500; color:var(--text2);">${r.submittedBy || 'Unknown User'}</span>
                </div>
                <div style="display:flex; align-items:center; gap:6px;">
                  <span style="opacity:0.7;">𝔐</span> 
                  <span style="font-weight:500; color:var(--text2);">${r.submittedAt || 'Unknown Time'}</span>
                </div>
              </div>

              <!-- Bottom Row: URL -->
              <div style="background:var(--bg); border:1px solid var(--border); border-radius:6px; padding10px 12px; display:flex; align-items:center; gap:8px;">
                <span style="font-size:0.9rem; opacity:0.6;">🖇</span>
                <a href="${r.url}" target="_blank" style="color:var(--primary); font-size:0.85rem; font-family:monospace; text-decoration:none; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:block; width:100%; font-weight:500;" title="${r.url}">
                  ${r.url}
                </a>
              </div>

              <!-- Action Row -->
              <div style="display:flex; justify-content:flex-end; gap:8px; flex-wrap:wrap; margin-top:4px;">
                <a href="${r.url}" target="_blank" class="btn btn-ghost btn-sm" style="font-size:0.8rem; padding:6px 12px;">👁 View Link</a>
                ${r.status === 'pending' ? `
                  <button class="btn btn-teal btn-sm" onclick="adminApproveUrl(${realIdx});renderAdminSection('approvals')" style="font-size:0.8rem; padding:6px 12px;">✅\tApprove</button>
                  <button class="btn btn-danger btn-sm" onclick="adminRejectUrl(${realIdx});renderAdminSection('approvals')" style="font-size:0.8rem; padding:6px 12px;">❌\tReject</button>
                ` : ''}
                <button class="btn btn-ghost btn-sm" onclick="typeof showToast === 'function' ? showToast('Edit action pending backend integration', 'amber') : alert('Edit action not implemented')" style="font-size:0.8rem; padding:6px 12px;">✏️ Edit</button>
                <button class="btn btn-ghost btn-sm" onclick="typeof showToast === 'function' ? showToast('Delete action pending backend integration', 'red') : alert('Delete action not implemented')" style="font-size:0.8rem; padding:6px 12px; color:var(--red);">🙁\tDelete</button>
              </div>

            </div>`;
        }).join('')}
      </div>
    </div>`;
    return;
  }
}

// ═══════════════════════════════════════════════════
//  ADMIN FEATURE MANAGEMENT
// ═══════════════════════════════════════════════════
function adminAddFeature() {
  const name = document.getElementById('adm-feature-name')?.value.trim();
  if (!name) { showToast('Enter feature name', 'red'); return; }
  const features = JSON.parse(localStorage.getItem('edusync_features') || '["Videos","Notes","PYQs","Important Questions"]');
  features.push(name);
  localStorage.setItem('edusync_features', JSON.stringify(features));
  document.getElementById('adm-feature-name').value = '';
  renderAdminSection('create');
  showToast('✅ Feature added!', 'green');
}
function adminDeleteFeature(i) {
  const features = JSON.parse(localStorage.getItem('edusync_features') || '["Videos","Notes","PYQs","Important Questions"]');
  features.splice(i, 1);
  localStorage.setItem('edusync_features', JSON.stringify(features));
  renderAdminSection('create');
  showToast('Feature deleted', 'red');
}
function adminEditFeature(i) {
  const features = JSON.parse(localStorage.getItem('edusync_features') || '["Videos","Notes","PYQs","Important Questions"]');
  const newName = prompt('Edit feature name:', features[i]);
  if (!newName) return;
  features[i] = newName.trim();
  localStorage.setItem('edusync_features', JSON.stringify(features));
  renderAdminSection('create');
  showToast('✅ Feature updated!', 'green');
}
console.log('ADMIN JS FILE LOADED');

// ═══════════════════════════════════════════════════
//  ADMIN SIDEBAR / LAUNCH — UPDATED
// ═══════════════════════════════════════════════════
function launchAdminDashboard() {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-admin').classList.add('active');
  document.getElementById('admin-role-label').textContent = 'Full Administrator';
  document.getElementById('create-subadmin-btn').style.display = 'flex';
  document.getElementById('admin-sidebar-name').textContent = 'Administrator';
  document.getElementById('admin-sidebar-role').textContent = 'Full Access';
  switchAdminSection('dashboard');
}
window.launchAdminDashboard = launchAdminDashboard;
globalThis.launchAdminDashboard = launchAdminDashboard;

// ═══════════════════════════════════════════════════
//  SUB ADMIN SIDEBAR
// ═══════════════════════════════════════════════════
function toggleSASidebar() {
  document.getElementById('sa-sidebar').classList.toggle('open');
  document.getElementById('sa-sidebar-backdrop').classList.toggle('open');
}
function closeSASidebar() {
  document.getElementById('sa-sidebar').classList.remove('open');
  document.getElementById('sa-sidebar-backdrop').classList.remove('open');
}

function switchSASection(section) {
  closeSASidebar();
  document.querySelectorAll('[id^="sa-nav-"]').forEach(el => el.classList.remove('active'));
  const navEl = document.getElementById('sa-nav-' + section);
  if (navEl) navEl.classList.add('active');
  const titles = { dashboard: 'Sub Admin Dashboard', subjects: 'Create Subject', view: 'View Subjects', curriculum: 'Curriculum', skillup: 'Skill Up' };
  const titleEl = document.getElementById('sa-topbar-title');
  if (titleEl) titleEl.textContent = titles[section] || 'Sub Admin';
  renderSASection(section);
}

function launchSubAdmin() {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-subadmin').classList.add('active');
  const sa = APP.subAdminData || {};
  const saNameEl = document.getElementById('sa-sidebar-name');
  const saInfoEl = document.getElementById('sa-sidebar-info');
  if (saNameEl) saNameEl.textContent = sa.username || 'Sub Admin';
  if (saInfoEl) saInfoEl.textContent = (sa.branch || 'Content Manager');
  switchSASection('dashboard');
}

function renderSASection(section) {
  const content = document.getElementById('sa-content');
  if (!content) return;
  const customSubjects = JSON.parse(localStorage.getItem('edusync_custom_subjects') || '[]');
  const sa = APP.subAdminData || {};

  if (section === 'dashboard') {
    const mySubs = customSubjects.filter(s => !sa.branch || s.branch === sa.branch);
    const bySem = {};
    const allSems = ['1-1', '1-2', '2-1', '2-2', '3-1', '3-2', '4-1', '4-2'];
    allSems.forEach(sem => bySem[sem] = mySubs.filter(s => s.sem === sem).length);
    const recentSubs = mySubs.slice(-3).reverse();
    const regs = [...new Set(mySubs.map(s => s.reg).filter(Boolean))];

    content.innerHTML = `
    <div style="padding:2rem;max-width:1100px;margin:0 auto;width:100%;">
      <div style="margin-bottom:1.6rem;">
        <h2 style="font-size:1.4rem;font-weight:800;letter-spacing:-0.02em;margin-bottom:4px;">📊 Sub Admin Dashboard</h2>
        <p style="font-size:0.82rem;color:var(--text3);">${sa.branch || 'Content Management'}</p>
      </div>
      <div class="admin-grid" style="margin-bottom:1.6rem;">
        <div class="admin-stat-card">
          <div class="admin-stat-accent" style="background:var(--primary);"></div>
          <div style="font-size:2.2rem;font-weight:800;color:var(--primary);">${mySubs.length}</div>
          <div style="font-size:0.88rem;font-weight:600;margin-top:4px;">Subjects Created</div>
          <div style="font-size:0.75rem;color:var(--text3);margin-top:4px;">by your account</div>
        </div>
        <div class="admin-stat-card">
          <div class="admin-stat-accent" style="background:var(--teal);"></div>
          <div style="font-size:2.2rem;font-weight:800;color:var(--teal);">${regs.length || 2}</div>
          <div style="font-size:0.88rem;font-weight:600;margin-top:4px;">Regulations</div>
          <div style="font-size:0.75rem;color:var(--text3);margin-top:4px;">${regs.join(', ') || 'R23, R20'}</div>
        </div>
        <div class="admin-stat-card">
          <div class="admin-stat-accent" style="background:var(--lavender);"></div>
          <div style="font-size:2.2rem;font-weight:800;color:var(--lavender);">${allSems.filter(s => bySem[s] > 0).length}</div>
          <div style="font-size:0.88rem;font-weight:600;margin-top:4px;">Active Semesters</div>
          <div style="font-size:0.75rem;color:var(--text3);margin-top:4px;">with content</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.4rem;margin-bottom:1.4rem;">
        <div class="card">
          <div class="section-heading" style="margin-bottom:1rem;">📋 Recently Created Subjects</div>
          ${recentSubs.length ? recentSubs.map(s => `
            <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);">
              <div style="width:36px;height:36px;border-radius:var(--radius-sm);background:var(--primary-light);display:flex;align-items:center;justify-content:center;font-size:1.1rem;flex-shrink:0;">📖</div>
              <div style="flex:1;min-width:0;">
                <div style="font-size:0.85rem;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${s.name}</div>
                <div style="font-size:0.72rem;color:var(--text3);">${s.sem} · ${s.reg}</div>
              </div>
            </div>`).join('') : '<div style="color:var(--text3);text-align:center;padding:1.5rem;">No subjects yet. Create your first one →</div>'}
        </div>
        <div class="card">
          <div class="section-heading" style="margin-bottom:1rem;">📈 Semester Analytics</div>
          ${allSems.map(sem => `
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
              <span style="font-size:0.78rem;color:var(--text2);width:40px;flex-shrink:0;">${sem}</span>
              <div style="flex:1;"><div class="progress-bar"><div class="progress-fill" style="width:${Math.min(100, bySem[sem] * 20)}%;"></div></div></div>
              <span style="font-size:0.75rem;font-weight:700;color:var(--primary);width:16px;">${bySem[sem]}</span>
            </div>`).join('')}
        </div>
      </div>
    </div>`;
    return;
  }

  if (section === 'subjects') {
    const mySubs = customSubjects.filter(s => !sa.branch || s.branch === sa.branch);
    const allSems = ['1-1', '1-2', '2-1', '2-2', '3-1', '3-2', '4-1', '4-2'];
    content.innerHTML = `
    <div style="padding:2rem;max-width:1100px;margin:0 auto;width:100%;">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:1.5rem;">
        <h2 style="font-size:1.4rem;font-weight:800;letter-spacing:-0.02em;">📚 Manage Subjects</h2>
        <button class="btn btn-primary" onclick="openSACreateSubjectForm()">+ Add Subject</button>
      </div>
      <div id="sa-create-subject-form" style="display:none;margin-bottom:1.5rem;">
        <div class="card">
          <h3 style="margin-bottom:1rem;">Create New Subject</h3>
          <div class="form-row">
            <div class="input-group"><label>Branch</label>
              <select class="select" id="sa-sub-branch"><option value="">Select Branch</option>
                ${(window.__aiiensRuntimeBranchNames || []).map(b => `<option value="${b}" ${sa.branch === b ? 'selected' : ''}>${b}</option>`).join('')}
              </select>
            </div>
            <div class="input-group"><label>Year</label>
              <select class="select" id="sa-sub-year"><option value="">Select Year</option>
                ${['1', '2', '3', '4'].map(y => `<option>Year ${y}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="input-group"><label>Semester</label>
              <select class="select" id="sa-sub-sem"><option value="">Select Semester</option>
                ${allSems.map(s => `<option value="${s}">${s}</option>`).join('')}
              </select>
            </div>
            <div class="input-group"><label>Regulation</label>
              <select class="select" id="sa-sub-reg"><option value="">Select Regulation</option>
                ${['R23', 'R20', 'R19', 'R16'].map(r => `<option value="${r}">${r}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="input-group"><label>University</label>
              <select class="select" id="sa-sub-uni"><option value="">Select University</option>
                ${(window.__aiiensRuntimeUniversityNames || []).map(u => `<option value="${u}">${u}</option>`).join('')}
              </select>
            </div>
            <div class="input-group"><label>Credits</label>
              <select class="select" id="sa-sub-credits">
                ${[2, 3, 4, 5].map(c => `<option value="${c}">${c} Credits</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="input-group"><label>Subject Name</label><input class="input" id="sa-sub-name" placeholder="e.g. Machine Learning"></div>
            <div class="input-group"><label>Subject Code</label><input class="input" id="sa-sub-code" placeholder="e.g. ML101"></div>
          </div>
          <div style="display:flex;gap:10px;">
            <button class="btn btn-primary" onclick="saCreateSubject()">✅ Create Subject</button>
            <button class="btn btn-ghost" onclick="document.getElementById('sa-create-subject-form').style.display='none'">Cancel</button>
          </div>
        </div>
      </div>
      ${mySubs.length ? `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1rem;">
        ${mySubs.map(s => `
          <div class="card" style="padding:1.2rem;cursor:pointer;" onclick="openSASubjectUnits(${s.id})">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:8px;">
              <div>
                <div style="font-weight:700;font-size:0.92rem;margin-bottom:4px;">📖 ${s.name}</div>
                <div style="font-size:0.75rem;color:var(--text3);">${s.code || '—'} · ${s.credits || 3} Cr</div>
              </div>
              <button class="btn btn-danger btn-sm" onclick="event.stopPropagation();saDeleteSubject(${s.id})" title="Delete">✕</button>
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              <span class="badge badge-primary">${s.sem}</span>
              <span class="badge badge-teal">${s.uni || 'JNTUK'}</span>
              <span class="badge badge-lavender">${s.reg || 'R23'}</span>
            </div>
            <div style="margin-top:10px;font-size:0.75rem;color:var(--primary);font-weight:600;">Click to manage units →</div>
          </div>`).join('')}
      </div>` : '<div style="text-align:center;padding:3rem;color:var(--text3);">No subjects created yet. Click "+ Add Subject" to get started.</div>'}
    </div>`;
    return;
  }

  if (section === 'view') {
    const allSems = ['1-1', '1-2', '2-1', '2-2', '3-1', '3-2', '4-1', '4-2'];
    const savedFilter = window._saViewFilter || {};
    const filterUni = savedFilter.uni || '';
    const filterReg = savedFilter.reg || '';
    const filterSem = savedFilter.sem || '';
    let filtered = customSubjects;
    if (filterUni) filtered = filtered.filter(s => s.uni === filterUni);
    if (filterReg) filtered = filtered.filter(s => s.reg === filterReg);
    if (filterSem) filtered = filtered.filter(s => s.sem === filterSem);
    content.innerHTML = `
    <div style="padding:2rem;max-width:1100px;margin:0 auto;width:100%;">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:1.5rem;">
        <h2 style="font-size:1.4rem;font-weight:800;letter-spacing:-0.02em;">👁️ View Content</h2>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <select class="select" style="width:140px;" onchange="window._saViewFilter=Object.assign(window._saViewFilter||{},{uni:this.value});renderSASection('view')">
            <option value="">All Universities</option>
            ${(window.__aiiensRuntimeUniversityNames || []).map(u => `<option value="${u}" ${filterUni === u ? 'selected' : ''}>${u}</option>`).join('')}
          </select>
          <select class="select" style="width:120px;" onchange="window._saViewFilter=Object.assign(window._saViewFilter||{},{reg:this.value});renderSASection('view')">
            <option value="">All Regulations</option>
            ${['R23', 'R20', 'R19', 'R16'].map(r => `<option value="${r}" ${filterReg === r ? 'selected' : ''}>${r}</option>`).join('')}
          </select>
          <select class="select" style="width:110px;" onchange="window._saViewFilter=Object.assign(window._saViewFilter||{},{sem:this.value});renderSASection('view')">
            <option value="">All Semesters</option>
            ${allSems.map(s => `<option value="${s}" ${filterSem === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>
      </div>
      <div style="font-size:0.82rem;color:var(--text3);margin-bottom:1rem;">Showing ${filtered.length} subjects</div>
      ${filtered.length ? `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:1rem;">
        ${filtered.map(s => `
          <div class="card" style="padding:1.2rem;">
            <div style="font-weight:700;font-size:0.92rem;margin-bottom:6px;">📖 ${s.name}</div>
            <div style="font-size:0.75rem;color:var(--text3);margin-bottom:8px;">${s.code || '—'} · ${s.credits || 3} Cr</div>
            <div style="display:flex;gap:5px;flex-wrap:wrap;">
              <span class="badge badge-primary">${s.sem}</span>
              <span class="badge badge-teal">${s.uni || 'JNTUK'}</span>
              <span class="badge badge-lavender">${s.reg || 'R23'}</span>
              <span class="badge badge-amber">${s.branch || 'All'}</span>
            </div>
          </div>`).join('')}
      </div>` : '<div style="text-align:center;padding:3rem;color:var(--text3);">No subjects match the selected filters.</div>'}
    </div>`;
  }
}

// ═══════════════════════════════════════════════════
//  SUB ADMIN SUBJECT MANAGEMENT
// ═══════════════════════════════════════════════════
function openSACreateSubjectForm() {
  const el = document.getElementById('sa-create-subject-form');
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

function saCreateSubject() {
  const branch = document.getElementById('sa-sub-branch')?.value;
  const year = document.getElementById('sa-sub-year')?.value;
  const sem = document.getElementById('sa-sub-sem')?.value;
  const reg = document.getElementById('sa-sub-reg')?.value;
  const uni = document.getElementById('sa-sub-uni')?.value;
  const name = document.getElementById('sa-sub-name')?.value.trim();
  const code = document.getElementById('sa-sub-code')?.value.trim();
  const credits = document.getElementById('sa-sub-credits')?.value || '3';
  if (!branch || !sem || !reg || !uni || !name) { showToast('Fill all required fields', 'red'); return; }
  const subjects = JSON.parse(localStorage.getItem('edusync_custom_subjects') || '[]');
  subjects.push({ branch, year, sem, reg, uni, name, code, credits, id: Date.now() });
  localStorage.setItem('edusync_custom_subjects', JSON.stringify(subjects));
  showToast('✅ Subject created and live for students!', 'green');
  switchSASection('subjects');
}

function saDeleteSubject(id) {
  const subjects = JSON.parse(localStorage.getItem('edusync_custom_subjects') || '[]');
  localStorage.setItem('edusync_custom_subjects', JSON.stringify(subjects.filter(s => s.id !== id)));
  showToast('Subject deleted', 'red');
  switchSASection('subjects');
}

function openSASubjectUnits(id) {
  const subjects = JSON.parse(localStorage.getItem('edusync_custom_subjects') || '[]');
  const subj = subjects.find(s => s.id === id);
  if (!subj) return;
  APP.saCurrentSubject = subj;
  renderSAUnitsPage(subj);
}

function renderSAUnitsPage(subj) {
  const content = document.getElementById('sa-content');
  if (!content) return;
  const units = JSON.parse(localStorage.getItem('edusync_units_' + subj.id) || '[]');
  const defaultUnits = units.length ? units : Array.from({ length: 5 }, (_, i) => ({ id: i + 1, name: `Unit ${i + 1}`, topics: [] }));
  content.innerHTML = `
  <div style="padding:2rem;max-width:1100px;margin:0 auto;width:100%;">
    <button class="back-btn" onclick="switchSASection('subjects')">← Back to Subjects</button>
    <div style="margin:1rem 0 1.5rem;">
      <h2 style="font-size:1.3rem;font-weight:800;letter-spacing:-0.02em;margin-bottom:4px;">📖 ${subj.name}</h2>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        <span class="badge badge-primary">${subj.sem}</span>
        <span class="badge badge-teal">${subj.uni}</span>
        <span class="badge badge-lavender">${subj.reg}</span>
      </div>
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;">
      <h3 style="font-size:1rem;font-weight:700;">Units (${defaultUnits.length})</h3>
      <button class="btn btn-primary btn-sm" onclick="saAddUnit(${subj.id})">+ Add Unit</button>
    </div>
    <div id="sa-units-list">
      ${defaultUnits.map((u, i) => `
        <div class="card" style="padding:1rem;margin-bottom:10px;">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
            <div style="width:32px;height:32px;border-radius:8px;background:var(--primary-light);display:flex;align-items:center;justify-content:center;font-weight:800;color:var(--primary);font-size:0.88rem;flex-shrink:0;">${u.id}</div>
            <div style="flex:1;"><span style="font-weight:700;font-size:0.9rem;">${u.name}</span></div>
            <button class="btn btn-ghost btn-sm" onclick="saEditUnit(${subj.id},${i})">✏️</button>
            <button class="btn btn-danger btn-sm" onclick="saDeleteUnit(${subj.id},${i})">✕</button>
          </div>
          <div style="margin-left:42px;">
            <div style="font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:var(--text3);margin-bottom:6px;">Subtopics</div>
            <div id="sa-topics-${u.id}" style="margin-bottom:8px;">
              ${(u.topics || []).map((t, ti) => `
                <div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:4px;font-size:0.82rem;">
                  <span style="flex:1;font-weight:600;">${t.name}</span>
                  
                  <button class="btn btn-danger btn-sm" onclick="saDeleteTopic(${subj.id},${i},${ti})">✕</button>
                </div>`).join('')}
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              <input class="input" id="sa-topic-name-${u.id}" placeholder="Subtopic name" style="max-width:200px;">

              <button class="btn btn-teal btn-sm" onclick="saAddTopic(${subj.id},${i},${u.id})">+ Add</button>
            </div>
          </div>
        </div>`).join('')}
    </div>
  </div>`;
}

function saAddUnit(subjId) {
  const name = prompt('Unit name:', 'Unit ' + (JSON.parse(localStorage.getItem('edusync_units_' + subjId) || '[]').length + 1));
  if (!name) return;
  const units = JSON.parse(localStorage.getItem('edusync_units_' + subjId) || '[]');
  const newId = units.length ? Math.max(...units.map(u => u.id)) + 1 : 1;
  units.push({ id: newId, name, topics: [] });
  localStorage.setItem('edusync_units_' + subjId, JSON.stringify(units));
  const subj = JSON.parse(localStorage.getItem('edusync_custom_subjects') || '[]').find(s => s.id === subjId);
  if (subj) renderSAUnitsPage(subj);
  showToast('✅ Unit added!', 'green');
}

function saEditUnit(subjId, idx) {
  const units = JSON.parse(localStorage.getItem('edusync_units_' + subjId) || '[]');
  if (!units[idx]) return;
  const newName = prompt('Edit unit name:', units[idx].name);
  if (!newName) return;
  units[idx].name = newName;
  localStorage.setItem('edusync_units_' + subjId, JSON.stringify(units));
  const subj = JSON.parse(localStorage.getItem('edusync_custom_subjects') || '[]').find(s => s.id === subjId);
  if (subj) renderSAUnitsPage(subj);
  showToast('✅ Unit updated!', 'green');
}

function saDeleteUnit(subjId, idx) {
  const units = JSON.parse(localStorage.getItem('edusync_units_' + subjId) || '[]');
  units.splice(idx, 1);
  localStorage.setItem('edusync_units_' + subjId, JSON.stringify(units));
  const subj = JSON.parse(localStorage.getItem('edusync_custom_subjects') || '[]').find(s => s.id === subjId);
  if (subj) renderSAUnitsPage(subj);
  showToast('Unit deleted', 'red');
}

function saAddTopic(subjId, unitIdx, unitId) {
  const nameInput = document.getElementById('sa-topic-name-' + unitId);
  const name = nameInput?.value.trim();
  if (!name) { showToast('Enter subtopic name', 'red'); return; }
  const units = JSON.parse(localStorage.getItem('edusync_units_' + subjId) || '[]');
  if (!units[unitIdx]) {
    const defaultUnits = Array.from({ length: 5 }, (_, i) => ({ id: i + 1, name: `Unit ${i + 1}`, topics: [] }));
    defaultUnits[unitIdx].topics.push({ name });
    localStorage.setItem('edusync_units_' + subjId, JSON.stringify(defaultUnits));
  } else {
    if (!units[unitIdx].topics) units[unitIdx].topics = [];
    units[unitIdx].topics.push({ name });
    localStorage.setItem('edusync_units_' + subjId, JSON.stringify(units));
  }
  if (nameInput) nameInput.value = '';
  const subj = JSON.parse(localStorage.getItem('edusync_custom_subjects') || '[]').find(s => s.id === subjId);
  if (subj) renderSAUnitsPage(subj);
  showToast('✅ Subtopic added! Visible in student roadmap.', 'green');
}

function saDeleteTopic(subjId, unitIdx, topicIdx) {
  const units = JSON.parse(localStorage.getItem('edusync_units_' + subjId) || '[]');
  if (units[unitIdx]?.topics) {
    units[unitIdx].topics.splice(topicIdx, 1);
    localStorage.setItem('edusync_units_' + subjId, JSON.stringify(units));
  }
  const subj = JSON.parse(localStorage.getItem('edusync_custom_subjects') || '[]').find(s => s.id === subjId);
  if (subj) renderSAUnitsPage(subj);
  showToast('Topic deleted', 'red');
}

// Override old launchSubAdmin to use new sidebar layout
function subAdminBack() {
  localStorage.removeItem('edusync_session_user');
  APP.adminType = null; APP.subAdminData = null;
  showScreen('screen-landing');
}

// Override renderAdminDashboard to redirect to new section renderer
renderAdminDashboard = function (activeTab) {
  // Map old tab names to new sections
  const sectionMap = { overview: 'dashboard', subadmins: 'create', urls: 'approvals' };
  const section = sectionMap[activeTab] || activeTab || 'dashboard';
  switchAdminSection(section);
}

// renderPendingUrls is already called inside openUnit body


// Keyboard shortcuts
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeLogoutModal();
    if (APP.chatOpen) toggleChat();
  }
});

// ═══════════════════════════════════════════════════
//  ADMIN/SUBADMIN COMPREHENSIVE FIXES — PATCH v2
// ═══════════════════════════════════════════════════

// ── Override switchAdminSection to include new sections ──
const _origSwitchAdminSection = switchAdminSection;
switchAdminSection = function (section) {
  closeAdminSidebar();
  document.querySelectorAll('[id^="admin-nav-"]').forEach(el => el.classList.remove('active'));
  const navEl = document.getElementById('admin-nav-' + section);
  if (navEl) navEl.classList.add('active');
  const titles = {
    dashboard: 'Admin Dashboard',
    create: 'Create & Manage',
    subjects: 'All Subjects',
    approvals: 'URL Approvals',
    creatorview: 'Creator View',
    skillup: 'Skill Up Management',
    notifications: 'Notifications'
  };
  const titleEl = document.getElementById('admin-topbar-title');
  if (titleEl) titleEl.textContent = titles[section] || 'Admin';
  renderAdminSectionFull(section);
};

// ── Override switchSASection to include new sections ──
const _origSwitchSASection = switchSASection;
switchSASection = function (section) {
  closeSASidebar();
  document.querySelectorAll('[id^="sa-nav-"]').forEach(el => el.classList.remove('active'));
  const navEl = document.getElementById('sa-nav-' + section);
  if (navEl) navEl.classList.add('active');
  const titles = {
    dashboard: 'Sub Admin Dashboard',
    subjects: 'Create Subject',
    view: 'View Content',
    skillup: 'Skill Up',
    curriculum: 'Curriculum'
  };
  const titleEl = document.getElementById('sa-topbar-title');
  if (titleEl) titleEl.textContent = titles[section] || 'Sub Admin';
  renderSASectionFull(section);
};

// ── Full admin section renderer with subject click open fix ──
function renderAdminSectionFull(section) {
  const content = document.getElementById('admin-content');
  if (!content) return;

  const customSubjects = JSON.parse(localStorage.getItem('edusync_custom_subjects') || '[]');
  const adminVideos = JSON.parse(localStorage.getItem('edusync_admin_videos') || '[]');
  const adminNotes = JSON.parse(localStorage.getItem('edusync_admin_notes') || '[]');
  const adminPYQs = JSON.parse(localStorage.getItem('edusync_admin_pyqs') || '[]');
  const adminIQs = JSON.parse(localStorage.getItem('edusync_admin_iqs') || '[]');
  const subAdmins = JSON.parse(localStorage.getItem('edusync_subadmins') || '[]');
  const urlRequests = JSON.parse(localStorage.getItem('edusync_url_requests') || '[]');
  const pending = urlRequests.filter(r => r.status === 'pending');

  // Update badge
  const badge = document.getElementById('admin-approval-badge');
  if (badge) { badge.textContent = pending.length; badge.style.display = pending.length ? 'inline-flex' : 'none'; }

  if (section === 'dashboard') { renderAdminSection('dashboard'); return; }
  if (section === 'create') { renderAdminSection('create'); return; }
  if (section === 'approvals') { renderAdminSection('approvals'); return; }
  if (section === 'notifications') { renderAdminNotificationsUI(); return; }

  if (section === 'skillup') {
    const skills = JSON.parse(localStorage.getItem('edusync_skills') || '[]');
    const skillVideos = JSON.parse(localStorage.getItem('edusync_skill_videos') || '[]');
    const skillNotes = JSON.parse(localStorage.getItem('edusync_skill_notes') || '[]');
    content.innerHTML = `
    <div style="padding:2rem;max-width:1200px;margin:0 auto;width:100%;">
      <h2 style="font-size:1.4rem;font-weight:800;letter-spacing:-0.02em;margin-bottom:1.5rem;">⚡ Skill Up Management</h2>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.4rem;align-items:start;">
        <div class="card">
          <h3 style="margin-bottom:1rem;">➕ Create Skill Course</h3>
          <div class="input-group"><label>Skill Name</label><input class="input" id="adm-skillname2" placeholder="e.g. Python Programming"></div>
          <div class="input-group"><label>Description</label><textarea class="input" id="adm-skilldesc2" rows="2" placeholder="Brief description..." style="resize:vertical;"></textarea></div>
          <div class="form-row">
            <div class="input-group"><label>Category</label>
              <select class="select" id="adm-skillcat2">
                <option value="coding">💻 Coding</option><option value="aptitude">🧠 Aptitude</option>
                <option value="communication">🗣️ Communication</option><option value="ai">🤖 AI & ML</option>
                <option value="certification">🏆 Certification</option><option value="other">⭐ Other</option>
              </select>
            </div>
            <div class="input-group"><label>Level</label>
              <select class="select" id="adm-skilllevel2">
                <option value="Beginner">🟢 Beginner</option><option value="Intermediate">🟡 Intermediate</option><option value="Advanced">🔴 Advanced</option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="input-group"><label>Icon (emoji)</label><input class="input" id="adm-skillicon2" placeholder="💻" maxlength="4"></div>
            <div class="input-group"><label>Duration</label><input class="input" id="adm-skillduration2" placeholder="e.g. 8 hours"></div>
          </div>
          <button class="btn btn-primary" onclick="adminCreateSkillV2()" style="width:100%;">⚡ Create Skill Course</button>
          <hr style="margin:1.2rem 0;border-color:var(--border);">
          <h4 style="margin-bottom:0.8rem;">🎬 Add Video to Skill</h4>
          <div class="input-group"><label>Skill</label>
            <select class="select" id="adm-skillvid-skill2">${skills.length ? skills.map(s => `<option value="${s.id}">${s.name}</option>`).join('') : '<option>No skills yet</option>'}</select></div>
          <div class="input-group"><label>Video Title</label><input class="input" id="adm-skillvid-title2" placeholder="e.g. Intro to Python"></div>
          <div class="input-group"><label>YouTube URL</label><input class="input" id="adm-skillvid-url2" placeholder="https://youtube.com/..." type="url"></div>
          <button class="btn btn-teal" onclick="adminAddSkillVideoV2()" style="width:100%;">📤 Add Video</button>
        </div>
        <div class="card">
          <h3 style="margin-bottom:1rem;">⚡ All Skill Courses (${skills.length})</h3>
          <div style="max-height:600px;overflow-y:auto;">
            ${skills.length ? skills.map(s => {
      const vids = skillVideos.filter(v => v.skillId == s.id);
      const notes = skillNotes.filter(n => n.skillId == s.id);
      return `<div style="border:1px solid var(--border);border-radius:var(--radius-md);margin-bottom:10px;overflow:hidden;">
                <div style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:var(--lavender-light);">
                  <span style="font-size:1.4rem;">${s.icon || '⚡'}</span>
                  <div style="flex:1;"><div style="font-weight:700;font-size:0.9rem;">${s.name}</div><div style="font-size:0.72rem;color:var(--text3);">${s.category} · ${s.level} · ${vids.length} videos · ${notes.length} notes</div></div>
                  <button class="btn btn-danger btn-sm" onclick="adminDeleteSkill(${s.id});switchAdminSection('skillup')">🗑</button>
                </div>
                ${vids.length ? '<div style="padding:6px 12px;font-size:0.78rem;">' + vids.map(v => `<div style="display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid var(--border);">🎬 <span style="flex:1;">${v.title}</span><button class="btn btn-danger btn-sm" style="padding:2px 8px;font-size:0.7rem;" onclick="adminDeleteSkillVideo(${v.id});switchAdminSection('skillup')">✕</button></div>`).join('') + '</div>' : ''}
              </div>`;
    }).join('') : '<div style="color:var(--text3);text-align:center;padding:2rem;">No skill courses yet</div>'}
          </div>
        </div>
      </div>
    </div>`;
    return;
  }

  if (section === 'creatorview') {
    content.innerHTML = `
    <div style="padding:2rem;max-width:1200px;margin:0 auto;width:100%;">
      <h2 style="font-size:1.4rem;font-weight:800;letter-spacing:-0.02em;margin-bottom:1.5rem;">🎨 Creator View</h2>
      <div class="card" style="margin-bottom:1.4rem;">
        <div class="section-heading" style="margin-bottom:1rem;">👥 Content Creators Overview</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:1rem;">
          ${(() => {
        const subAdminsAll = [...subAdmins];
        return subAdminsAll.map(sa => `
              <div class="card" style="padding:1rem;">
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
                  <div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,var(--teal),var(--primary));display:flex;align-items:center;justify-content:center;font-weight:800;color:#fff;font-size:0.9rem;">${sa.username[0].toUpperCase()}</div>
                  <div><div style="font-weight:700;font-size:0.88rem;">${sa.username}</div><div style="font-size:0.72rem;color:var(--text3);">${sa.branch}</div></div>
                </div>
                <div style="display:flex;gap:6px;flex-wrap:wrap;">
                  <span class="badge badge-teal">${customSubjects.filter(s => s.branch === sa.branch).length} subjects</span>
                  <span class="badge badge-green">Active</span>
                </div>
              </div>`).join('');
      })()}
        </div>
      </div>
      <div class="card">
        <div class="section-heading" style="margin-bottom:1rem;">📋 Recent Content Activity</div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          ${adminVideos.slice(-5).reverse().map(v => `
            <div style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--surface2);border-radius:var(--radius-sm);">
              <span style="font-size:1.2rem;">🎬</span>
              <div style="flex:1;"><div style="font-weight:600;font-size:0.85rem;">${v.title}</div><div style="font-size:0.72rem;color:var(--text3);">${v.subject || '—'} · Unit ${v.unit || '—'}</div></div>
              <span class="badge badge-green">Live</span>
            </div>`).join('')}
          ${adminNotes.slice(-3).reverse().map(n => `
            <div style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--surface2);border-radius:var(--radius-sm);">
              <span style="font-size:1.2rem;">📄</span>
              <div style="flex:1;"><div style="font-weight:600;font-size:0.85rem;">${n.title}</div><div style="font-size:0.72rem;color:var(--text3);">${n.subject || '—'} · ${n.type?.toUpperCase()}</div></div>
              <span class="badge badge-primary">Note</span>
            </div>`).join('')}
          ${(!adminVideos.length && !adminNotes.length) ? '<div style="color:var(--text3);text-align:center;padding:1.5rem;">No content uploaded yet</div>' : ''}
        </div>
      </div>
    </div>`;
    return;
  }

  // subjects section with CLICK TO OPEN + edit/delete
  if (section === 'subjects') {
    const allSems = ['1-1', '1-2', '2-1', '2-2', '3-1', '3-2', '4-1', '4-2'];
    const unis = window.__aiiensRuntimeUniversityNames || [];
    const regs = ['R23', 'R20', 'R19', 'R16'];
    const branches = window.__aiiensRuntimeBranchNames || [];
    const savedFilter = window._adminSubjectFilter || {};
    const filterUni = savedFilter.uni || '';
    const filterReg = savedFilter.reg || '';
    const filterSem = savedFilter.sem || '';
    const filterBranch = savedFilter.branch || '';

    let allSubjects = [];
    allSems.forEach(sem => {
      const builtins = SUBJECTS_DB[sem] || [];
      builtins.forEach(s => allSubjects.push({ ...s, sem, reg: 'R23', uni: 'JNTUK', branch: s.branch || 'CSE', isBuiltin: true }));
    });
    customSubjects.forEach(s => allSubjects.push({ ...s, isBuiltin: false }));

    let filtered = allSubjects;
    if (filterUni) filtered = filtered.filter(s => s.uni === filterUni);
    if (filterReg) filtered = filtered.filter(s => s.reg === filterReg);
    if (filterSem) filtered = filtered.filter(s => s.sem === filterSem);
    if (filterBranch) filtered = filtered.filter(s => (s.branch || 'CSE') === filterBranch);

    content.innerHTML = `
    <div style="padding:2rem;max-width:1200px;margin:0 auto;width:100%;">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:1.5rem;">
        <h2 style="font-size:1.4rem;font-weight:800;letter-spacing:-0.02em;">📚 All Subjects</h2>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <select class="select" style="width:130px;" onchange="window._adminSubjectFilter=Object.assign(window._adminSubjectFilter||{},{uni:this.value});renderAdminSectionFull('subjects')">
            <option value="">All Universities</option>${unis.map(u => `<option value="${u}" ${filterUni === u ? 'selected' : ''}>${u}</option>`).join('')}
          </select>
          <select class="select" style="width:120px;" onchange="window._adminSubjectFilter=Object.assign(window._adminSubjectFilter||{},{reg:this.value});renderAdminSectionFull('subjects')">
            <option value="">All Regulations</option>${regs.map(r => `<option value="${r}" ${filterReg === r ? 'selected' : ''}>${r}</option>`).join('')}
          </select>
          <select class="select" style="width:110px;" onchange="window._adminSubjectFilter=Object.assign(window._adminSubjectFilter||{},{sem:this.value});renderAdminSectionFull('subjects')">
            <option value="">All Semesters</option>${allSems.map(s => `<option value="${s}" ${filterSem === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
          <select class="select" style="width:110px;" onchange="window._adminSubjectFilter=Object.assign(window._adminSubjectFilter||{},{branch:this.value});renderAdminSectionFull('subjects')">
            <option value="">All Branches</option>${branches.map(b => `<option value="${b}" ${filterBranch === b ? 'selected' : ''}>${b}</option>`).join('')}
          </select>
        </div>
      </div>
      <div style="font-size:0.82rem;color:var(--text3);margin-bottom:1rem;">Showing ${filtered.length} subjects — click a card to manage it</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1rem;">
        ${filtered.map(s => `
          <div class="card" style="padding:1.2rem;cursor:pointer;position:relative;" onclick="adminOpenSubject(${JSON.stringify(s).replace(/"/g, '&quot;')})">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:8px;">
              <div>
                <div style="font-weight:700;font-size:0.92rem;margin-bottom:4px;">${s.icon || '📖'} ${s.name}</div>
                <div style="font-size:0.75rem;color:var(--text3);">${s.code || '—'} · ${s.credits || 3} Cr · ${s.branch || 'CSE'}</div>
              </div>
              <div style="display:flex;gap:4px;" onclick="event.stopPropagation()">
                ${!s.isBuiltin ? `<button class="btn-icon" onclick="adminEditSubjectModal(${s.id})" title="Edit" style="font-size:0.8rem;padding:5px;">✏️</button>` : ''}
                ${!s.isBuiltin ? `<button class="btn-icon" onclick="adminDeleteSubjectConfirm(${s.id},'${(s.name || '').replace(/'/g, "\\'")}')" title="Delete" style="font-size:0.8rem;padding:5px;color:var(--red);">🗑</button>` : ''}
              </div>
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">
              <span class="badge badge-primary">${s.sem}</span>
              <span class="badge badge-teal">${s.uni || 'JNTUK'}</span>
              <span class="badge badge-lavender">${s.reg || 'R23'}</span>
              ${s.isBuiltin ? '<span class="badge badge-green">Built-in</span>' : '<span class="badge badge-amber">Custom</span>'}
            </div>
            <div style="font-size:0.75rem;color:var(--primary);font-weight:600;">🔍 Click to open & manage →</div>
          </div>`).join('')}
      </div>
    </div>
    ${getAdminModals()}`;
    return;
  }
}

// ── Admin subject open (units→topics→content) ──
function adminOpenSubject(s) {
  if (typeof s === 'string') try { s = JSON.parse(s); } catch (e) { }
  const content = document.getElementById('admin-content');
  if (!content) return;
  const units = JSON.parse(localStorage.getItem('edusync_units_' + s.id) || '[]');
  const defaultUnits = units.length ? units : Array.from({ length: 5 }, (_, i) => ({ id: i + 1, name: `Unit ${i + 1}`, topics: [] }));

  content.innerHTML = `
  <div style="padding:2rem;max-width:1200px;margin:0 auto;width:100%;">
    <button class="back-btn" onclick="renderAdminSectionFull('subjects')">← Back to Subjects</button>
    <div style="margin:1rem 0 1.5rem;">
      <h2 style="font-size:1.3rem;font-weight:800;letter-spacing:-0.02em;margin-bottom:4px;">📖 ${s.name}</h2>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;">
        <span class="badge badge-primary">${s.sem}</span>
        <span class="badge badge-teal">${s.uni || 'JNTUK'}</span>
        <span class="badge badge-lavender">${s.reg || 'R23'}</span>
        <span class="badge badge-amber">${s.branch || 'CSE'}</span>
      </div>
    </div>

    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;">
      <h3 style="font-size:1rem;font-weight:700;">📚 Units</h3>
      ${!s.isBuiltin ? `<button class="btn btn-primary btn-sm" onclick="adminAddUnit(${s.id})">+ Add Unit</button>` : ''}
    </div>

    <div id="admin-units-list">
      ${defaultUnits.map((u, ui) => `
        <div class="card" style="margin-bottom:1rem;">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
            <div style="width:36px;height:36px;border-radius:8px;background:var(--primary-light);display:flex;align-items:center;justify-content:center;font-weight:800;color:var(--primary);flex-shrink:0;">${u.id}</div>
            <div style="flex:1;font-weight:700;font-size:0.95rem;">${u.name}</div>
            ${!s.isBuiltin ? `
              <button class="btn-icon" onclick="adminEditUnit(${s.id},${ui})" title="Edit Unit">✏️</button>
              <button class="btn-icon" onclick="adminDeleteUnit(${s.id},${ui})" title="Delete Unit" style="color:var(--red);">🗑</button>
            ` : ''}
          </div>

          <!-- Topics -->
          <div style="margin-left:46px;">
            <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:var(--text3);margin-bottom:8px;">Subtopics</div>
            ${(u.topics || []).map((t, ti) => `
              <div style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:4px;font-size:0.83rem;">
                <span style="flex:1;font-weight:600;">📌 ${t.name}</span>
                
                ${!s.isBuiltin ? `
                  <button class="btn-icon btn-sm" onclick="adminEditTopic(${s.id},${ui},${ti})" style="font-size:0.7rem;padding:3px 6px;" title="Edit">✏️</button>
                  <button class="btn-icon btn-sm" onclick="adminDeleteTopic(${s.id},${ui},${ti})" style="font-size:0.7rem;padding:3px 6px;color:var(--red);" title="Delete">✕</button>
                ` : ''}
              </div>`).join('')}
            ${!s.isBuiltin ? `
              <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;">
                <input class="input" id="admin-topic-name-${u.id}" placeholder="New subtopic name" style="max-width:200px;">
                <input class="input" id="admin-topic-url-${u.id}" placeholder="YouTube URL (optional)" style="max-width:240px;">
                <button class="btn btn-teal btn-sm" onclick="adminAddTopic(${s.id},${ui},${u.id})">+ Add Subtopic</button>
              </div>
            ` : ''}
          </div>

          <!-- Content management links -->
          <div style="margin-left:46px;margin-top:12px;padding-top:12px;border-top:1px solid var(--border);">
            <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:var(--text3);margin-bottom:8px;">Content</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <button class="btn btn-ghost btn-sm" onclick="adminManageContent('notes','${(s.name || '').replace(/'/g, "\\'")}',${u.id})">📄 Notes (${JSON.parse(localStorage.getItem('edusync_admin_notes') || '[]').filter(n => n.subject === s.name && parseInt(n.unit) === u.id).length})</button>
              <button class="btn btn-ghost btn-sm" onclick="adminManageContent('pyqs','${(s.name || '').replace(/'/g, "\\'")}',${u.id})">📝 PYQs (${JSON.parse(localStorage.getItem('edusync_admin_pyqs') || '[]').filter(p => p.subject === s.name && parseInt(p.unit) === u.id).length})</button>
              <button class="btn btn-ghost btn-sm" onclick="adminManageContent('iqs','${(s.name || '').replace(/'/g, "\\'")}',${u.id})">⭐ IQs (${JSON.parse(localStorage.getItem('edusync_admin_iqs') || '[]').filter(q => q.subject === s.name && parseInt(q.unit) === u.id).length})</button>
              <button class="btn btn-ghost btn-sm" onclick="adminManageContent('videos','${(s.name || '').replace(/'/g, "\\'")}',${u.id})">🎬 Videos (${JSON.parse(localStorage.getItem('edusync_admin_videos') || '[]').filter(v => v.subject === s.name && parseInt(v.unit) === u.id).length})</button>
            </div>
          </div>
        </div>`).join('')}
    </div>
  </div>
  ${getAdminModals()}`;

  window._adminCurrentSubject = s;
}

// ── Admin content management panel ──
function adminManageContent(type, subjectName, unitId) {
  const content = document.getElementById('admin-content');
  const s = window._adminCurrentSubject;
  const subjectOptions = `<option value="${subjectName}" selected>${subjectName}</option>`;
  const unitOptions = `<option value="${unitId}" selected>Unit ${unitId}</option>`;

  const adminNotes = JSON.parse(localStorage.getItem('edusync_admin_notes') || '[]');
  const adminPYQs = JSON.parse(localStorage.getItem('edusync_admin_pyqs') || '[]');
  const adminIQs = JSON.parse(localStorage.getItem('edusync_admin_iqs') || '[]');
  const adminVideos = JSON.parse(localStorage.getItem('edusync_admin_videos') || '[]');

  let panelHTML = '';

  if (type === 'notes') {
    const unitNotes = adminNotes.filter(n => n.subject === subjectName && parseInt(n.unit) === parseInt(unitId));
    panelHTML = `
      <h3 style="margin-bottom:1rem;">📄 Notes — ${subjectName} / Unit ${unitId}</h3>
      <div class="card" style="margin-bottom:1rem;">
        <h4 style="margin-bottom:0.8rem;">Add Note</h4>
        <div class="input-group"><label>Title</label><input class="input" id="cm-note-title" placeholder="Note title"></div>
        <div class="form-row">
          <div class="input-group"><label>Type</label><select class="select" id="cm-note-type"><option value="pdf">PDF</option><option value="doc">DOC</option><option value="link">Link</option></select></div>
          <div class="input-group"><label>Link/URL</label><input class="input" id="cm-note-link" placeholder="https://..."></div>
        </div>
        <button class="btn btn-primary btn-sm" onclick="adminAddContentNote('${subjectName.replace(/'/g, "\\'")}',${unitId})">+ Add Note</button>
      </div>
      <div>
        ${unitNotes.map(n => `
          <div style="display:flex;align-items:center;gap:8px;padding:9px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:6px;font-size:0.83rem;">
            <span style="font-size:1.1rem;">${n.type === 'pdf' ? '📄' : n.type === 'doc' ? '📝' : '🔗'}</span>
            <div style="flex:1;"><div style="font-weight:600;">${n.title}</div><div style="font-size:0.72rem;color:var(--text3);">${n.type?.toUpperCase()} · ${n.uploadedAt || ''}</div></div>
            <button class="btn-icon" onclick="adminEditNote(${n.id})" style="font-size:0.8rem;">✏️</button>
            <button class="btn-icon" onclick="adminDeleteNoteConfirm(${n.id},'${(n.title || '').replace(/'/g, "\\'")}','${subjectName.replace(/'/g, "\\'")}',${unitId})" style="color:var(--red);font-size:0.8rem;">🗑</button>
          </div>`).join('')}
        ${!unitNotes.length ? '<div style="color:var(--text3);text-align:center;padding:1rem;">No notes for this unit</div>' : ''}
      </div>`;
  } else if (type === 'pyqs') {
    const unitPYQs = adminPYQs.filter(p => p.subject === subjectName && parseInt(p.unit) === parseInt(unitId));
    panelHTML = `
      <h3 style="margin-bottom:1rem;">📝 PYQs — ${subjectName} / Unit ${unitId}</h3>
      <div class="card" style="margin-bottom:1rem;">
        <h4 style="margin-bottom:0.8rem;">Add PYQ</h4>
        <div class="input-group"><label>Question</label><textarea class="input" id="cm-pyq-text" rows="2" placeholder="Enter question..." style="resize:vertical;"></textarea></div>
        <div class="form-row">
          <div class="input-group"><label>Year</label><input class="input" id="cm-pyq-year" placeholder="2023" type="number"></div>
          <div class="input-group"><label>Repeated Count</label><input class="input" id="cm-pyq-count" placeholder="1" type="number" value="1"></div>
        </div>
        <div class="input-group"><label>Answer (optional)</label><textarea class="input" id="cm-pyq-ans" rows="2" placeholder="Answer..." style="resize:vertical;"></textarea></div>
        <button class="btn btn-primary btn-sm" onclick="adminAddContentPYQ('${subjectName.replace(/'/g, "\\'")}',${unitId})">+ Add PYQ</button>
      </div>
      <div>
        ${unitPYQs.map(p => `
          <div style="display:flex;align-items:flex-start;gap:8px;padding:9px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:6px;font-size:0.83rem;">
            <div style="flex:1;"><div style="font-weight:600;line-height:1.4;">${p.question.substring(0, 100)}${p.question.length > 100 ? '...' : ''}</div><div style="font-size:0.72rem;color:var(--text3);">Year: ${p.year} · ×${p.count}</div></div>
            <button class="btn-icon" onclick="adminEditPYQ(${p.id})" style="font-size:0.8rem;">✏️</button>
            <button class="btn-icon" onclick="adminDeletePYQConfirm(${p.id},'${subjectName.replace(/'/g, "\\'")}',${unitId})" style="color:var(--red);font-size:0.8rem;">🗑</button>
          </div>`).join('')}
        ${!unitPYQs.length ? '<div style="color:var(--text3);text-align:center;padding:1rem;">No PYQs for this unit</div>' : ''}
      </div>`;
  } else if (type === 'iqs') {
    const unitIQs = adminIQs.filter(q => q.subject === subjectName && parseInt(q.unit) === parseInt(unitId));
    panelHTML = `
      <h3 style="margin-bottom:1rem;">⭐ Important Questions — ${subjectName} / Unit ${unitId}</h3>
      <div class="card" style="margin-bottom:1rem;">
        <h4 style="margin-bottom:0.8rem;">Add Important Question</h4>
        <div class="input-group"><label>Question</label><textarea class="input" id="cm-iq-text" rows="2" placeholder="Enter important question..." style="resize:vertical;"></textarea></div>
        <div class="form-row">
          <div class="input-group"><label>Priority</label>
            <select class="select" id="cm-iq-priority"><option value="high">🔴 High</option><option value="med" selected>🟡 Medium</option><option value="low">🟢 Low</option></select>
          </div>
          <div class="input-group"><label>Tags</label><input class="input" id="cm-iq-tags" placeholder="Unit 1, Memory"></div>
        </div>
        <button class="btn btn-primary btn-sm" onclick="adminAddContentIQ('${subjectName.replace(/'/g, "\\'")}',${unitId})">+ Add Question</button>
      </div>
      <div>
        ${unitIQs.map(q => `
          <div style="display:flex;align-items:flex-start;gap:8px;padding:9px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:6px;font-size:0.83rem;">
            <div style="flex:1;"><div style="font-weight:600;line-height:1.4;">${q.question.substring(0, 100)}${q.question.length > 100 ? '...' : ''}</div><span class="badge ${q.priority === 'high' ? 'badge-red' : q.priority === 'med' ? 'badge-amber' : 'badge-green'}">${q.priority}</span></div>
            <button class="btn-icon" onclick="adminEditIQ(${q.id})" style="font-size:0.8rem;">✏️</button>
            <button class="btn-icon" onclick="adminDeleteIQConfirm(${q.id},'${subjectName.replace(/'/g, "\\'")}',${unitId})" style="color:var(--red);font-size:0.8rem;">🗑</button>
          </div>`).join('')}
        ${!unitIQs.length ? '<div style="color:var(--text3);text-align:center;padding:1rem;">No important questions for this unit</div>' : ''}
      </div>`;
  } else if (type === 'videos') {
    const unitVideos = adminVideos.filter(v => v.subject === subjectName && parseInt(v.unit) === parseInt(unitId));
    panelHTML = `
      <h3 style="margin-bottom:1rem;">🎬 Videos — ${subjectName} / Unit ${unitId}</h3>
      <div class="card" style="margin-bottom:1rem;">
        <h4 style="margin-bottom:0.8rem;">Add Video</h4>
        <div class="input-group"><label>Video Title</label><input class="input" id="cm-vid-title" placeholder="e.g. Introduction to Unit 1"></div>
        <div class="input-group"><label>YouTube URL</label><input class="input" id="cm-vid-url" placeholder="https://youtube.com/watch?v=..." type="url"></div>
        <button class="btn btn-primary btn-sm" onclick="adminAddContentVideo('${subjectName.replace(/'/g, "\\'")}',${unitId})">+ Add Video</button>
      </div>
      <div>
        ${unitVideos.map(v => `
          <div style="display:flex;align-items:center;gap:8px;padding:9px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:6px;font-size:0.83rem;">
            <span style="font-size:1.2rem;">🎬</span>
            <div style="flex:1;"><div style="font-weight:600;">${v.title}</div><div style="font-size:0.72rem;color:var(--text3);">${v.url || 'No URL'}</div></div>
            <button class="btn-icon" onclick="adminEditVideo(${v.id})" style="font-size:0.8rem;">✏️</button>
            <button class="btn-icon" onclick="adminDeleteVideoConfirm(${v.id},'${subjectName.replace(/'/g, "\\'")}',${unitId})" style="color:var(--red);font-size:0.8rem;">🗑</button>
          </div>`).join('')}
        ${!unitVideos.length ? '<div style="color:var(--text3);text-align:center;padding:1rem;">No videos for this unit</div>' : ''}
      </div>`;
  }

  content.innerHTML = `
  <div style="padding:2rem;max-width:1100px;margin:0 auto;width:100%;">
    <button class="back-btn" onclick="adminOpenSubject(window._adminCurrentSubject)">← Back to Units</button>
    <div style="margin-top:1.5rem;">${panelHTML}</div>
  </div>
  ${getAdminModals()}`;
}

// ── Content CRUD helpers ──
function adminAddContentNote(subjectName, unitId) {
  const title = document.getElementById('cm-note-title')?.value.trim();
  const type = document.getElementById('cm-note-type')?.value;
  const link = document.getElementById('cm-note-link')?.value.trim();
  if (!title) { showToast('Enter note title', 'red'); return; }
  const notes = JSON.parse(localStorage.getItem('edusync_admin_notes') || '[]');
  notes.push({ id: Date.now(), title, type, link, subject: subjectName, unit: unitId, uploadedAt: new Date().toLocaleDateString() });
  localStorage.setItem('edusync_admin_notes', JSON.stringify(notes));
  showToast('✅ Note added!', 'green');
  adminManageContent('notes', subjectName, unitId);
}

function adminAddContentPYQ(subjectName, unitId) {
  const question = document.getElementById('cm-pyq-text')?.value.trim();
  const year = document.getElementById('cm-pyq-year')?.value;
  const count = document.getElementById('cm-pyq-count')?.value || '1';
  const answer = document.getElementById('cm-pyq-ans')?.value.trim();
  if (!question || !year) { showToast('Enter question and year', 'red'); return; }
  const pyqs = JSON.parse(localStorage.getItem('edusync_admin_pyqs') || '[]');
  pyqs.push({ id: Date.now(), question, year, count: parseInt(count), answer, subject: subjectName, unit: unitId });
  localStorage.setItem('edusync_admin_pyqs', JSON.stringify(pyqs));
  showToast('✅ PYQ added!', 'green');
  adminManageContent('pyqs', subjectName, unitId);
}

function adminAddContentIQ(subjectName, unitId) {
  const question = document.getElementById('cm-iq-text')?.value.trim();
  const priority = document.getElementById('cm-iq-priority')?.value;
  const tags = document.getElementById('cm-iq-tags')?.value.trim();
  if (!question) { showToast('Enter question', 'red'); return; }
  const iqs = JSON.parse(localStorage.getItem('edusync_admin_iqs') || '[]');
  iqs.push({ id: Date.now(), question, priority, tags, subject: subjectName, unit: unitId });
  localStorage.setItem('edusync_admin_iqs', JSON.stringify(iqs));
  showToast('✅ Important question added!', 'green');
  adminManageContent('iqs', subjectName, unitId);
}

function adminAddContentVideo(subjectName, unitId) {
  const title = document.getElementById('cm-vid-title')?.value.trim();
  const url = document.getElementById('cm-vid-url')?.value.trim();
  if (!title || !url) { showToast('Enter title and URL', 'red'); return; }
  const videos = JSON.parse(localStorage.getItem('edusync_admin_videos') || '[]');
  videos.push({ id: Date.now(), title, url, subject: subjectName, unit: unitId });
  localStorage.setItem('edusync_admin_videos', JSON.stringify(videos));
  showToast('✅ Video added!', 'green');
  adminManageContent('videos', subjectName, unitId);
}

// ── Edit note/pyq/iq/video (uses prompt for quick edit) ──
function adminEditNote(id) {
  const notes = JSON.parse(localStorage.getItem('edusync_admin_notes') || '[]');
  const n = notes.find(x => x.id === id);
  if (!n) return;
  const newTitle = prompt('Edit note title:', n.title);
  if (!newTitle) return;
  const newLink = prompt('Edit link/URL:', n.link || '');
  n.title = newTitle.trim();
  if (newLink !== null) n.link = newLink.trim();
  localStorage.setItem('edusync_admin_notes', JSON.stringify(notes));
  showToast('✅ Note updated!', 'green');
  adminManageContent('notes', n.subject, n.unit);
}

function adminEditPYQ(id) {
  const pyqs = JSON.parse(localStorage.getItem('edusync_admin_pyqs') || '[]');
  const p = pyqs.find(x => x.id === id);
  if (!p) return;
  const newQ = prompt('Edit question:', p.question);
  if (!newQ) return;
  const newYear = prompt('Edit year:', p.year);
  const newCount = prompt('Edit repeated count:', p.count);
  p.question = newQ.trim();
  if (newYear) p.year = newYear;
  if (newCount) p.count = parseInt(newCount);
  localStorage.setItem('edusync_admin_pyqs', JSON.stringify(pyqs));
  showToast('✅ PYQ updated!', 'green');
  adminManageContent('pyqs', p.subject, p.unit);
}

function adminEditIQ(id) {
  const iqs = JSON.parse(localStorage.getItem('edusync_admin_iqs') || '[]');
  const q = iqs.find(x => x.id === id);
  if (!q) return;
  const newQ = prompt('Edit question:', q.question);
  if (!newQ) return;
  const newPriority = prompt('Edit priority (high/med/low):', q.priority);
  q.question = newQ.trim();
  if (newPriority && ['high', 'med', 'low'].includes(newPriority)) q.priority = newPriority;
  localStorage.setItem('edusync_admin_iqs', JSON.stringify(iqs));
  showToast('✅ Question updated!', 'green');
  adminManageContent('iqs', q.subject, q.unit);
}

function adminEditVideo(id) {
  const videos = JSON.parse(localStorage.getItem('edusync_admin_videos') || '[]');
  const v = videos.find(x => x.id === id);
  if (!v) return;
  const newTitle = prompt('Edit video title:', v.title);
  if (!newTitle) return;
  const newUrl = prompt('Edit YouTube URL:', v.url || '');
  v.title = newTitle.trim();
  if (newUrl !== null) v.url = newUrl.trim();
  localStorage.setItem('edusync_admin_videos', JSON.stringify(videos));
  showToast('✅ Video updated!', 'green');
  adminManageContent('videos', v.subject, v.unit);
}

// ── Delete confirm helpers ──
function adminDeleteNoteConfirm(id, title, subjectName, unitId) {
  if (!confirm(`Delete note "${title}"?`)) return;
  const notes = JSON.parse(localStorage.getItem('edusync_admin_notes') || '[]');
  localStorage.setItem('edusync_admin_notes', JSON.stringify(notes.filter(n => n.id !== id)));
  showToast('Note deleted', 'red');
  adminManageContent('notes', subjectName, unitId);
}

function adminDeletePYQConfirm(id, subjectName, unitId) {
  if (!confirm('Delete this PYQ?')) return;
  const pyqs = JSON.parse(localStorage.getItem('edusync_admin_pyqs') || '[]');
  localStorage.setItem('edusync_admin_pyqs', JSON.stringify(pyqs.filter(p => p.id !== id)));
  showToast('PYQ deleted', 'red');
  adminManageContent('pyqs', subjectName, unitId);
}

function adminDeleteIQConfirm(id, subjectName, unitId) {
  if (!confirm('Delete this important question?')) return;
  const iqs = JSON.parse(localStorage.getItem('edusync_admin_iqs') || '[]');
  localStorage.setItem('edusync_admin_iqs', JSON.stringify(iqs.filter(q => q.id !== id)));
  showToast('Question deleted', 'red');
  adminManageContent('iqs', subjectName, unitId);
}

function adminDeleteVideoConfirm(id, subjectName, unitId) {
  if (!confirm('Delete this video?')) return;
  const videos = JSON.parse(localStorage.getItem('edusync_admin_videos') || '[]');
  localStorage.setItem('edusync_admin_videos', JSON.stringify(videos.filter(v => v.id !== id)));
  showToast('Video deleted', 'red');
  adminManageContent('videos', subjectName, unitId);
}

// ── Admin unit management ──
function adminAddUnit(subjId) {
  const name = prompt('Unit name:');
  if (!name) return;
  const units = JSON.parse(localStorage.getItem('edusync_units_' + subjId) || '[]');
  const newId = units.length ? Math.max(...units.map(u => u.id)) + 1 : 1;
  units.push({ id: newId, name: name.trim(), topics: [] });
  localStorage.setItem('edusync_units_' + subjId, JSON.stringify(units));
  showToast('✅ Unit added!', 'green');
  adminOpenSubject(window._adminCurrentSubject);
}

function adminEditUnit(subjId, idx) {
  const units = JSON.parse(localStorage.getItem('edusync_units_' + subjId) || '[]');
  if (!units[idx]) return;
  const newName = prompt('Edit unit name:', units[idx].name);
  if (!newName) return;
  units[idx].name = newName.trim();
  localStorage.setItem('edusync_units_' + subjId, JSON.stringify(units));
  showToast('✅ Unit updated!', 'green');
  adminOpenSubject(window._adminCurrentSubject);
}

function adminDeleteUnit(subjId, idx) {
  if (!confirm('Delete this unit and all its topics?')) return;
  const units = JSON.parse(localStorage.getItem('edusync_units_' + subjId) || '[]');
  units.splice(idx, 1);
  localStorage.setItem('edusync_units_' + subjId, JSON.stringify(units));
  showToast('Unit deleted', 'red');
  adminOpenSubject(window._adminCurrentSubject);
}

function adminAddTopic(subjId, unitIdx, unitId) {
  const nameInput = document.getElementById('admin-topic-name-' + unitId);
  const urlInput = document.getElementById('admin-topic-url-' + unitId);
  const name = nameInput?.value.trim();
  const url = urlInput?.value.trim();
  if (!name) { showToast('Enter subtopic name', 'red'); return; }
  let units = JSON.parse(localStorage.getItem('edusync_units_' + subjId) || '[]');
  if (!units.length) {
    units = Array.from({ length: 5 }, (_, i) => ({ id: i + 1, name: `Unit ${i + 1}`, topics: [] }));
  }
  if (!units[unitIdx]) return;
  if (!units[unitIdx].topics) units[unitIdx].topics = [];
  const topic = {
    id: Date.now() + Math.random(),
    topicName: name,
    youtubeUrl: url,
    name,
    url,
    notes: [],
    pyqs: [],
    importantQuestions: []
  };
  console.log('Saving Topic:', topic);
  units[unitIdx].topics.push(topic);
  localStorage.setItem('edusync_units_' + subjId, JSON.stringify(units));
  showToast('✅ Subtopic added!', 'green');
  adminOpenSubject(window._adminCurrentSubject);
}

function adminEditTopic(subjId, unitIdx, topicIdx) {
  const units = JSON.parse(localStorage.getItem('edusync_units_' + subjId) || '[]');
  if (!units[unitIdx]?.topics?.[topicIdx]) return;
  const t = units[unitIdx].topics[topicIdx];
  const newName = prompt('Edit topic name:', t.topicName || t.name || '');
  if (!newName) return;
  const newUrl = prompt('Edit YouTube URL (optional):', t.youtubeUrl || t.url || '');
  t.topicName = newName.trim();
  t.name = newName.trim();
  if (newUrl !== null) {
    t.youtubeUrl = newUrl.trim();
    t.url = newUrl.trim();
  }
  console.log('Saving Topic:', t);
  localStorage.setItem('edusync_units_' + subjId, JSON.stringify(units));
  showToast('✅ Topic updated!', 'green');
  adminOpenSubject(window._adminCurrentSubject);
}

function adminDeleteTopic(subjId, unitIdx, topicIdx) {
  if (!confirm('Delete this topic?')) return;
  const units = JSON.parse(localStorage.getItem('edusync_units_' + subjId) || '[]');
  if (units[unitIdx]?.topics) {
    units[unitIdx].topics.splice(topicIdx, 1);
    localStorage.setItem('edusync_units_' + subjId, JSON.stringify(units));
  }
  showToast('Topic deleted', 'red');
  adminOpenSubject(window._adminCurrentSubject);
}

// ── Admin edit/delete subject ──
function adminEditSubjectModal(id) {
  const subjects = JSON.parse(localStorage.getItem('edusync_custom_subjects') || '[]');
  const s = subjects.find(x => x.id === id);
  if (!s) return;
  const newName = prompt('Edit subject name:', s.name);
  if (!newName) return;
  const newSem = prompt('Edit semester (e.g. 2-1):', s.sem);
  const newReg = prompt('Edit regulation (e.g. R23):', s.reg);
  const newUni = prompt('Edit university:', s.uni);
  const newBranch = prompt('Edit branch (e.g. CSE):', s.branch);
  s.name = newName.trim();
  if (newSem) s.sem = newSem.trim();
  if (newReg) s.reg = newReg.trim();
  if (newUni) s.uni = newUni.trim();
  if (newBranch) s.branch = newBranch.trim();
  localStorage.setItem('edusync_custom_subjects', JSON.stringify(subjects));
  showToast('✅ Subject updated!', 'green');
  renderAdminSectionFull('subjects');
}

function adminDeleteSubjectConfirm(id, name) {
  if (!confirm(`Delete subject "${name}" and all its data (units, topics, content)?`)) return;
  const subjects = JSON.parse(localStorage.getItem('edusync_custom_subjects') || '[]');
  localStorage.setItem('edusync_custom_subjects', JSON.stringify(subjects.filter(s => s.id !== id)));
  // Clean up related data
  localStorage.removeItem('edusync_units_' + id);
  ['edusync_admin_notes', 'edusync_admin_pyqs', 'edusync_admin_iqs', 'edusync_admin_videos'].forEach(key => {
    const items = JSON.parse(localStorage.getItem(key) || '[]');
    localStorage.setItem(key, JSON.stringify(items.filter(x => x.subject !== name)));
  });
  showToast('Subject deleted', 'red');
  renderAdminSectionFull('subjects');
}

// ── Admin SubAdmin edit helper ──
function adminEditSubAdminEntry(idx) {
  const subAdmins = JSON.parse(localStorage.getItem('edusync_subadmins') || '[]');
  if (!subAdmins[idx]) return;
  const sa = subAdmins[idx];
  const newPass = prompt('New password for ' + sa.username + ':', sa.password);
  if (!newPass) return;
  const newBranch = prompt('Branch:', sa.branch);
  sa.password = newPass;
  if (newBranch) sa.branch = newBranch;
  localStorage.setItem('edusync_subadmins', JSON.stringify(subAdmins));
  showToast('✅ Sub Admin updated!', 'green');
  renderAdminSectionFull('create');
}

// ── Skill Up v2 helpers ──
function adminCreateSkillV2() {
  const name = document.getElementById('adm-skillname2')?.value.trim();
  const desc = document.getElementById('adm-skilldesc2')?.value.trim();
  const cat = document.getElementById('adm-skillcat2')?.value;
  const level = document.getElementById('adm-skilllevel2')?.value;
  const icon = document.getElementById('adm-skillicon2')?.value.trim() || '⚡';
  const duration = document.getElementById('adm-skillduration2')?.value.trim();
  if (!name) { showToast('Enter skill name', 'red'); return; }
  const skills = JSON.parse(localStorage.getItem('edusync_skills') || '[]');
  skills.push({ id: Date.now(), name, description: desc, category: cat, level, icon, duration });
  localStorage.setItem('edusync_skills', JSON.stringify(skills));
  showToast('✅ Skill course created!', 'green');
  switchAdminSection('skillup');
}

function adminAddSkillVideoV2() {
  const skillId = document.getElementById('adm-skillvid-skill2')?.value;
  const title = document.getElementById('adm-skillvid-title2')?.value.trim();
  const url = document.getElementById('adm-skillvid-url2')?.value.trim();
  if (!skillId || !title || !url) { showToast('Fill all video fields', 'red'); return; }
  const videos = JSON.parse(localStorage.getItem('edusync_skill_videos') || '[]');
  videos.push({ id: Date.now(), skillId, title, url });
  localStorage.setItem('edusync_skill_videos', JSON.stringify(videos));
  showToast('✅ Video added to skill!', 'green');
  switchAdminSection('skillup');
}

// ── Modal HTML shared helper ──
function getAdminModals() {
  return `
  <div class="modal-overlay" id="admin-confirm-modal" onclick="if(event.target===this)this.classList.remove('open')">
    <div class="modal">
      <div id="admin-confirm-body"></div>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:1.5rem;">
        <button class="btn btn-ghost" onclick="document.getElementById('admin-confirm-modal').classList.remove('open')">Cancel</button>
        <button class="btn btn-danger" id="admin-confirm-ok">Confirm Delete</button>
      </div>
    </div>
  </div>`;
}

// ── Full Sub Admin section renderer ──
function renderSASectionFull(section) {
  const content = document.getElementById('sa-content');
  if (!content) return;
  const customSubjects = JSON.parse(localStorage.getItem('edusync_custom_subjects') || '[]');
  const sa = APP.subAdminData || {};

  if (section === 'dashboard' || section === 'subjects' || section === 'view') {
    renderSASection(section);
    return;
  }

  if (section === 'skillup') {
    const skills = JSON.parse(localStorage.getItem('edusync_skills') || '[]');
    const skillVideos = JSON.parse(localStorage.getItem('edusync_skill_videos') || '[]');
    content.innerHTML = `
    <div style="padding:2rem;max-width:1100px;margin:0 auto;width:100%;">
      <h2 style="font-size:1.4rem;font-weight:800;letter-spacing:-0.02em;margin-bottom:1.5rem;">⚡ Skill Up</h2>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1rem;">
        ${skills.map(s => {
      const vids = skillVideos.filter(v => v.skillId == s.id);
      return `<div class="card" style="padding:1.2rem;">
            <div style="font-size:2rem;margin-bottom:0.5rem;">${s.icon || '⚡'}</div>
            <div style="font-weight:700;margin-bottom:4px;">${s.name}</div>
            <div style="font-size:0.78rem;color:var(--text3);margin-bottom:8px;">${s.category} · ${s.level} · ${vids.length} videos</div>
            <p style="font-size:0.83rem;color:var(--text2);line-height:1.5;margin-bottom:10px;">${s.description || ''}</p>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              <span class="badge badge-lavender">${s.duration || '—'}</span>
              <span class="badge badge-green">Available</span>
            </div>
          </div>`;
    }).join('')}
        ${!skills.length ? '<div style="color:var(--text3);text-align:center;padding:2rem;grid-column:1/-1;">No skill courses yet. Admin creates them.</div>' : ''}
      </div>
    </div>`;
    return;
  }

  if (section === 'curriculum') {
    const mySubs = customSubjects.filter(s => !sa.branch || s.branch === sa.branch);
    content.innerHTML = `
    <div style="padding:2rem;max-width:1100px;margin:0 auto;width:100%;">
      <h2 style="font-size:1.4rem;font-weight:800;letter-spacing:-0.02em;margin-bottom:1.5rem;">🎯 Creator Subjects</h2>
      <p style="font-size:0.85rem;color:var(--text2);margin-bottom:1.5rem;">Your subjects and their full learning curriculum</p>
      ${mySubs.map(s => {
      const units = JSON.parse(localStorage.getItem('edusync_units_' + s.id) || '[]');
      const topicsTotal = units.reduce((sum, u) => sum + (u.topics || []).length, 0);
      return `<div class="card" style="margin-bottom:1rem;padding:1.2rem;">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
            <div style="width:40px;height:40px;border-radius:var(--radius-sm);background:var(--primary-light);display:flex;align-items:center;justify-content:center;font-size:1.2rem;">📖</div>
            <div style="flex:1;">
              <div style="font-weight:700;">${s.name}</div>
              <div style="font-size:0.75rem;color:var(--text3);">${s.sem} · ${s.reg} · ${s.branch}</div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:1.2rem;font-weight:800;color:var(--primary);">${units.length}</div>
              <div style="font-size:0.72rem;color:var(--text3);">units</div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:1.2rem;font-weight:800;color:var(--teal);">${topicsTotal}</div>
              <div style="font-size:0.72rem;color:var(--text3);">topics</div>
            </div>
          </div>
          <div class="progress-bar" style="margin-bottom:4px;"><div class="progress-fill" style="width:${Math.min(100, topicsTotal * 5)}%;"></div></div>
          <div style="font-size:0.72rem;color:var(--text3);">${topicsTotal} of 20 suggested topics covered</div>
        </div>`;
    }).join('')}
      ${!mySubs.length ? '<div class="card" style="text-align:center;padding:2rem;color:var(--text3);">No subjects created yet. Go to Subjects tab to create your first one.</div>' : ''}
    </div>`;
    return;
  }
}

// ── Override renderAdminDashboard to handle new sections ──
renderAdminDashboard = function (activeTab) {
  const sectionMap = { overview: 'dashboard', subadmins: 'create', urls: 'approvals' };
  const section = sectionMap[activeTab] || activeTab || 'dashboard';
  renderAdminSectionFull(section);
};

// ── Override launchAdminDashboard ──
launchAdminDashboard = function () {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-admin').classList.add('active');
  document.getElementById('admin-role-label').textContent = 'Full Administrator';
  document.getElementById('create-subadmin-btn').style.display = 'flex';
  document.getElementById('admin-sidebar-name').textContent = 'Administrator';
  document.getElementById('admin-sidebar-role').textContent = 'Full Access';
  const preserved = String(window.__aimeasyPreserveRoleRoute || '');
  const [, section] = preserved.split('/').filter(Boolean);
  switchAdminSection(section || 'dashboard');
};

// ── Override launchSubAdmin ──
launchSubAdmin = function () {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-subadmin').classList.add('active');
  const sa = APP.subAdminData || {};
  const saNameEl = document.getElementById('sa-sidebar-name');
  const saInfoEl = document.getElementById('sa-sidebar-info');
  if (saNameEl) saNameEl.textContent = sa.username || 'Sub Admin';
  if (saInfoEl) saInfoEl.textContent = (sa.branch || 'Content Manager');
  const preserved = String(window.__aimeasyPreserveRoleRoute || '');
  const [, section] = preserved.split('/').filter(Boolean);
  switchSASection(section || 'dashboard');
};

// ── SA subjects section with filter ──
const _origRenderSASection = renderSASection;
renderSASection = function (section) {
  const content = document.getElementById('sa-content');
  if (!content) return;
  const customSubjects = JSON.parse(localStorage.getItem('edusync_custom_subjects') || '[]');
  const sa = APP.subAdminData || {};

  if (section === 'subjects') {
    const allSems = ['1-1', '1-2', '2-1', '2-2', '3-1', '3-2', '4-1', '4-2'];
    const branches = window.__aiiensRuntimeBranchNames || [];
    const unis = window.__aiiensRuntimeUniversityNames || [];
    const regs = ['R23', 'R20', 'R19', 'R16'];
    const savedFilter = window._saSubjectFilter || {};
    const filterBranch = savedFilter.branch || sa.branch || '';
    const filterSem = savedFilter.sem || '';
    const filterReg = savedFilter.reg || '';
    const filterUni = savedFilter.uni || '';

    let mySubs = customSubjects;
    if (filterBranch) mySubs = mySubs.filter(s => s.branch === filterBranch);
    if (filterSem) mySubs = mySubs.filter(s => s.sem === filterSem);
    if (filterReg) mySubs = mySubs.filter(s => s.reg === filterReg);
    if (filterUni) mySubs = mySubs.filter(s => s.uni === filterUni);

    content.innerHTML = `
    <div style="padding:2rem;max-width:1100px;margin:0 auto;width:100%;">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:1rem;">
        <h2 style="font-size:1.4rem;font-weight:800;letter-spacing:-0.02em;">📚 Manage Subjects</h2>
        <button class="btn btn-primary" onclick="openSACreateSubjectForm()">+ Add Subject</button>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:1.2rem;">
        <select class="select" style="width:120px;" onchange="window._saSubjectFilter=Object.assign(window._saSubjectFilter||{},{uni:this.value});renderSASection('subjects')">
          <option value="">All Universities</option>${unis.map(u => `<option value="${u}" ${filterUni === u ? 'selected' : ''}>${u}</option>`).join('')}
        </select>
        <select class="select" style="width:120px;" onchange="window._saSubjectFilter=Object.assign(window._saSubjectFilter||{},{reg:this.value});renderSASection('subjects')">
          <option value="">All Regulations</option>${regs.map(r => `<option value="${r}" ${filterReg === r ? 'selected' : ''}>${r}</option>`).join('')}
        </select>
        <select class="select" style="width:110px;" onchange="window._saSubjectFilter=Object.assign(window._saSubjectFilter||{},{sem:this.value});renderSASection('subjects')">
          <option value="">All Semesters</option>${allSems.map(s => `<option value="${s}" ${filterSem === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
        <select class="select" style="width:110px;" onchange="window._saSubjectFilter=Object.assign(window._saSubjectFilter||{},{branch:this.value});renderSASection('subjects')">
          <option value="">All Branches</option>${branches.map(b => `<option value="${b}" ${filterBranch === b ? 'selected' : ''}>${b}</option>`).join('')}
        </select>
      </div>
      <div id="sa-create-subject-form" style="display:none;margin-bottom:1.5rem;">
        <div class="card">
          <h3 style="margin-bottom:1rem;">Create New Subject</h3>
          <div class="form-row">
            <div class="input-group"><label>Branch</label>
              <select class="select" id="sa-sub-branch"><option value="">Select Branch</option>
                ${branches.map(b => `<option value="${b}" ${sa.branch === b ? 'selected' : ''}>${b}</option>`).join('')}
              </select>
            </div>
            <div class="input-group"><label>Year</label>
              <select class="select" id="sa-sub-year"><option value="">Select Year</option>
                ${['1', '2', '3', '4'].map(y => `<option value="${y}">Year ${y}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="input-group"><label>Semester</label>
              <select class="select" id="sa-sub-sem"><option value="">Select Semester</option>
                ${allSems.map(s => `<option value="${s}">${s}</option>`).join('')}
              </select>
            </div>
            <div class="input-group"><label>Regulation</label>
              <select class="select" id="sa-sub-reg"><option value="">Select Regulation</option>
                ${['R23', 'R20', 'R19', 'R16'].map(r => `<option value="${r}">${r}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="input-group"><label>University</label>
              <select class="select" id="sa-sub-uni"><option value="">Select University</option>
                ${unis.map(u => `<option value="${u}">${u}</option>`).join('')}
              </select>
            </div>
            <div class="input-group"><label>Credits</label>
              <select class="select" id="sa-sub-credits">
                ${[2, 3, 4, 5].map(c => `<option value="${c}">${c} Credits</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="input-group"><label>Subject Name</label><input class="input" id="sa-sub-name" placeholder="e.g. Machine Learning"></div>
            <div class="input-group"><label>Subject Code</label><input class="input" id="sa-sub-code" placeholder="e.g. ML101"></div>
          </div>
          <div style="display:flex;gap:10px;">
            <button class="btn btn-primary" onclick="saCreateSubjectNew()" style="flex:1;">+ Create Subject</button>
            <button class="btn btn-ghost" onclick="document.getElementById('sa-create-subject-form').style.display='none'">Cancel</button>
          </div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1rem;">
        ${mySubs.map(s => `
          <div class="card" style="padding:1.2rem;cursor:pointer;" onclick="renderSAUnitsPage(${JSON.stringify(s).replace(/"/g, '&quot;')})">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:8px;">
              <div style="font-weight:700;font-size:0.92rem;">📖 ${s.name}</div>
              <div style="display:flex;gap:4px;" onclick="event.stopPropagation()">
                <button class="btn-icon" onclick="saEditSubject(${s.id})" style="font-size:0.8rem;padding:5px;" title="Edit">✏️</button>
                <button class="btn-icon" onclick="saDeleteSubjectConfirm(${s.id},'${(s.name || '').replace(/'/g, "\\'")}','${(s.branch || '').replace(/'/g, "\\'")}',${s.sem ? `'${s.sem}'` : 'undefined'})" style="font-size:0.8rem;padding:5px;color:var(--red);" title="Delete">🗑</button>
              </div>
            </div>
            <div style="font-size:0.75rem;color:var(--text3);margin-bottom:8px;">${s.code || '—'} · ${s.credits || 3} Cr · ${s.branch || 'CSE'}</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              <span class="badge badge-primary">${s.sem || '—'}</span>
              <span class="badge badge-teal">${s.uni || 'JNTUK'}</span>
              <span class="badge badge-lavender">${s.reg || 'R23'}</span>
            </div>
            <div style="font-size:0.75rem;color:var(--primary);font-weight:600;margin-top:8px;">📋 Click to manage →</div>
          </div>`).join('')}
        ${!mySubs.length ? '<div style="color:var(--text3);text-align:center;padding:2rem;grid-column:1/-1;">No subjects match this filter</div>' : ''}
      </div>
    </div>`;
    return;
  }

  _origRenderSASection(section);
};

openSACreateSubjectForm = function () {
  const form = document.getElementById('sa-create-subject-form');
  if (form) form.style.display = form.style.display === 'none' ? 'block' : 'none';
}

function saCreateSubjectNew() {
  const branch = document.getElementById('sa-sub-branch')?.value;
  const year = document.getElementById('sa-sub-year')?.value;
  const sem = document.getElementById('sa-sub-sem')?.value;
  const reg = document.getElementById('sa-sub-reg')?.value;
  const uni = document.getElementById('sa-sub-uni')?.value;
  const credits = document.getElementById('sa-sub-credits')?.value;
  const name = document.getElementById('sa-sub-name')?.value.trim();
  const code = document.getElementById('sa-sub-code')?.value.trim();
  if (!branch || !sem || !reg || !uni || !name) { showToast('Fill all required fields', 'red'); return; }
  const subjects = JSON.parse(localStorage.getItem('edusync_custom_subjects') || '[]');
  subjects.push({ id: Date.now(), branch, year, sem, reg, uni, credits, name, code });
  localStorage.setItem('edusync_custom_subjects', JSON.stringify(subjects));
  showToast('✅ Subject created! Now visible to students.', 'green');
  renderSASection('subjects');
}

function saEditSubject(id) {
  const subjects = JSON.parse(localStorage.getItem('edusync_custom_subjects') || '[]');
  const s = subjects.find(x => x.id === id);
  if (!s) return;
  const newName = prompt('Edit subject name:', s.name);
  if (!newName) return;
  const newSem = prompt('Edit semester:', s.sem);
  const newReg = prompt('Edit regulation:', s.reg);
  s.name = newName.trim();
  if (newSem) s.sem = newSem;
  if (newReg) s.reg = newReg;
  localStorage.setItem('edusync_custom_subjects', JSON.stringify(subjects));
  showToast('✅ Subject updated!', 'green');
  renderSASection('subjects');
}

function saDeleteSubjectConfirm(id, name) {
  if (!confirm(`Delete subject "${name}" and all its content?`)) return;
  const subjects = JSON.parse(localStorage.getItem('edusync_custom_subjects') || '[]');
  localStorage.setItem('edusync_custom_subjects', JSON.stringify(subjects.filter(s => s.id !== id)));
  localStorage.removeItem('edusync_units_' + id);
  showToast('Subject deleted', 'red');
  renderSASection('subjects');
}

/* ═══════════════════════════════════════════════════════════════════════
   V10 CURRICULUM SYSTEM — Complete clean replacement
   Handles: Admin 3-dot menus, SA subject→unit→roadmap+content flow
   ═══════════════════════════════════════════════════════════════════════ */

/* ── Inject styles once ── */
(function () {
  if (document.getElementById('v10-styles')) return;
  const el = document.createElement('style');
  el.id = 'v10-styles';
  el.textContent = `
/* ── 3-dot popup ── */
.v10-dot-wrap { position:relative; display:inline-block; }
.v10-dot-btn {
  width:30px; height:30px; border-radius:8px; background:transparent; border:none;
  cursor:pointer; font-size:1.3rem; color:var(--text3); display:flex; align-items:center;
  justify-content:center; transition:background 0.15s;
}
.v10-dot-btn:hover { background:var(--surface2); color:var(--text); }
.v10-popup {
  position:absolute; top:calc(100% + 4px); right:0; z-index:500;
  background:var(--surface); border:1px solid var(--border);
  border-radius:var(--radius-md); box-shadow:0 8px 32px rgba(0,0,0,0.12);
  min-width:160px; overflow:hidden;
  animation:scaleIn .15s cubic-bezier(.34,1.56,.64,1) both;
  transform-origin:top right;
}
.v10-popup-item {
  display:flex; align-items:center; gap:10px;
  padding:10px 16px; font-size:0.84rem; font-weight:500;
  cursor:pointer; border:none; background:transparent;
  width:100%; text-align:left; color:var(--text); transition:background .15s;
}
.v10-popup-item:hover { background:var(--surface2); }
.v10-popup-item.red { color:var(--red); }
.v10-popup-item.red:hover { background:var(--red-light); }
.v10-popup-item.muted { color:var(--text3); cursor:default; font-size:0.78rem; }
.v10-popup-item.muted:hover { background:transparent; }

/* ── Subject grid ── */
.v10-subj-grid {
  display:grid;
  grid-template-columns:repeat(auto-fill, minmax(268px,1fr));
  gap:1rem;
}
.v10-subj-card {
  background:var(--surface); border:1.5px solid var(--border);
  border-radius:var(--radius-lg); padding:1.3rem 1.3rem 1.1rem;
  cursor:pointer; transition:var(--transition); position:relative; overflow:visible;
}
.v10-subj-card:hover {
  border-color:var(--primary); transform:translateY(-3px);
  box-shadow:0 6px 24px rgba(79,142,247,0.14);
}
.v10-subj-icon {
  width:44px; height:44px; border-radius:var(--radius-sm);
  background:linear-gradient(135deg,var(--primary-light),var(--lavender-light));
  display:flex; align-items:center; justify-content:center;
  font-size:1.4rem; margin-bottom:10px; flex-shrink:0;
}
.v10-subj-name { font-weight:700; font-size:0.94rem; margin-bottom:3px; }
.v10-subj-meta { font-size:0.74rem; color:var(--text3); margin-bottom:10px; }
.v10-arrow { font-size:0.74rem; font-weight:600; color:var(--primary); margin-top:8px; }

/* ── Unit cards ── */
.v10-unit-grid {
  display:grid;
  grid-template-columns:repeat(auto-fill, minmax(240px,1fr));
  gap:1rem; margin-top:1rem;
}
.v10-unit-card {
  background:var(--surface); border:1.5px solid var(--border);
  border-radius:var(--radius-lg); padding:1.2rem;
  cursor:pointer; transition:var(--transition); position:relative;
}
.v10-unit-card:hover {
  border-color:var(--lavender); transform:translateY(-3px);
  box-shadow:0 6px 24px rgba(139,117,245,0.14);
}
.v10-unit-num {
  width:44px; height:44px; border-radius:var(--radius-sm);
  background:linear-gradient(135deg,var(--lavender),var(--primary));
  display:flex; align-items:center; justify-content:center;
  color:#fff; font-weight:800; font-size:1.15rem; margin-bottom:10px;
}
.v10-unit-name { font-weight:700; font-size:0.9rem; margin-bottom:4px; }
.v10-unit-meta { font-size:0.74rem; color:var(--text3); }
.v10-unit-badges { display:flex; gap:5px; flex-wrap:wrap; margin-top:8px; }
.v10-unit-arrow { font-size:0.74rem; font-weight:600; color:var(--lavender); margin-top:8px; }

/* ── Unit detail 2-panel layout ── */
.v10-detail-wrap {
  display:grid; grid-template-columns:1fr 1fr;
  gap:1.4rem; margin-top:1.4rem; align-items:start;
}
@media(max-width:880px) { .v10-detail-wrap { grid-template-columns:1fr; } }

.v10-panel {
  background:var(--surface); border:1px solid var(--border);
  border-radius:var(--radius-lg); overflow:hidden;
}
.v10-panel-head {
  padding:.9rem 1.2rem;
  background:linear-gradient(135deg,var(--primary-light),var(--lavender-light));
  border-bottom:1px solid var(--border);
  display:flex; align-items:center; justify-content:space-between; gap:8px;
}
.v10-panel-head h4 { font-size:.9rem; font-weight:700; margin:0; }
.v10-panel-body { padding:1.1rem; }

/* ── Roadmap topics ── */
.v10-topic-row {
  display:flex; align-items:flex-start; gap:10px;
  margin-bottom:10px; position:relative;
}
.v10-topic-row::after {
  content:''; position:absolute; left:10px; top:22px;
  height:calc(100% + 6px); width:2px; background:var(--border); z-index:0;
}
.v10-topic-row:last-of-type::after { display:none; }
.v10-dot {
  width:20px; height:20px; border-radius:50%; flex-shrink:0; z-index:1; margin-top:11px;
  display:flex; align-items:center; justify-content:center;
  font-size:.55rem; font-weight:800; color:#fff;
  background:var(--border); border:2.5px solid var(--surface);
  box-shadow:0 0 0 2px var(--border-hover); transition:background .2s;
}
.v10-dot.filled { background:var(--primary); box-shadow:0 0 0 2px var(--primary-mid); }
.v10-topic-fields { flex:1; display:flex; flex-direction:column; gap:5px; }
.v10-topic-fields input {
  padding:8px 11px; border:1.5px solid var(--border);
  border-radius:var(--radius-sm); font-size:.83rem; font-family:var(--font);
  color:var(--text); outline:none; width:100%; transition:border-color .2s;
}
.v10-topic-fields input:focus { border-color:var(--primary); }
.v10-topic-fields input.filled { border-color:var(--primary-mid); }
.v10-rm-btn {
  width:28px; height:28px; border-radius:8px; background:transparent; border:none;
  cursor:pointer; color:var(--text3); font-size:.9rem; margin-top:10px; flex-shrink:0;
  display:flex; align-items:center; justify-content:center; transition:var(--transition);
}
.v10-rm-btn:hover { background:var(--red-light); color:var(--red); }

/* ── Content panel tabs ── */
.v10-tabs {
  display:flex; background:var(--surface2);
  border-bottom:1px solid var(--border); overflow-x:auto;
}
.v10-tab {
  padding:10px 14px; font-size:.82rem; font-weight:600;
  color:var(--text2); border:none; background:transparent;
  cursor:pointer; border-bottom:2.5px solid transparent;
  transition:var(--transition); white-space:nowrap;
}
.v10-tab.on { color:var(--lavender); border-bottom-color:var(--lavender); background:var(--surface); }
.v10-tab:hover:not(.on) { background:var(--surface); color:var(--text); }
.v10-pane { display:none; }
.v10-pane.on { display:block; }

/* ── Upload form ── */
.v10-form { padding:1.2rem; }
.v10-form p.hint {
  font-size:.79rem; color:var(--text2); margin-bottom:1rem; line-height:1.5;
}
.v10-label {
  display:block; font-size:.69rem; font-weight:700; text-transform:uppercase;
  letter-spacing:.08em; color:var(--text2); margin-bottom:4px;
}
.v10-2col { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
.v10-submit {
  display:flex; align-items:center; justify-content:center; gap:8px;
  width:100%; padding:13px; border-radius:50px;
  background:linear-gradient(135deg,#7C5CFC,#9B7CFF);
  color:#fff; font-family:var(--font); font-size:.9rem; font-weight:700;
  border:none; cursor:pointer; margin-top:.9rem;
  box-shadow:0 4px 16px rgba(124,92,252,.35); transition:var(--transition);
}
.v10-submit:hover { background:linear-gradient(135deg,#6B4BEB,#8A6BEE); transform:translateY(-1px); }
.v10-submit:active { transform:scale(.97); }

/* ── Uploaded items list ── */
.v10-items { padding:0 1.2rem 1.2rem; }
.v10-items-head {
  font-size:.75rem; font-weight:700; color:var(--text2);
  margin-bottom:8px; padding-top:2px;
}
.v10-item {
  display:flex; align-items:flex-start; gap:8px;
  padding:9px 12px; background:var(--surface2);
  border:1px solid var(--border); border-radius:var(--radius-sm);
  margin-bottom:6px; font-size:.82rem;
}
.v10-item-body { flex:1; min-width:0; }
.v10-item-title { font-weight:600; line-height:1.35; }
.v10-item-meta { font-size:.71rem; color:var(--text3); margin-top:2px; }
.v10-del {
  width:26px; height:26px; border-radius:8px; border:none;
  background:transparent; cursor:pointer; color:var(--text3);
  font-size:.9rem; flex-shrink:0; display:flex; align-items:center;
  justify-content:center; transition:var(--transition);
}
.v10-del:hover { background:var(--red-light); color:var(--red); }

/* Create-subject form */
.v10-create-form {
  background:var(--surface); border:1.5px solid var(--primary-mid);
  border-radius:var(--radius-lg); padding:1.4rem; margin-bottom:1.4rem;
  animation:fadeIn .25s ease both;
}
`;
  document.head.appendChild(el);
})();

/* ── Close popups on outside click ── */
document.addEventListener('click', function (e) {
  if (!e.target.closest('.v10-dot-wrap')) {
    document.querySelectorAll('.v10-popup').forEach(p => p.remove());
  }
});

/* ═══════════════════════════════════════════════════════════════
   ADMIN: subjects section with clickable cards + 3-dot menu
   ═══════════════════════════════════════════════════════════════ */
function v10AdminSubjects() {
  const content = document.getElementById('admin-content');
  if (!content) return;

  const customSubjects = JSON.parse(localStorage.getItem('edusync_custom_subjects') || '[]');
  const allSems = ['1-1', '1-2', '2-1', '2-2', '3-1', '3-2', '4-1', '4-2'];
  const managedRegs = (() => {
    try {
      const cached = JSON.parse(localStorage.getItem('aimeasy_cached_regulations') || '[]');
      const legacy = JSON.parse(localStorage.getItem('edusync_regulations') || '[]');
      return [...new Set([...cached, ...legacy].map(item => String(item?.regulation_name || item?.regulation_code || item?.name || item || '').trim().toUpperCase()).filter(Boolean))];
    } catch (e) {
      return [];
    }
  })();
  const unis = window.__aiiensRuntimeUniversityNames || [];
  const regs = managedRegs.length ? managedRegs : ['R23', 'R20', 'R19', 'R16'];
  const branches = window.__aiiensRuntimeBranchNames || [];
  const f = window._v10AdminFilter || {};

  let all = [];
  allSems.forEach(sem => {
    (SUBJECTS_DB[sem] || []).forEach(s =>
      all.push({ ...s, sem, reg: 'R23', uni: 'JNTUK', branch: s.branch || 'CSE', isBuiltin: true })
    );
  });
  customSubjects.forEach(s => all.push({ ...s, isBuiltin: false }));

  if (f.uni) all = all.filter(s => s.uni === f.uni);
  if (f.reg) all = all.filter(s => s.reg === f.reg);
  if (f.sem) all = all.filter(s => s.sem === f.sem);
  if (f.branch) all = all.filter(s => (s.branch || 'CSE') === f.branch);

  const filterBar = `
  <div style="display:flex;gap:8px;flex-wrap:wrap;">
    <select class="select" style="width:130px;" onchange="window._v10AdminFilter=Object.assign(window._v10AdminFilter||{},{uni:this.value});v10AdminSubjects()">
      <option value="">All Universities</option>${unis.map(u => `<option value="${u}"${f.uni === u ? ' selected' : ''}>${u}</option>`).join('')}
    </select>
    <select class="select" style="width:115px;" onchange="window._v10AdminFilter=Object.assign(window._v10AdminFilter||{},{reg:this.value});v10AdminSubjects()">
      <option value="">All Regulations</option>${regs.map(r => `<option value="${r}"${f.reg === r ? ' selected' : ''}>${r}</option>`).join('')}
    </select>
    <select class="select" style="width:105px;" onchange="window._v10AdminFilter=Object.assign(window._v10AdminFilter||{},{sem:this.value});v10AdminSubjects()">
      <option value="">All Sems</option>${allSems.map(s => `<option value="${s}"${f.sem === s ? ' selected' : ''}>${s}</option>`).join('')}
    </select>
    <select class="select" style="width:110px;" onchange="window._v10AdminFilter=Object.assign(window._v10AdminFilter||{},{branch:this.value});v10AdminSubjects()">
      <option value="">All Branches</option>${branches.map(b => `<option value="${b}"${f.branch === b ? ' selected' : ''}>${b}</option>`).join('')}
    </select>
  </div>`;

  const cards = all.map(s => {
    const id = s.id || ('bi-' + s.sem + '-' + s.code);
    const safeName = (s.name || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const safeS = encodeURIComponent(JSON.stringify(s));
    return `
    <div class="v10-subj-card" onclick="v10AdminOpenSubject('${safeS}')">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:6px;">
        <div class="v10-subj-icon">${s.icon || '📖'}</div>
        <div class="v10-dot-wrap" onclick="event.stopPropagation()">
          <button class="v10-dot-btn" onclick="v10DotMenu(this,${JSON.stringify({ id: s.id, name: s.name, isBuiltin: !!s.isBuiltin }).replace(/"/g, '&quot;')})">⋯</button>
        </div>
      </div>
      <div class="v10-subj-name">${s.name}</div>
      <div class="v10-subj-meta">${s.code || '—'} · ${s.credits || 3} Cr · ${s.branch || 'CSE'}</div>
      <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:4px;">
        <span class="badge badge-primary">${s.sem}</span>
        <span class="badge badge-teal">${s.uni || 'JNTUK'}</span>
        <span class="badge badge-lavender">${s.reg || 'R23'}</span>
        ${s.isBuiltin ? '<span class="badge badge-green">Built-in</span>' : '<span class="badge badge-amber">Custom</span>'}
      </div>
      <div class="v10-arrow">🔍 Click to open & manage →</div>
    </div>`;
  }).join('');

  content.innerHTML = `
  <div style="padding:2rem;max-width:1200px;margin:0 auto;width:100%;">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:1.2rem;">
      <h2 style="font-size:1.4rem;font-weight:800;letter-spacing:-.02em;">📚 All Subjects (${all.length})</h2>
      ${filterBar}
    </div>
    <p style="font-size:.79rem;color:var(--text3);margin-bottom:1rem;">Click a card to open & manage · Use ⋯ menu to edit or delete</p>
    <div class="v10-subj-grid">${cards || '<div style="color:var(--text3);text-align:center;padding:3rem;grid-column:1/-1;">No subjects match filters.</div>'}</div>
  </div>
  ${getAdminModals()}`;
}

function v10DotMenu(btn, dataObj) {
  document.querySelectorAll('.v10-popup').forEach(p => p.remove());
  if (typeof dataObj === 'string') try { dataObj = JSON.parse(dataObj); } catch (e) { }
  const { id, name, isBuiltin } = dataObj;
  const safeName = (name || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const popup = document.createElement('div');
  popup.className = 'v10-popup';
  if (isBuiltin) {
    popup.innerHTML = `
      <button class="v10-popup-item" onclick="v10AdminViewSubject(${id || 0},true)">🔍 Open & Manage</button>
      <div class="v10-popup-item muted">🔒 Built-in — cannot edit/delete</div>`;
  } else {
    popup.innerHTML = `
      <button class="v10-popup-item" onclick="v10AdminViewSubject(${id},false)">🔍 Open & Manage</button>
      <button class="v10-popup-item" onclick="v10AdminEditSubject(${id})">✏️ Edit Subject</button>
      <button class="v10-popup-item red" onclick="v10AdminDeleteSubject(${id},'${safeName}')">🗑 Delete Subject</button>`;
  }
  btn.closest('.v10-dot-wrap').appendChild(popup);
}

function v10AdminViewSubject(id, isBuiltin) {
  document.querySelectorAll('.v10-popup').forEach(p => p.remove());
  const customSubjects = JSON.parse(localStorage.getItem('edusync_custom_subjects') || '[]');
  let s = customSubjects.find(x => x.id === id);
  if (!s && isBuiltin) {
    const allSems = ['1-1', '1-2', '2-1', '2-2', '3-1', '3-2', '4-1', '4-2'];
    allSems.forEach(sem => {
      (SUBJECTS_DB[sem] || []).forEach(subj => { if (subj.id == id) s = { ...subj, sem, reg: 'R23', uni: 'JNTUK', isBuiltin: true }; });
    });
  }
  if (s) v10AdminOpenSubjectObj(s);
}

function v10AdminEditSubject(id) {
  document.querySelectorAll('.v10-popup').forEach(p => p.remove());
  const subjects = JSON.parse(localStorage.getItem('edusync_custom_subjects') || '[]');
  const s = subjects.find(x => x.id === id);
  if (!s) return;
  const newName = prompt('Subject name:', s.name);
  if (!newName) return;
  const newSem = prompt('Semester (e.g. 3-1):', s.sem);
  const newReg = prompt('Regulation (R23/R20/R16):', s.reg);
  s.name = newName.trim();
  if (newSem) s.sem = newSem.trim();
  if (newReg) s.reg = newReg.trim();
  localStorage.setItem('edusync_custom_subjects', JSON.stringify(subjects));
  showToast('✅ Subject updated!', 'green');
  v10AdminSubjects();
}

function v10AdminDeleteSubject(id, name) {
  document.querySelectorAll('.v10-popup').forEach(p => p.remove());
  if (!confirm(`Delete "${name}" and all its content? This cannot be undone.`)) return;
  const subjects = JSON.parse(localStorage.getItem('edusync_custom_subjects') || '[]');
  localStorage.setItem('edusync_custom_subjects', JSON.stringify(subjects.filter(s => s.id !== id)));
  localStorage.removeItem('edusync_units_' + id);
  showToast('Subject deleted', 'red');
  v10AdminSubjects();
}

function v10AdminOpenSubject(encoded) {
  let s;
  try { s = JSON.parse(decodeURIComponent(encoded)); } catch (e) { return; }
  v10AdminOpenSubjectObj(s);
}

function v10AdminOpenSubjectObj(s) {
  window._v10AdminSubj = s;
  const content = document.getElementById('admin-content');
  if (!content) return;
  const units = JSON.parse(localStorage.getItem('edusync_units_' + s.id) || '[]');
  const uList = units.length ? units : Array.from({ length: 5 }, (_, i) => ({ id: i + 1, name: `Unit ${i + 1}`, topics: [] }));

  const adminNotes = JSON.parse(localStorage.getItem('edusync_admin_notes') || '[]');
  const adminPYQs = JSON.parse(localStorage.getItem('edusync_admin_pyqs') || '[]');
  const adminIQs = JSON.parse(localStorage.getItem('edusync_admin_iqs') || '[]');
  const adminVideos = JSON.parse(localStorage.getItem('edusync_admin_videos') || '[]');

  const unitCards = uList.map((u, ui) => {
    const nC = adminNotes.filter(n => n.subject === s.name && parseInt(n.unit) === u.id).length;
    const pC = adminPYQs.filter(p => p.subject === s.name && parseInt(p.unit) === u.id).length;
    const iC = adminIQs.filter(q => q.subject === s.name && parseInt(q.unit) === u.id).length;
    const vC = adminVideos.filter(v => v.subject === s.name && parseInt(v.unit) === u.id).length;
    const tC = (u.topics || []).length;
    return `
    <div class="v10-unit-card" onclick="v10AdminUnitDetail(${s.id},${u.id})">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:8px;">
        <div class="v10-unit-num">${u.id}</div>
        <div style="display:flex;gap:4px;" onclick="event.stopPropagation()">
          <button class="v10-dot-btn" onclick="v10AdminEditUnit(${s.id},${ui})" title="Edit" style="font-size:.8rem;">✏️</button>
          <button class="v10-dot-btn" onclick="v10AdminDeleteUnit(${s.id},${ui})" title="Delete" style="font-size:.8rem;color:var(--red);">🗑</button>
        </div>
      </div>
      <div class="v10-unit-name">${u.name}</div>
      <div class="v10-unit-meta">${tC} topic${tC !== 1 ? 's' : ''} · ${vC} video${vC !== 1 ? 's' : ''}</div>
      <div class="v10-unit-badges">
        ${nC ? `<span class="badge badge-primary">📄 ${nC}</span>` : ''}
        ${pC ? `<span class="badge badge-amber">📝 ${pC}</span>` : ''}
        ${iC ? `<span class="badge badge-lavender">⭐ ${iC}</span>` : ''}
      </div>
      <div class="v10-unit-arrow">Click to manage content →</div>
    </div>`;
  }).join('');

  content.innerHTML = `
  <div style="padding:2rem;max-width:1200px;margin:0 auto;width:100%;">
    <button class="back-btn" onclick="v10AdminSubjects()">← Back to Subjects</button>
    <div style="margin:1rem 0 .5rem;">
      <h2 style="font-size:1.25rem;font-weight:800;letter-spacing:-.02em;margin-bottom:6px;">${s.icon || '📖'} ${s.name}</h2>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        <span class="badge badge-primary">${s.sem || '—'}</span>
        <span class="badge badge-teal">${s.uni || 'JNTUK'}</span>
        <span class="badge badge-lavender">${s.reg || 'R23'}</span>
        <span class="badge badge-amber">${s.branch || 'CSE'}</span>
      </div>
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.4rem;">
      <p style="font-size:.79rem;color:var(--text3);">Click a unit to open learning roadmap and manage content</p>
      <button class="btn btn-primary btn-sm" onclick="v10AdminAddUnit(${s.id})">+ Add Unit</button>
    </div>
    <div class="v10-unit-grid">${unitCards}</div>
  </div>
  ${getAdminModals()}`;
}

function v10AdminAddUnit(subjId) {
  const name = prompt('Unit name:', 'Unit ' + (JSON.parse(localStorage.getItem('edusync_units_' + subjId) || '[]').length + 1));
  if (!name) return;
  const units = JSON.parse(localStorage.getItem('edusync_units_' + subjId) || '[]');
  const newId = units.length ? Math.max(...units.map(u => u.id)) + 1 : units.length + 1;
  units.push({ id: newId, name: name.trim(), topics: [] });
  localStorage.setItem('edusync_units_' + subjId, JSON.stringify(units));
  showToast('✅ Unit added!', 'green');
  v10AdminOpenSubjectObj(window._v10AdminSubj);
}

function v10AdminEditUnit(subjId, idx) {
  const units = JSON.parse(localStorage.getItem('edusync_units_' + subjId) || '[]');
  if (!units[idx]) return;
  const name = prompt('Unit name:', units[idx].name);
  if (!name) return;
  units[idx].name = name.trim();
  localStorage.setItem('edusync_units_' + subjId, JSON.stringify(units));
  showToast('✅ Unit updated!', 'green');
  v10AdminOpenSubjectObj(window._v10AdminSubj);
}

function v10AdminDeleteUnit(subjId, idx) {
  if (!confirm('Delete this unit?')) return;
  const units = JSON.parse(localStorage.getItem('edusync_units_' + subjId) || '[]');
  units.splice(idx, 1);
  localStorage.setItem('edusync_units_' + subjId, JSON.stringify(units));
  showToast('Unit deleted', 'red');
  v10AdminOpenSubjectObj(window._v10AdminSubj);
}

/* ── Admin unit detail: roadmap + content panels ── */
function v10AdminUnitDetail(subjId, unitId) {
  window._v10AdminSubjId = subjId;
  window._v10AdminUnitId = unitId;
  const s = window._v10AdminSubj;
  const units = JSON.parse(localStorage.getItem('edusync_units_' + subjId) || '[]');
  const defs = units.length ? units : Array.from({ length: 5 }, (_, i) => ({ id: i + 1, name: `Unit ${i + 1}`, topics: [] }));
  const unit = defs.find(u => u.id === unitId) || { id: unitId, name: `Unit ${unitId}`, topics: [] };

  const content = document.getElementById('admin-content');
  if (!content) return;

  content.innerHTML = `
  <div style="padding:2rem;max-width:1200px;margin:0 auto;width:100%;">
    <button class="back-btn" onclick="v10AdminOpenSubjectObj(window._v10AdminSubj)">← Back to Units</button>
    <div style="margin:1rem 0 .3rem;">
        <h2 style="font-size:1.15rem;font-weight:800;margin-bottom:4px;">Unit - ${unit.sort_order || (defs.findIndex(u => String(u.id) === String(unitId)) + 1) || 1}</h2>
      <p style="font-size:.78rem;color:var(--text3);">Build the learning roadmap and attach notes, PYQs, and important questions</p>
    </div>
    <div class="v10-detail-wrap">
      ${v10RoadmapPanel(subjId, unitId, unit.topics || [])}
      ${v10ContentPanel(s ? s.name : '', unitId, 'admin')}
    </div>
  </div>
  ${getAdminModals()}`;
}

/* ═══════════════════════════════════════════════════════════════
   SUB ADMIN: subjects → units → roadmap + content
   ═══════════════════════════════════════════════════════════════ */

/* Override renderSASection for 'subjects' only */
const _v10OrigRenderSASection = renderSASection;
renderSASection = function (section) {
  if (section === 'subjects') { v10SASubjects(); return; }
  _v10OrigRenderSASection(section);
};

/* Override switchSASection so 'subjects' goes to v10 */
const _v10OrigSwitchSASection = switchSASection;
switchSASection = function (section) {
  closeSASidebar();
  document.querySelectorAll('[id^="sa-nav-"]').forEach(el => el.classList.remove('active'));
  const navEl = document.getElementById('sa-nav-' + section);
  if (navEl) navEl.classList.add('active');
  const titles = { dashboard: 'Sub Admin Dashboard', subjects: 'Create Subject', view: 'View Content', curriculum: 'Curriculum', skillup: 'Skill Up' };
  const titleEl = document.getElementById('sa-topbar-title');
  if (titleEl) titleEl.textContent = titles[section] || 'Sub Admin';
  if (section === 'subjects') { v10SASubjects(); return; }
  _v10OrigSwitchSASection(section);
};

/* Override renderAdminSectionFull for 'subjects' */
const _v10OrigAdminSectionFull = window.renderAdminSectionFull;
renderAdminSectionFull = function (section) {
  if (section === 'subjects') { v10AdminSubjects(); return; }
  if (_v10OrigAdminSectionFull) _v10OrigAdminSectionFull(section);
  else if (typeof renderAdminSection === 'function') renderAdminSection(section);
};

/* Override switchAdminSection so 'subjects' goes to v10 */
const _v10OrigSwitchAdmin = switchAdminSection;
switchAdminSection = function (section) {
  closeAdminSidebar();
  document.querySelectorAll('[id^="admin-nav-"]').forEach(el => el.classList.remove('active'));
  const navEl = document.getElementById('admin-nav-' + section);
  if (navEl) navEl.classList.add('active');
  const titles = { dashboard: 'Admin Dashboard', create: 'Create & Manage', subjects: 'All Subjects', approvals: 'URL Approvals', creatorview: 'Creator View', skillup: 'Skill Up' };
  const titleEl = document.getElementById('admin-topbar-title');
  if (titleEl) titleEl.textContent = titles[section] || 'Admin';
  if (section === 'subjects') { v10AdminSubjects(); return; }
  _v10OrigSwitchAdmin(section);
};

async function v10SASubjects(forceRefresh) {
  const content = document.getElementById('sa-content');
  if (!content) return;

  const sa = APP.subAdminData || {};
  const allSems = ['1-1', '1-2', '2-1', '2-2', '3-1', '3-2', '4-1', '4-2'];
  const unis = window.__aiiensRuntimeUniversityNames || [];
  const regs = ['R23', 'R20', 'R19', 'R16'];
  const branches = window.__aiiensRuntimeBranchNames || [];

  const shouldRefresh = (forceRefresh !== false) || !window._v10SaSubjectsCached;

  if (shouldRefresh) {
    // Show loading state immediately
    content.innerHTML = `
    <div style="padding:2rem;max-width:1100px;margin:0 auto;width:100%;text-align:center;">
      <div class="loading-spinner" style="margin: 3rem auto 1rem;"></div>
      <p style="color:var(--text3);">Fetching subjects from Supabase...</p>
    </div>`;

    // Fetch subjects directly from Supabase — no localStorage
    let allSubs = [];
    if (window.aimeasyFetchSubjects) {
      const filters = {};
      if (sa.branch) filters.branch = sa.branch;
      console.log('[SubAdmin] Fetching all subjects from Supabase', filters);
      const { data, error } = await window.aimeasyFetchSubjects(filters);
      if (error) {
        console.error('[SubAdmin] Subject fetch error', error);
        content.innerHTML = `
        <div style="padding:2rem;max-width:1100px;margin:0 auto;width:100%;text-align:center;">
          <p style="color:var(--red);">Failed to load subjects: ${error.message}</p>
          <button class="btn btn-primary btn-sm" style="margin-top:1rem;" onclick="v10SASubjects(true)">Retry</button>
        </div>`;
        return;
      }
      allSubs = data || [];
      window._v10SaSubjectsCached = allSubs;
      console.log('[SubAdmin] All Subjects Returned from Supabase', allSubs.length);
    } else {
      console.warn('[SubAdmin] aimeasyFetchSubjects not yet available');
    }
  }

  const allSubs = window._v10SaSubjectsCached || [];
  const currentUsername = sa.username || 'subadmin';

  // Partition subjects
  const mySubs = allSubs.filter(s => {
    const createdBy = String(s.created_by || '').trim().toLowerCase();
    const curr = String(currentUsername).trim().toLowerCase();
    return createdBy === curr || (!s.created_by && curr === 'subadmin');
  });

  const otherSubs = allSubs.filter(s => {
    const createdBy = String(s.created_by || '').trim().toLowerCase();
    const curr = String(currentUsername).trim().toLowerCase();
    return createdBy !== curr && (s.created_by || curr !== 'subadmin');
  });

  const createForm = `
  <div class="v10-create-form" id="v10-sa-create-form" style="display:none;">
    <h3 style="margin-bottom:1rem;font-size:1rem;">📚 Create New Subject</h3>
    <div class="v10-2col">
      <div class="input-group">
        <label>Branch</label>
        <select class="select" id="v10-sa-branch">
          <option value="">Select Branch</option>
          ${branches.map(b => `<option value="${b}"${sa.branch === b ? ' selected' : ''}>${b}</option>`).join('')}
        </select>
      </div>
      <div class="input-group">
        <label>Year</label>
        <select class="select" id="v10-sa-year">
          <option value="">Select Year</option>
          <option value="1">1</option>
          <option value="2">2</option>
          <option value="3">3</option>
          <option value="4">4</option>
        </select>
      </div>
    </div>
    <div class="v10-2col">
      <div class="input-group">
        <label>Semester</label>
        <select class="select" id="v10-sa-sem">
          <option value="">Select Semester</option>
          ${allSems.map(s => `<option value="${s}">${s}</option>`).join('')}
        </select>
      </div>
      <div class="input-group">
        <label>Regulation</label>
        <select class="select" id="v10-sa-reg">
          <option value="">Select Regulation</option>
          ${regs.map(r => `<option value="${r}">${r}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="v10-2col">
      <div class="input-group">
        <label>University</label>
        <select class="select" id="v10-sa-uni">
          <option value="">Select University</option>
          ${unis.map(u => `<option value="${u}">${u}</option>`).join('')}
        </select>
      </div>
      <div class="input-group">
        <label>Credits</label>
        <select class="select" id="v10-sa-credits">
          <option value="">Select Credits</option>
          <option value="1">1</option>
          <option value="2">2</option>
          <option value="3">3</option>
          <option value="4">4</option>
          <option value="5">5</option>
          <option value="6">6</option>
        </select>
      </div>
    </div>
    <div class="v10-2col">
      <div class="input-group">
        <label>Subject Name</label>
        <input class="input" id="v10-sa-name" placeholder="e.g. Machine Learning">
      </div>
      <div class="input-group">
        <label>Subject Code</label>
        <input class="input" id="v10-sa-code" placeholder="e.g. ML101">
      </div>
    </div>
    <div style="display:flex;gap:10px;margin-top:.5rem;">
      <button class="btn btn-primary" id="v10-sa-create-btn" onclick="v10SACreateSubject()" style="flex:1;">✅ Create Subject</button>
      <button class="btn btn-ghost" onclick="document.getElementById('v10-sa-create-form').style.display='none'">Cancel</button>
    </div>
  </div>`;

  const cards = mySubs.map(s => {
    const safeName = (s.name || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const safeId = s.id;
    return `
    <div class="v10-subj-card" onclick="v10SAOpenUnits('${safeId}')">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:6px;">
        <div class="v10-subj-icon">📖</div>
        <div class="v10-dot-wrap" onclick="event.stopPropagation()">
          <button class="v10-dot-btn" onclick="v10SaDotMenu(this,'${safeId}','${safeName}')">⋯</button>
        </div>
      </div>
      <div class="v10-subj-name">${s.name}</div>
      <div class="v10-subj-meta">${s.code || '—'} · ${s.credits || 3} Cr · ${s.branch || 'CSE'}</div>
      <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:4px;">
        <span class="badge badge-primary">${s.semester || '—'}</span>
        <span class="badge badge-teal">${s.university_name || 'JNTUK'}</span>
        <span class="badge badge-lavender">${s.regulation_code || 'R23'}</span>
        <span class="badge badge-amber">DB ✓</span>
      </div>
      <div class="v10-arrow">📋 Click to manage units →</div>
    </div>`;
  }).join('');

  const otherCards = otherSubs.map(s => {
    const safeId = s.id;
    return `
    <div class="v10-subj-card" onclick="v10SAOpenUnits('${safeId}')" style="border: 1.5px dashed var(--border); background: var(--surface2); cursor: pointer;">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:6px;">
        <div class="v10-subj-icon" style="opacity: 0.7;">📖</div>
        <span class="badge badge-teal" style="font-size:0.68rem; padding: 2px 6px;">Read-Only</span>
      </div>
      <div class="v10-subj-name" style="color: var(--text2);">${s.name}</div>
      <div class="v10-subj-meta">${s.code || '—'} · ${s.credits || 3} Cr · ${s.branch || 'CSE'}</div>
      <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:4px;">
        <span class="badge badge-primary">${s.semester || '—'}</span>
        <span class="badge badge-teal">${s.university_name || 'JNTUK'}</span>
        <span class="badge badge-lavender">${s.regulation_code || 'R23'}</span>
        <span class="badge" style="background:var(--surface3); color:var(--text3);">By: ${s.created_by || 'subadmin'}</span>
      </div>
      <div class="v10-arrow" style="color:var(--text3);">📋 View Units (Read-only) →</div>
    </div>`;
  }).join('');

  const otherSubsSection = otherSubs.length ? `
    <div style="margin-top: 2.5rem; border-top: 1px dashed var(--border); padding-top: 1.8rem;">
      <h2 style="font-size:1.3rem;font-weight:800;letter-spacing:-.02em;margin-bottom:1.2rem;color:var(--text2);">👥 Shared Subjects (${otherSubs.length})</h2>
      <div class="v10-subj-grid">${otherCards}</div>
    </div>` : '';

  content.innerHTML = `
  <div style="padding:2rem;max-width:1100px;margin:0 auto;width:100%;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.2rem;flex-wrap:wrap;gap:10px;">
      <h2 style="font-size:1.4rem;font-weight:800;letter-spacing:-.02em;">📚 My Subjects (${mySubs.length})</h2>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-ghost btn-sm" onclick="v10SASubjects()">🔄 Refresh</button>
        <button class="btn btn-primary" onclick="document.getElementById('v10-sa-create-form').style.display='block';document.getElementById('v10-sa-create-form').scrollIntoView({behavior:'smooth'})">+ Add Subject</button>
      </div>
    </div>
    ${createForm}
    ${mySubs.length
      ? `<div class="v10-subj-grid">${cards}</div>`
      : `<div style="text-align:center;padding:4rem;color:var(--text3);">
          <div style="font-size:3rem;margin-bottom:1rem;">📚</div>
          <div style="font-weight:600;font-size:1rem;margin-bottom:6px;">No subjects yet</div>
          <div style="font-size:.82rem;">Click "+ Add Subject" to create your first subject</div>
        </div>`}
    ${otherSubsSection}
  </div>`;
}

async function v10SAEditSubjectLegacy(id) {
  document.querySelectorAll('.v10-popup').forEach(p => p.remove());
  if (!window.aimeasyFetchSubjects) { showToast('Supabase not ready', 'red'); return; }

  // Fetch the existing subject from Supabase by ID, filtered by subadmin
  const filters = { created_by: APP.subAdminData?.username || 'subadmin' };
  const { data: allSubjects, error: fetchErr } = await window.aimeasyFetchSubjects(filters);
  if (fetchErr) { showToast('Could not load subject: ' + fetchErr.message, 'red'); return; }
  const s = (allSubjects || []).find(x => String(x.id) === String(id));
  if (!s) { showToast('Subject not found in database', 'red'); return; }

  const newName = prompt('Subject name:', s.name);
  if (!newName) return;
  const newSem = prompt('Semester (e.g. 3-1):', s.semester);
  const newReg = prompt('Regulation (e.g. R23):', s.regulation_code);

  showToast('Saving changes...', 'blue');
  const { error: updateErr } = await window.aimeasyUpdateSubject(id, {
    name: newName.trim(),
    university_name: s.university_name,
    regulation_code: newReg ? newReg.trim() : s.regulation_code,
    branch: s.branch,
    semester: newSem ? newSem.trim() : s.semester,
    code: s.code,
    credits: s.credits,
    created_by: s.created_by || APP.subAdminData?.username || 'subadmin'
  });
  if (updateErr) { showToast('Update failed: ' + updateErr.message, 'red'); return; }
  showToast('✅ Subject updated in database!', 'green');
  window._v10SaSubjectsCached = null;
  v10SASubjects(true);
}

async function v10SADeleteSubjectLegacy(id, name) {
  document.querySelectorAll('.v10-popup').forEach(p => p.remove());
  if (!confirm(`Delete "${name}" from the database?\n\nThis will permanently remove all content for this subject.`)) return;
  if (!window.aimeasyDeleteSubject) { showToast('Supabase not ready', 'red'); return; }

  showToast('Deleting from database...', 'blue');
  const createdBy = APP.subAdminData?.username || 'subadmin';
  const { error } = await window.aimeasyDeleteSubject(id, createdBy);
  if (error) { showToast('Delete failed: ' + error.message, 'red'); return; }
  showToast('Subject deleted from database', 'red');
  window._v10SaSubjectsCached = null;
  v10SASubjects(true);
}

/* Subject edit/delete dialogs intentionally update the existing in-memory list after
   Supabase confirms the mutation. No page reload or second database fetch is needed. */
function v10SAFormEscape(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function v10SASelectOptions(values, selected) {
  return [...new Set([selected, ...values].filter(Boolean))].map(value => {
    const safe = v10SAFormEscape(value);
    return `<option value="${safe}"${String(value) === String(selected) ? ' selected' : ''}>${safe}</option>`;
  }).join('');
}

function v10SaDotMenu(btn, id) {
  document.querySelectorAll('.v10-popup').forEach(p => p.remove());
  const popup = document.createElement('div');
  popup.className = 'v10-popup';
  popup.innerHTML = `
    <button class="v10-popup-item" onclick="v10SAEditSubject('${id}')">✏️ Edit Subject</button>
    <button class="v10-popup-item red" onclick="v10SADeleteSubject('${id}')">🗑 Delete Subject</button>`;
  btn.closest('.v10-dot-wrap').appendChild(popup);
}

async function v10SAEditSubject(id) {
  document.querySelectorAll('.v10-popup').forEach(p => p.remove());
  if (!window.aimeasyFetchSubjectById) { showToast('Supabase not ready', 'red'); return; }
  const { data: s, error } = await window.aimeasyFetchSubjectById(id);
  if (error) { showToast(error.message, 'red'); return; }
  if (!s) { showToast('Subject not found in database', 'red'); return; }

  document.getElementById('v10-sa-edit-modal')?.remove();
  const modal = document.createElement('div');
  modal.className = 'modal-overlay open';
  modal.id = 'v10-sa-edit-modal';
  modal.onclick = event => { if (event.target === modal) modal.remove(); };
  modal.innerHTML = `
    <div class="modal" style="max-width:720px;max-height:90vh;overflow:auto;">
      <h2 style="font-size:1.2rem;font-weight:800;margin-bottom:1.2rem;">Edit Subject</h2>
      <div class="v10-2col">
        <div class="input-group"><label>Subject Name</label><input class="input" id="v10-edit-name" value="${v10SAFormEscape(s.name)}"></div>
        <div class="input-group"><label>Subject Code</label><input class="input" id="v10-edit-code" value="${v10SAFormEscape(s.code)}"></div>
      </div>
      <div class="v10-2col">
        <div class="input-group"><label>University</label><select class="select" id="v10-edit-uni">${v10SASelectOptions(window.__aiiensRuntimeUniversityNames || [], s.university_name)}</select></div>
        <div class="input-group"><label>Branch</label><select class="select" id="v10-edit-branch">${v10SASelectOptions(window.__aiiensRuntimeBranchNames || [], s.branch)}</select></div>
      </div>
      <div class="v10-2col">
        <div class="input-group"><label>Regulation</label><select class="select" id="v10-edit-reg">${v10SASelectOptions(['R23','R20','R19','R16'], s.regulation_code)}</select></div>
        <div class="input-group"><label>Year</label><select class="select" id="v10-edit-year">${v10SASelectOptions(['1','2','3','4'], String(s.year || String(s.semester || '')[0] || ''))}</select></div>
      </div>
      <div class="v10-2col">
        <div class="input-group"><label>Semester</label><select class="select" id="v10-edit-sem">${v10SASelectOptions(['1-1','1-2','2-1','2-2','3-1','3-2','4-1','4-2'], s.semester)}</select></div>
        <div class="input-group"><label>Credits</label><select class="select" id="v10-edit-credits">${v10SASelectOptions(['1','2','3','4','5','6'], String(s.credits || '3'))}</select></div>
      </div>
      <div class="input-group"><label>Status</label><select class="select" id="v10-edit-status">${v10SASelectOptions(['active','inactive'], s.status || 'active')}</select></div>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:1rem;">
        <button class="btn btn-ghost" onclick="document.getElementById('v10-sa-edit-modal')?.remove()">Cancel</button>
        <button class="btn btn-primary" id="v10-edit-save" onclick="v10SASaveSubject('${id}')">Save Changes</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

async function v10SASaveSubject(id) {
  if (!window.aimeasyUpdateSubject) { showToast('Supabase not ready', 'red'); return; }
  const { data: existing, error: fetchError } = await window.aimeasyFetchSubjectById(id);
  if (fetchError) { showToast(fetchError.message, 'red'); return; }
  if (!existing) { showToast('Subject not found in database', 'red'); return; }
  const value = field => document.getElementById(`v10-edit-${field}`)?.value?.trim();
  const payload = {
    name: value('name'), code: value('code'), university_name: value('uni'), branch: value('branch'),
    regulation_code: value('reg'), year: value('year'), semester: value('sem'),
    credits: Number(value('credits')), status: value('status'), created_by: existing.created_by
  };
  if (!payload.name || !payload.code || !payload.university_name || !payload.branch || !payload.regulation_code || !payload.year || !payload.semester) {
    showToast('Please fill all required fields', 'red'); return;
  }
  const button = document.getElementById('v10-edit-save');
  if (button) button.disabled = true;
  const currentSubjects = window._v10SaSubjectsCached || [];
  const { data, error } = await window.aimeasyUpdateSubject(id, payload);
  if (error) { if (button) button.disabled = false; showToast(error.message, 'red'); return; }
  window._v10SaSubjectsCached = currentSubjects.map(subject => String(subject.id) === String(id) ? { ...subject, ...(data || payload) } : subject);
  document.getElementById('v10-sa-edit-modal')?.remove();
  await v10SASubjects(false);
  showToast('Subject updated successfully.', 'green');
}

async function v10SADeleteSubject(id) {
  document.querySelectorAll('.v10-popup').forEach(p => p.remove());
  document.getElementById('v10-sa-delete-modal')?.remove();
  const modal = document.createElement('div');
  modal.className = 'modal-overlay open';
  modal.id = 'v10-sa-delete-modal';
  modal.onclick = event => { if (event.target === modal) modal.remove(); };
  modal.innerHTML = `<div class="modal" style="max-width:460px;">
    <h2 style="font-size:1.2rem;font-weight:800;margin-bottom:.7rem;">Delete Subject?</h2>
    <p style="color:var(--text2);margin-bottom:1.3rem;">This action will permanently delete the subject and all its related data.</p>
    <div style="display:flex;justify-content:flex-end;gap:10px;">
      <button class="btn btn-ghost" onclick="document.getElementById('v10-sa-delete-modal')?.remove()">Cancel</button>
      <button class="btn btn-danger" id="v10-delete-confirm" onclick="v10SAConfirmDelete('${id}')">Delete</button>
    </div></div>`;
  document.body.appendChild(modal);
}

async function v10SAConfirmDelete(id) {
  if (!window.aimeasyDeleteSubject) { showToast('Supabase not ready', 'red'); return; }
  const { data: existing, error: fetchError } = await window.aimeasyFetchSubjectById(id);
  if (fetchError) { showToast(fetchError.message, 'red'); return; }
  if (!existing) { showToast('Subject not found in database', 'red'); return; }
  const button = document.getElementById('v10-delete-confirm');
  if (button) button.disabled = true;
  const currentSubjects = window._v10SaSubjectsCached || [];
  const { error } = await window.aimeasyDeleteSubject(id);
  if (error) { if (button) button.disabled = false; showToast(error.message, 'red'); return; }
  window._v10SaSubjectsCached = currentSubjects.filter(subject => String(subject.id) !== String(id));
  document.getElementById('v10-sa-delete-modal')?.remove();
  await v10SASubjects(false);
  showToast('Subject deleted successfully.', 'green');
}

async function v10SACreateSubject() {
  const branch = document.getElementById('v10-sa-branch')?.value;
  const sem = document.getElementById('v10-sa-sem')?.value;
  const year = document.getElementById('v10-sa-year')?.value;
  const reg = document.getElementById('v10-sa-reg')?.value;
  const uni = document.getElementById('v10-sa-uni')?.value;
  const credits = document.getElementById('v10-sa-credits')?.value;
  const name = document.getElementById('v10-sa-name')?.value?.trim();
  const code = document.getElementById('v10-sa-code')?.value?.trim();

  if (!name || !branch || !sem || !reg || !uni || !year || !credits) {
    showToast('Please fill all required fields', 'red');
    return;
  }

  if (!window.aimeasyCreateSubject) {
    showToast('Supabase not ready. Please wait and try again.', 'red');
    return;
  }

  // Subject code generation logic
  function generateSubjectCode(subjectName) {
    const skipWords = ['and', 'or', 'of', 'in', 'to', 'for', 'the', 'a', 'an', 'with', 'by', 'on', 'at'];
    const words = subjectName.trim().split(/\s+/).filter(w => w && !skipWords.includes(w.toLowerCase()));
    if (words.length === 0) {
      const fallbackWords = subjectName.trim().split(/\s+/).filter(Boolean);
      if (fallbackWords.length === 0) return 'SUB101';
      words.push(...fallbackWords);
    }
    let initials = '';
    if (words.length === 1) {
      const word = words[0].toUpperCase();
      initials = word.slice(0, Math.min(3, word.length));
    } else {
      initials = words.map(w => w.charAt(0).toUpperCase()).join('');
    }
    return initials + '101';
  }

  const finalCode = (code || generateSubjectCode(name)).toUpperCase();

  // Disable the create button to prevent double-submit and indicate activity
  const btn = document.getElementById('v10-sa-create-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Checking uniqueness...'; }

  showToast('Checking subject code uniqueness...', 'blue');
  const { data: codeCheckData, error: codeCheckErr } = await window.aimeasyFetchSubjects({ code: finalCode });
  if (codeCheckErr) {
    showToast('Failed to validate subject code: ' + codeCheckErr.message, 'red');
    if (btn) { btn.disabled = false; btn.textContent = '✅ Create Subject'; }
    return;
  }
  if (codeCheckData && codeCheckData.length > 0) {
    showToast(`❌ Subject code "${finalCode}" is already in use.`, 'red');
    if (btn) { btn.disabled = false; btn.textContent = '✅ Create Subject'; }
    return;
  }

  const currentLoggedInSubAdminName = APP.subAdminData?.username || APP.subAdminData?.name || APP.user?.username || APP.user?.name || '';
  const currentLoggedInUserEmail = APP.subAdminData?.email || APP.user?.email || '';
  const created_by = currentLoggedInSubAdminName || currentLoggedInUserEmail || 'subadmin';
  const status = 'active';

  const dbPayload = {
    name,
    code: finalCode,
    university_name: uni,
    regulation_code: reg,
    branch,
    semester: sem,
    year,
    credits: Number(credits) || 3,
    created_by,
    status
  };

  console.log('[SubAdmin] Subject Payload', dbPayload);

  if (btn) { btn.textContent = 'Creating...'; }
  showToast('Saving to Supabase...', 'blue');

  const { data, error } = await window.aimeasyCreateSubject(dbPayload);

  console.log('[SubAdmin] Insert Result', data);
  console.log('[SubAdmin] Insert Error', error);

  if (error) {
    showToast(error.message, 'red');
    if (btn) { btn.disabled = false; btn.textContent = '✅ Create Subject'; }
    return;
  }

  if (!data || !data.id) {
    showToast('❌ Insert appeared to succeed but no row was returned. Check Supabase RLS policies.', 'red');
    if (btn) { btn.disabled = false; btn.textContent = '✅ Create Subject'; }
    return;
  }

  // Only show success AFTER confirmed Supabase insert
  console.log('[SubAdmin] Subject created in Supabase', { id: data.id, name: data.name });
  showToast('✅ Subject created and live for students!', 'green');

  // Immediately update local cache to include the new subject for instant UI update
  if (!window._v10SaSubjectsCached) {
    window._v10SaSubjectsCached = [];
  }
  window._v10SaSubjectsCached.push(data);

  // Refresh UI from cache instantly without fetching again from database
  await v10SASubjects(false);
}

/* ── SA: open subject → show unit cards ── */
async function v10SAOpenUnits(subjId) {
  document.querySelectorAll('.v10-popup').forEach(p => p.remove());

  // Fetch subject from Supabase by ID — no localStorage
  if (!window.aimeasyFetchSubjects) {
    showToast('Supabase not ready', 'red');
    return;
  }

  const sa = APP.subAdminData || {};
  const currentUsername = sa.username || 'subadmin';
  const filters = {};
  if (sa.branch) filters.branch = sa.branch;

  const { data: allSubjects, error } = await window.aimeasyFetchSubjects(filters);
  if (error) { showToast('Could not load subject: ' + error.message, 'red'); return; }
  const subj = (allSubjects || []).find(s => String(s.id) === String(subjId));
  if (!subj) { showToast('Subject not found in database', 'red'); return; }

  // Check if subject is read-only for current subadmin
  const createdBy = String(subj.created_by || '').trim().toLowerCase();
  const curr = String(currentUsername).trim().toLowerCase();
  const isMine = createdBy === curr || (!subj.created_by && curr === 'subadmin');
  const isReadOnly = !isMine;

  // Normalize to the shape v10SAUnitsPage expects
  const normalizedSubj = {
    id: subj.id,
    name: subj.name,
    code: subj.code || '',
    sem: subj.semester || '',
    semester: subj.semester || '',
    uni: subj.university_name || 'JNTUK',
    university_name: subj.university_name || 'JNTUK',
    reg: subj.regulation_code || 'R23',
    regulation_code: subj.regulation_code || 'R23',
    branch: subj.branch || 'CSE',
    credits: subj.credits || 3,
    created_by: subj.created_by || '',
    isReadOnly: isReadOnly
  };

  window._v10SASubj = normalizedSubj;
  await v10SAUnitsPage(normalizedSubj);
}

async function v10SAUnitsPage(subj) {
  const content = document.getElementById('sa-content');
  if (!content) return;

  content.innerHTML = `
  <div style="padding:2rem;max-width:1100px;margin:0 auto;width:100%;text-align:center;">
    <div class="loading-spinner" style="margin: 3rem auto 1rem;"></div>
    <p style="color:var(--text3);">Loading units from Supabase...</p>
  </div>`;

  let uList = [];
  let contentCounts = {}; // unitId -> { notes, videos, topics }

  if (window.aimeasyFetchUnits) {
    const { data: dbUnits, error: unitErr } = await window.aimeasyFetchUnits(subj.id);
    console.log('SUBJECT ID:', subj.id);
    console.log('DB UNITS:', dbUnits);
    if (unitErr) {
      showToast('Failed to load units: ' + unitErr.message, 'red');
    } else if (dbUnits && dbUnits.length) {
      uList = dbUnits.map(u => ({
        id: u.id,
        sort_order: u.sort_order,
        name: u.title || `Unit ${u.sort_order}`,
        topics: []
      }));
    }
    console.log('ULIST:', uList);
    console.log('ULIST LENGTH:', uList.length);
  }

  // If no units in DB yet, show empty state (don't generate phantom units)
  const unitCards = uList.map((u) => {
    const unitActions = subj.isReadOnly ? '' : `
        <div style="display:flex;gap:4px;" onclick="event.stopPropagation()">
          <button class="v10-dot-btn" onclick="v10SAEditUnit('${subj.id}','${u.id}')" title="Edit" style="font-size:.8rem;">✏️</button>
          <button class="v10-dot-btn" onclick="v10SADeleteUnit('${subj.id}','${u.id}')" title="Delete" style="font-size:.8rem;color:var(--red);">🗑</button>
        </div>`;
    return `
    <div
  class="v10-unit-card"
  data-subject-id="${subj.id}"
  data-unit-id="${u.id}">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:8px;">
        <div class="v10-unit-num">${u.sort_order || u.id}</div>
        ${unitActions}
      </div>
      <div class="v10-unit-name">${u.name}</div>
      <div class="v10-unit-meta">Click to add roadmap &amp; content</div>
      <div class="v10-unit-badges"><span class="badge badge-amber">DB ✓</span></div>
      <div class="v10-unit-arrow">Click to add roadmap &amp; content →</div>
    </div>`;
  }).join('');
  console.log('UNIT CARDS:', unitCards);
  console.log('UNIT CARDS LENGTH:', unitCards.length);

  content.innerHTML = `
  <div style="padding:2rem;max-width:1100px;margin:0 auto;width:100%;">
    <button class="back-btn" onclick="v10SASubjects()">← Back to Subjects</button>
    <div style="margin:1rem 0 .5rem;">
      <h2 style="font-size:1.25rem;font-weight:800;letter-spacing:-.02em;margin-bottom:6px;">📖 ${subj.name}</h2>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        <span class="badge badge-primary">${subj.sem || subj.semester || '—'}</span>
        <span class="badge badge-teal">${subj.uni || subj.university_name || 'JNTUK'}</span>
        <span class="badge badge-lavender">${subj.reg || subj.regulation_code || 'R23'}</span>
        <span class="badge badge-amber">${subj.branch || 'CSE'}</span>
      </div>
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.4rem;">
      <p style="font-size:.79rem;color:var(--text3);">${subj.isReadOnly ? 'View learning roadmap and content for this subject' : 'Click a unit card to open its learning roadmap and upload content'}</p>
      ${subj.isReadOnly ? '' : `<button class="btn btn-primary btn-sm" onclick="v10SAAddUnit('${subj.id}')">+ Add Unit</button>`}
    </div>
    ${uList.length
      ? `<div class="v10-unit-grid">${unitCards}</div>`
      : `<div style="text-align:center;padding:3rem;color:var(--text3);">
          <div style="font-size:3rem;margin-bottom:1rem;">📚</div>
          <div style="font-weight:600;">No units yet</div>
          <div style="font-size:.82rem;">Click "+ Add Unit" to create units for this subject</div>
        </div>`}
  </div>`;
  // Attach click handlers to unit cards
  document.querySelectorAll('.v10-unit-card').forEach(card => {
    card.addEventListener('click', () => {
      const subjectId = card.dataset.subjectId;
      const unitId = card.dataset.unitId;

      console.log('UNIT CLICKED');
      console.log('SUBJECT', subjectId);
      console.log('UNIT', unitId);

      v10SAUnitDetail(subjectId, unitId);
    });
  });
}
async function v10SAAddUnit(subjId) {
  if (window._v10SASubj?.isReadOnly) { showToast('Permission denied: Subject is read-only', 'red'); return; }
  if (!window.aimeasyFetchUnits || !window.aimeasyCreateUnit) {
    showToast('Supabase not ready', 'red');
    return;
  }
  const { data: existingUnits } = await window.aimeasyFetchUnits(subjId);
  const currentCount = (existingUnits || []).length;
  const newSortOrder = currentCount + 1;
  const name = prompt('Unit name:', `Unit ${newSortOrder}`);
  if (!name) return;

  showToast('Creating unit in Supabase...', 'blue');
  const { data, error } = await window.aimeasyCreateUnit(subjId, {
    name: name.trim(),
    title: name.trim(),
    sort_order: newSortOrder
  });
  if (error) { showToast('Failed to create unit: ' + error.message, 'red'); return; }
  showToast('✅ Unit added to database!', 'green');
  await v10SAUnitsPage(window._v10SASubj);
}

async function v10SAEditUnit(subjId, unitId) {
  if (window._v10SASubj?.isReadOnly) { showToast('Permission denied: Subject is read-only', 'red'); return; }
  if (!window.aimeasyUpdateUnit) { showToast('Supabase not ready', 'red'); return; }
  const { data: units } = await window.aimeasyFetchUnits(subjId);
  const unit = (units || []).find(u => String(u.id) === String(unitId));
  if (!unit) { showToast('Unit not found', 'red'); return; }

  const name = prompt('Unit name:', unit.title || unit.name);
  if (!name) return;

  showToast('Saving...', 'blue');
  const { error } = await window.aimeasyUpdateUnit(unitId, { name: name.trim(), title: name.trim() });
  if (error) { showToast('Update failed: ' + error.message, 'red'); return; }
  showToast('✅ Unit updated!', 'green');
  await v10SAUnitsPage(window._v10SASubj);
}

async function v10SADeleteUnit(subjId, unitId) {
  if (window._v10SASubj?.isReadOnly) { showToast('Permission denied: Subject is read-only', 'red'); return; }
  if (!confirm('Delete this unit and all its content from the database?')) return;
  if (!window.aimeasyDeleteUnit) { showToast('Supabase not ready', 'red'); return; }

  showToast('Deleting from Supabase...', 'blue');
  const { error } = await window.aimeasyDeleteUnit(unitId);
  if (error) { showToast('Delete failed: ' + error.message, 'red'); return; }
  showToast('Unit deleted from database', 'red');
  await v10SAUnitsPage(window._v10SASubj);
}
function v10UnitMenu(btn, subjId, unitId) {
  if (window._v10SASubj?.isReadOnly) {
    showToast('Permission denied: Subject is read-only', 'red');
    return;
  }

  document
    .querySelectorAll('.v10-popup')
    .forEach(p => p.remove());

  const popup = document.createElement('div');

  popup.className = 'v10-popup';

  popup.innerHTML = `
    <button class="v10-popup-item"
      onclick="v10SAEditUnit('${subjId}','${unitId}')">
      ✏️ Edit
    </button>

    <button class="v10-popup-item red"
      onclick="v10SADeleteUnit('${subjId}','${unitId}')">
      🗑 Delete
    </button>
  `;

  btn.parentElement.appendChild(popup);
}

/* ── SA: Unit detail — Roadmap (left) + Content tabs (right) ── */
async function v10SAUnitDetail(subjId, unitId) {
  window._v10SASubjId = subjId;
  window._v10SAUnitId = unitId;
  const subj = window._v10SASubj;

  // Fetch unit from Supabase — no localStorage
  let unit = { id: unitId, dbUnitId: unitId, name: `Unit`, topics: [], sort_order: 1 };
  if (window.aimeasyFetchUnits && subjId) {
    const { data: dbUnits } = await window.aimeasyFetchUnits(subjId);
    const found = (dbUnits || []).find(u => String(u.id) === String(unitId));
    if (found) {
      unit = {
        id: found.id,
        dbUnitId: found.id,
        sort_order: found.sort_order,
        name: found.title || `Unit ${found.sort_order}`,
        topics: []
      };
    }
  }

  // Load roadmap topics from DB
  if (subj) {
    const dbUnit = await v10ReloadUnitRoadmapFromDb(subjId, unitId, subj, unit);
    if (dbUnit) unit = { ...unit, ...dbUnit };
  }
  await v10ReloadUnitContentFromDb(subj?.name || '', unitId);

  const content = document.getElementById('sa-content');
  if (!content) return;

  content.innerHTML = `
  <div style="padding:2rem;max-width:1200px;margin:0 auto;width:100%;">
    <button class="back-btn" onclick="v10SAUnitsPage(window._v10SASubj)">← Back to Units</button>
    <div style="margin:1rem 0 .3rem;">
      <h2 style="font-size:1.15rem;font-weight:800;margin-bottom:4px;">Unit - ${unit.sort_order || 1}</h2>
      <p style="font-size:.78rem;color:var(--text3);">Build the learning roadmap on the left · Add notes, PYQs and important questions on the right</p>
    </div>
    <div class="v10-detail-wrap">
      ${v10RoadmapPanel(subjId, unitId, unit.topics || [])}
      ${v10ContentPanel(subj ? subj.name : '', unitId, 'sa')}
    </div>
  </div>`;
}

/* ═══════════════════════════════════════════════════════════════
   SHARED: Roadmap panel + Content panel builders
   ═══════════════════════════════════════════════════════════════ */

function v10RoadmapPanel(subjId, unitId, topics) {
  const rows = topics.length ? topics.map((t, i) => v10TopicRowHTML(
    subjId,
    unitId,
    i,
    t.name || t.topicName || '',
    Array.isArray(t.youtubeUrls) ? t.youtubeUrls : (t.youtubeUrl || t.url ? [t.youtubeUrl || t.url] : ['']),
    topics.length,
    t.id || ''
  )).join('')
    : `<div id="v10-rm-empty-${unitId}" style="text-align:center;padding:1.8rem;color:var(--text3);">
        <div style="font-size:2.2rem;margin-bottom:8px;">📍</div>
        <div style="font-weight:600;font-size:.88rem;">No topics yet</div>
        <div style="font-size:.76rem;margin-top:4px;">Click "+ Add Topic" to build the roadmap</div>
       </div>`;

  return `
  <div class="v10-panel">
    <div class="v10-panel-head">
      <h4>📍 Learning Roadmap</h4>
      <button class="btn btn-primary btn-sm" onclick="v10AddTopic('${subjId}','${unitId}')">+ Add Topic</button>
    </div>
    <div class="v10-panel-body">
      <div id="v10-topics-${unitId}">${rows}</div>
      <button class="btn btn-ghost" style="width:100%;margin-top:.6rem;" onclick="v10AddTopic('${subjId}','${unitId}')">+ Add Topic to Roadmap</button>
      <button class="v10-submit" onclick="v10SaveRoadmap('${subjId}','${unitId}')">💾 Save Learning Roadmap</button>
    </div>
  </div>`;
}

function v10TopicRowHTML(subjId, unitId, idx, name, urls, total, topicId = '') {
  const isFilled = name.trim() !== '';
  const urlList = Array.isArray(urls) ? urls : [urls || ''];
  const urlRows = (urlList.length ? urlList : ['']).map((url, ui) => `
      <div class="v10-url-row" style="display:flex;align-items:center;gap:8px;margin-top:6px;">
        <input class="v10-url-input" placeholder="${ui === 0 ? 'Video URL (YouTube / Google Drive / etc.)' : 'Additional video URL'}"
          value="${(url || '').replace(/"/g, '&quot;')}"
          style="font-size:.78rem;flex:1;" />
        ${ui === 0
      ? `<button type="button" class="btn btn-ghost btn-sm" onclick="v10AddTopicUrl('${subjId}','${unitId}','${idx}')" title="Add another URL">+</button>`
      : `<button type="button" class="btn btn-ghost btn-sm" onclick="v10RemoveTopicUrl(this)" title="Remove URL">✕</button>`
    }
      </div>`).join('');
  return `
  <div class="v10-topic-row" id="v10-tr-${unitId}-${idx}" data-topic-id="${topicId}">
    <div class="v10-dot ${isFilled ? 'filled' : ''}" id="v10-dot-${unitId}-${idx}">${idx + 1}</div>
    <div class="v10-topic-fields">
      <input class="${isFilled ? 'filled' : ''}" placeholder="Topic name (e.g. Introduction to Trees)"
        value="${name.replace(/"/g, '&quot;')}"
        oninput="v10DotUpdate('${unitId}',${idx},this.value)" />
      <div class="v10-url-list">${urlRows}</div>
    </div>
    <button class="v10-rm-btn" onclick="v10RemoveTopic('${unitId}',${idx})" title="Remove">✕</button>
  </div>`;
}

function v10DotUpdate(unitId, idx, val) {
  const dot = document.getElementById('v10-dot-' + unitId + '-' + idx);
  if (dot) { dot.className = 'v10-dot ' + (val.trim() ? 'filled' : ''); }
  const inp = document.querySelector(`#v10-tr-${unitId}-${idx} .v10-topic-fields input:first-child`);
  if (inp) inp.className = val.trim() ? 'filled' : '';
}

function v10RemoveTopic(unitId, idx) {
  const row = document.getElementById('v10-tr-' + unitId + '-' + idx);
  if (row) { row.remove(); v10RenumberDots(unitId); }
}

function v10RenumberDots(unitId) {
  const container = document.getElementById('v10-topics-' + unitId);
  if (!container) return;
  container.querySelectorAll('.v10-topic-row').forEach((row, i) => {
    const dot = row.querySelector('.v10-dot');
    if (dot) dot.textContent = i + 1;
    row.id = 'v10-tr-' + unitId + '-' + i;
    if (dot) dot.id = 'v10-dot-' + unitId + '-' + i;
  });
}

function v10AddTopic(subjId, unitId, isSubTopic = false) {
  const container = document.getElementById('v10-topics-' + unitId);
  if (!container) return;
  // Remove empty state
  const empty = document.getElementById('v10-rm-empty-' + unitId);
  if (empty) empty.remove();
  const rows = container.querySelectorAll('.v10-topic-row');
  const idx = rows.length;
  const div = document.createElement('div');
  div.innerHTML = v10TopicRowHTML(subjId, unitId, idx, '', [''], idx + 1, '', isSubTopic);
  container.appendChild(div.firstElementChild);
  container.lastElementChild.querySelector('input')?.focus();
}

function v10AddTopicUrl(subjId, unitId, topicIdx) {
  const row = document.getElementById('v10-tr-' + unitId + '-' + topicIdx);
  if (!row) return;
  const urlList = row.querySelector('.v10-url-list');
  if (!urlList) return;
  const div = document.createElement('div');
  div.className = 'v10-url-row';
  div.style.cssText = 'display:flex;align-items:center;gap:8px;margin-top:6px;';
  div.innerHTML = `<input class="v10-url-input" placeholder="Additional video URL" style="font-size:.78rem;flex:1;" />
    <button type="button" class="btn btn-ghost btn-sm" onclick="v10RemoveTopicUrl(this)" title="Remove URL">✕</button>`;
  urlList.appendChild(div);
}

function v10RemoveTopicUrl(button) {
  const row = button.closest('.v10-url-row');
  if (row) row.remove();
}

function v10SaveRoadmap(subjId, unitId) {
  const container = document.getElementById('v10-topics-' + unitId);
  if (!container) return;
  const topics = [];
  container.querySelectorAll('.v10-topic-row').forEach(row => {
    const name = row.querySelector('.v10-topic-fields input:first-child')?.value.trim();
    const urls = Array.from(row.querySelectorAll('.v10-url-input'))
      .map(input => input.value.trim())
      .filter(Boolean);
    const primaryUrl = urls[0] || '';
    if (name) {
      const topicId = row.dataset.topicId || Date.now() + Math.random();
      const topic = {
        id: topicId,
        topicName: name,
        youtubeUrl: primaryUrl,
        youtubeUrls: urls,
        name,
        url: primaryUrl,
        urls: urls,
        notes: [],
        pyqs: [],
        importantQuestions: []
      };
      console.log('Saving Topic:', topic);
      topics.push(topic);
    }
  });

  /* Save to edusync_units */
  let units = JSON.parse(localStorage.getItem('edusync_units_' + subjId) || '[]');
  if (!units.length) units = Array.from({ length: 5 }, (_, i) => ({ id: i + 1, name: `Unit ${i + 1}`, topics: [] }));
  const ui = units.findIndex(u => u.id === unitId);
  if (ui >= 0) units[ui].topics = topics;
  else units.push({ id: unitId, name: `Unit ${unitId}`, topics });
  localStorage.setItem('edusync_units_' + subjId, JSON.stringify(units));

  /* Also sync edusync_roadmaps for student view */
  const roadmaps = JSON.parse(localStorage.getItem('edusync_roadmaps') || '{}');
  if (!roadmaps[subjId]) roadmaps[subjId] = [];
  let rm = roadmaps[subjId].find(r => r.unit === unitId);
  if (rm) rm.topics = topics.map(t => t.name);
  else roadmaps[subjId].push({ unit: unitId, topics: topics.map(t => t.name) });

  /* Topics are stored as unified topic objects in edusync_units_*; do not save separate admin video records. */

  localStorage.setItem('edusync_roadmaps', JSON.stringify(roadmaps));
  showToast('✅ Learning Roadmap saved! Students will see this.', 'green');
}

/* ── Content panel (Notes / PYQs / IQs) ── */
function v10ContentPanel(subjectName, unitId, role) {
  return `
  <div class="v10-panel">
    <div class="v10-panel-head">
      <h4>📚 Unit Content</h4>
    </div>
    <div class="v10-tabs">
      <button class="v10-tab on" onclick="v10SwitchTab(this,'v10-notes-${unitId}')">📄 Upload Notes</button>
      <button class="v10-tab"    onclick="v10SwitchTab(this,'v10-pyq-${unitId}')">📝 Previous Questions</button>
      <button class="v10-tab"    onclick="v10SwitchTab(this,'v10-iq-${unitId}')">⭐ Important Qs</button>
    </div>
    <div class="v10-pane on" id="v10-notes-${unitId}">${v10NotesForm(subjectName, unitId)}</div>
    <div class="v10-pane"    id="v10-pyq-${unitId}">${v10PYQForm(subjectName, unitId)}</div>
    <div class="v10-pane"    id="v10-iq-${unitId}">${v10IQForm(subjectName, unitId)}</div>
  </div>`;
}

function v10SwitchTab(btn, paneId) {
  const panel = btn.closest('.v10-panel');
  panel.querySelectorAll('.v10-tab').forEach(t => t.classList.remove('on'));
  panel.querySelectorAll('.v10-pane').forEach(p => p.classList.remove('on'));
  btn.classList.add('on');
  const pane = document.getElementById(paneId);
  if (pane) pane.classList.add('on');
}

/* ── NOTES form ── */
function v10NotesForm(subjectName, unitId) {
  const notes = JSON.parse(localStorage.getItem('edusync_admin_notes') || '[]')
    .filter(n => n.subject === subjectName && parseInt(n.unit) === unitId);
  const s = (subjectName || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  return `
  <div class="v10-form">
    <p class="hint">Notes uploaded here will appear in the student's <strong>Notes tab</strong> for this unit.</p>
    <div class="input-group">
      <span class="v10-label">NOTES TITLE</span>
      <input class="input" id="v10-ntitle-${unitId}" placeholder="e.g. Unit ${unitId} Handwritten Notes">
    </div>
    <div class="v10-2col">
      <div class="input-group">
        <span class="v10-label">TYPE</span>
        <select class="select" id="v10-ntype-${unitId}">
          <option value="pdf">📄 PDF</option>
          <option value="doc">📝 DOC</option>
          <option value="link">🔗 Link</option>
        </select>
      </div>
      <div class="input-group">
        <span class="v10-label">UNIT</span>
        <select class="select" id="v10-nunit-${unitId}">
          ${[1, 2, 3, 4, 5].map(u => `<option value="${u}"${u === unitId ? ' selected' : ''}>Unit ${u}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="input-group">
      <span class="v10-label">SUBJECT</span>
      <input class="input" value="${subjectName}" readonly style="background:var(--surface2);">
    </div>
    <div class="input-group">
      <span class="v10-label">LINK / URL (GOOGLE DRIVE, PDF URL ETC.)</span>
      <input class="input" id="v10-nlink-${unitId}" placeholder="https://drive.google.com/..." type="url">
    </div>
    <button class="v10-submit" onclick="v10UploadNote('${s}',${unitId})">📄 Upload Notes</button>
  </div>
  ${notes.length ? `
  <div class="v10-items">
    <div class="v10-items-head">Uploaded Notes (${notes.length})</div>
    ${notes.map(n => `
    <div class="v10-item">
      <span style="font-size:1.1rem;">${n.type === 'pdf' ? '📄' : n.type === 'doc' ? '📝' : '🔗'}</span>
      <div class="v10-item-body">
        <div class="v10-item-title">${n.title}</div>
        <div class="v10-item-meta">${(n.type || '').toUpperCase()} · ${n.uploadedAt || ''}</div>
      </div>
      <button class="v10-del v10-edit-btn" onclick="aimeasyEditNote(${n.id},'${s}',${unitId})" title="Edit" style="color:var(--primary);margin-right:4px;">✏️</button>
      <button class="v10-del v10-del-btn" onclick="v10DeleteNote(${n.id},'${s}',${unitId})" title="Delete">🗑</button>
    </div>`).join('')}
  </div>` : ''}`;
}

function v10UploadNote(subjectName, unitId) {
  const title = document.getElementById('v10-ntitle-' + unitId)?.value.trim();
  const type = document.getElementById('v10-ntype-' + unitId)?.value;
  const link = document.getElementById('v10-nlink-' + unitId)?.value.trim();
  if (!title) { showToast('Enter a note title', 'red'); return; }
  const notes = JSON.parse(localStorage.getItem('edusync_admin_notes') || '[]');
  notes.push({ id: Date.now(), title, type, link, subject: subjectName, unit: unitId, uploadedAt: new Date().toLocaleDateString() });
  localStorage.setItem('edusync_admin_notes', JSON.stringify(notes));
  document.getElementById('v10-ntitle-' + unitId).value = '';
  document.getElementById('v10-nlink-' + unitId).value = '';
  showToast('✅ Notes uploaded! Students can now see them.', 'green');
  const pane = document.getElementById('v10-notes-' + unitId);
  if (pane) pane.innerHTML = v10NotesForm(subjectName, unitId);
}

function v10DeleteNote(id, subjectName, unitId) {
  if (!confirm('Delete this note?')) return;
  const notes = JSON.parse(localStorage.getItem('edusync_admin_notes') || '[]');
  localStorage.setItem('edusync_admin_notes', JSON.stringify(notes.filter(n => n.id !== id)));
  showToast('Note deleted', 'red');
  const pane = document.getElementById('v10-notes-' + unitId);
  if (pane) pane.innerHTML = v10NotesForm(subjectName, unitId);
}

/* ── PYQ form ── */
function v10PYQForm(subjectName, unitId) {
  const pyqs = JSON.parse(localStorage.getItem('edusync_admin_pyqs') || '[]')
    .filter(p => p.subject === subjectName && parseInt(p.unit) === unitId);
  const s = (subjectName || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  return `
  <div class="v10-form">
    <p class="hint">PYQs uploaded here will appear in the student's <strong>Previous Year Qs tab</strong>.</p>
    <div class="v10-2col">
      <div class="input-group">
        <span class="v10-label">EXAM YEAR</span>
        <input class="input" id="v10-pyqyr-${unitId}" placeholder="e.g. 2023" type="number" min="2000" max="2099">
      </div>
      <div class="input-group">
        <span class="v10-label">REPEATED COUNT</span>
        <input class="input" id="v10-pyqcnt-${unitId}" type="number" min="1" value="1">
      </div>
    </div>
    <div class="input-group">
      <span class="v10-label">QUESTION TEXT</span>
      <textarea class="input" id="v10-pyqtxt-${unitId}" placeholder="Type the question here..." rows="3" style="resize:vertical;"></textarea>
    </div>
    <div class="input-group">
      <span class="v10-label">ANSWER (OPTIONAL)</span>
      <textarea class="input" id="v10-pyqans-${unitId}" placeholder="Type the answer or explanation..." rows="3" style="resize:vertical;"></textarea>
    </div>
    <div class="v10-2col">
      <div class="input-group">
        <span class="v10-label">SUBJECT</span>
        <input class="input" value="${subjectName}" readonly style="background:var(--surface2);">
      </div>
      <div class="input-group">
        <span class="v10-label">UNIT</span>
        <select class="select" id="v10-pyqunit-${unitId}">
          ${[1, 2, 3, 4, 5].map(u => `<option value="${u}"${u === unitId ? ' selected' : ''}>Unit ${u}</option>`).join('')}
        </select>
      </div>
    </div>
    <button class="v10-submit" onclick="v10UploadPYQ('${s}',${unitId})">📝 Upload Question</button>
  </div>
  ${pyqs.length ? `
  <div class="v10-items">
    <div class="v10-items-head">Uploaded PYQs (${pyqs.length})</div>
    ${pyqs.map(p => `
    <div class="v10-item">
      <span style="font-size:1rem;">📅</span>
      <div class="v10-item-body">
        <div class="v10-item-title">${p.question.substring(0, 90)}${p.question.length > 90 ? '...' : ''}</div>
        <div class="v10-item-meta">Year: ${p.year} · ×${p.count || 1} times</div>
      </div>
      <button class="v10-del v10-edit-btn" onclick="aimeasyEditPYQ(${p.id},'${s}',${unitId})" title="Edit" style="color:var(--primary);margin-right:4px;">✏️</button>
      <button class="v10-del v10-del-btn" onclick="v10DeletePYQ(${p.id},'${s}',${unitId})" title="Delete">🗑</button>
    </div>`).join('')}
  </div>` : ''}`;
}

function v10UploadPYQ(subjectName, unitId) {
  const year = document.getElementById('v10-pyqyr-' + unitId)?.value;
  const count = document.getElementById('v10-pyqcnt-' + unitId)?.value || '1';
  const question = document.getElementById('v10-pyqtxt-' + unitId)?.value.trim();
  const answer = document.getElementById('v10-pyqans-' + unitId)?.value.trim();
  if (!question) { showToast('Enter the question text', 'red'); return; }
  if (!year) { showToast('Enter the exam year', 'red'); return; }
  const pyqs = JSON.parse(localStorage.getItem('edusync_admin_pyqs') || '[]');
  pyqs.push({ id: Date.now(), question, answer, year, count: parseInt(count) || 1, subject: subjectName, unit: unitId });
  localStorage.setItem('edusync_admin_pyqs', JSON.stringify(pyqs));
  document.getElementById('v10-pyqtxt-' + unitId).value = '';
  document.getElementById('v10-pyqans-' + unitId).value = '';
  document.getElementById('v10-pyqyr-' + unitId).value = '';
  showToast('✅ PYQ added and live for students!', 'green');
  const pane = document.getElementById('v10-pyq-' + unitId);
  if (pane) pane.innerHTML = v10PYQForm(subjectName, unitId);
}

function v10DeletePYQ(id, subjectName, unitId) {
  if (!confirm('Delete this PYQ?')) return;
  const pyqs = JSON.parse(localStorage.getItem('edusync_admin_pyqs') || '[]');
  localStorage.setItem('edusync_admin_pyqs', JSON.stringify(pyqs.filter(p => p.id !== id)));
  showToast('PYQ deleted', 'red');
  const pane = document.getElementById('v10-pyq-' + unitId);
  if (pane) pane.innerHTML = v10PYQForm(subjectName, unitId);
}

/* ── Important Questions form ── */
function v10IQForm(subjectName, unitId) {
  const iqs = JSON.parse(localStorage.getItem('edusync_admin_iqs') || '[]')
    .filter(q => q.subject === subjectName && parseInt(q.unit) === unitId);
  const s = (subjectName || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  return `
  <div class="v10-form">
    <p class="hint">Important questions uploaded here will appear in the student's <strong>Important Qs tab</strong>.</p>
    <div class="input-group">
      <span class="v10-label">QUESTION</span>
      <textarea class="input" id="v10-iqtxt-${unitId}" placeholder="Type the important question..." rows="3" style="resize:vertical;"></textarea>
    </div>
    <div class="v10-2col">
      <div class="input-group">
        <span class="v10-label">PRIORITY</span>
        <select class="select" id="v10-iqprio-${unitId}">
          <option value="high">🔴 High Priority</option>
          <option value="med" selected>🟡 Medium Priority</option>
          <option value="low">🟢 Low Priority</option>
        </select>
      </div>
      <div class="input-group">
        <span class="v10-label">TAGS (COMMA SEPARATED)</span>
        <input class="input" id="v10-iqtags-${unitId}" placeholder="e.g. Unit ${unitId}, Memory">
      </div>
    </div>
    <div class="v10-2col">
      <div class="input-group">
        <span class="v10-label">SUBJECT</span>
        <input class="input" value="${subjectName}" readonly style="background:var(--surface2);">
      </div>
      <div class="input-group">
        <span class="v10-label">UNIT</span>
        <select class="select" id="v10-iqunit-${unitId}">
          ${[1, 2, 3, 4, 5].map(u => `<option value="${u}"${u === unitId ? ' selected' : ''}>Unit ${u}</option>`).join('')}
        </select>
      </div>
    </div>
    <button class="v10-submit" onclick="v10UploadIQ('${s}',${unitId})">+ Add Question</button>
  </div>
  ${iqs.length ? `
  <div class="v10-items">
    <div class="v10-items-head">Added Questions (${iqs.length})</div>
    ${iqs.map(q => `
    <div class="v10-item">
      <span style="font-size:1rem;">${q.priority === 'high' ? '🔴' : q.priority === 'low' ? '🟢' : '🟡'}</span>
      <div class="v10-item-body">
        <div class="v10-item-title">${q.question.substring(0, 90)}${q.question.length > 90 ? '...' : ''}</div>
        <div class="v10-item-meta">${q.priority === 'high' ? 'High Priority' : q.priority === 'low' ? 'Low Priority' : 'Medium Priority'}${q.tags ? ' · ' + q.tags : ''}</div>
      </div>
      <button class="v10-del v10-edit-btn" onclick="aimeasyEditIQ(${q.id},'${s}',${unitId})" title="Edit" style="color:var(--primary);margin-right:4px;">✏️</button>
      <button class="v10-del v10-del-btn" onclick="v10DeleteIQ(${q.id},'${s}',${unitId})" title="Delete">🗑</button>
    </div>`).join('')}
  </div>` : ''}`;
}

function v10UploadIQ(subjectName, unitId) {
  const question = document.getElementById('v10-iqtxt-' + unitId)?.value.trim();
  const priority = document.getElementById('v10-iqprio-' + unitId)?.value;
  const tags = document.getElementById('v10-iqtags-' + unitId)?.value.trim();
  if (!question) { showToast('Enter the question', 'red'); return; }
  const iqs = JSON.parse(localStorage.getItem('edusync_admin_iqs') || '[]');
  iqs.push({ id: Date.now(), question, priority, tags, subject: subjectName, unit: unitId, uploadedAt: new Date().toLocaleString() });
  localStorage.setItem('edusync_admin_iqs', JSON.stringify(iqs));
  document.getElementById('v10-iqtxt-' + unitId).value = '';
  document.getElementById('v10-iqtags-' + unitId).value = '';
  showToast('✅ Important question added! Students can now see it.', 'green');
  const pane = document.getElementById('v10-iq-' + unitId);
  if (pane) pane.innerHTML = v10IQForm(subjectName, unitId);
}

function v10DeleteIQ(id, subjectName, unitId) {
  if (!confirm('Delete this question?')) return;
  const iqs = JSON.parse(localStorage.getItem('edusync_admin_iqs') || '[]');
  localStorage.setItem('edusync_admin_iqs', JSON.stringify(iqs.filter(q => q.id !== id)));
  showToast('Question deleted', 'red');
  const pane = document.getElementById('v10-iq-' + unitId);
  if (pane) pane.innerHTML = v10IQForm(subjectName, unitId);
}

function v10UnitTopics(unitId) {
  const subj = window._v10SASubj || {};
  const units = JSON.parse(localStorage.getItem('edusync_units_' + subj.id) || '[]');
  return (units.find(u => parseInt(u.id) === parseInt(unitId))?.topics || []);
}

function v10TopicSelect(subjectName, unitId, selected = '', target = '') {
  const topics = v10UnitTopics(unitId);
  return `<select class="select v10-topic-select" id="v10-topic-${unitId}">
    <option value="">Select Topic</option>
    ${topics.map((t, i) => {
    const id = t.id || String(i + 1);
    const label = t.name || t.topicName || `Topic ${i + 1}`;
    return `<option value="${id}" data-title="${label.replace(/"/g, '&quot;')}"${String(selected) === String(id) ? ' selected' : ''}>${label}</option>`;
  }).join('')}
  </select>`.replace('<select ', `<select ${target ? `onchange="v10ApplyTopicSelection(this,'${target}',${unitId})" ` : ''}`);
}

function v10TopicNameById(unitId, topicId) {
  const topics = v10UnitTopics(unitId);
  const idx = topics.findIndex((t, i) => String(t.id || i + 1) === String(topicId));
  return idx >= 0 ? (topics[idx].name || topics[idx].topicName || `Topic ${idx + 1}`) : '';
}

function v10SubjectForDb(subjectName) {
  const subjects = JSON.parse(localStorage.getItem('edusync_custom_subjects') || '[]');
  const activeBranch = (APP.currentSubject?.branch || APP.user?.branch || APP.user?.branch_name || window._v10SASubj?.branch || '').toUpperCase();
  return subjects.find(s => s.name === subjectName && (!activeBranch || String(s.branch || '').toUpperCase() === activeBranch))
    || subjects.find(s => s.name === subjectName)
    || window._v10SASubj
    || APP.currentSubject
    || { name: subjectName };
}

function v10BranchForSubject(subjectName) {
  const subject = v10SubjectForDb(subjectName);
  return String(subject?.branch || APP.currentSubject?.branch || APP.user?.branch || APP.user?.branch_name || '').toUpperCase();
}

function v10SameBranchContent(item, branch) {
  const itemBranch = String(item?.branch || '').toUpperCase();
  const activeBranch = String(branch || '').toUpperCase();
  if (!activeBranch) return true;
  return itemBranch === activeBranch;
}

function v10UnitForDb(unitId) {
  const subject = v10SubjectForDb('');
  const units = JSON.parse(localStorage.getItem('edusync_units_' + subject?.id) || '[]');
  const unit = units.find(u => parseInt(u.id) === parseInt(unitId)) || { id: unitId, name: `Unit ${unitId}` };
  return { ...unit, dbUnitId: subject?.dbUnitIds?.[unitId] || unit?.dbUnitId };
}

function v10StoreUnitTopics(subjId, unitId, topics, unitName) {
  let units = JSON.parse(localStorage.getItem('edusync_units_' + subjId) || '[]');
  if (!units.length) units = Array.from({ length: 5 }, (_, i) => ({ id: i + 1, name: `Unit ${i + 1}`, topics: [] }));
  const ui = units.findIndex(u => parseInt(u.id) === parseInt(unitId));
  if (ui >= 0) units[ui] = { ...units[ui], topics };
  else units.push({ id: unitId, name: unitName || `Unit ${unitId}`, topics });
  localStorage.setItem('edusync_units_' + subjId, JSON.stringify(units));
  return units;
}

function v10PersistSubjectDbIds(subjId, unitId, data) {
  if (!data?.subjectId || !data?.unitId) return;
  const subjects = JSON.parse(localStorage.getItem('edusync_custom_subjects') || '[]');
  const idx = subjects.findIndex(s => String(s.id) === String(subjId));
  if (idx >= 0) {
    subjects[idx].dbSubjectId = data.subjectId;
    subjects[idx].dbUnitIds = { ...(subjects[idx].dbUnitIds || {}), [unitId]: data.unitId };
    localStorage.setItem('edusync_custom_subjects', JSON.stringify(subjects));
    if (window._v10SASubj && String(window._v10SASubj.id) === String(subjId)) {
      window._v10SASubj = subjects[idx];
    }
  }
}

async function v10ReloadUnitRoadmapFromDb(subjId, unitId, subject, unit) {
  if (!window.aimeasyFetchUnitRoadmap || !subject) return null;
  const { data, error } = await window.aimeasyFetchUnitRoadmap({ subject, unit });
  if (error) {
    console.warn('Roadmap DB reload failed:', error);
    return null;
  }
  v10PersistSubjectDbIds(subjId, unitId, data);
  const units = v10StoreUnitTopics(subjId, unitId, data.topics || [], unit?.name);
  const roadmaps = JSON.parse(localStorage.getItem('edusync_roadmaps') || '{}');
  if (!roadmaps[subjId]) roadmaps[subjId] = [];
  const rm = roadmaps[subjId].find(r => parseInt(r.unit) === parseInt(unitId));
  if (rm) rm.topics = data.topics || [];
  else roadmaps[subjId].push({ unit: unitId, topics: data.topics || [] });
  localStorage.setItem('edusync_roadmaps', JSON.stringify(roadmaps));
  return units.find(u => parseInt(u.id) === parseInt(unitId)) || null;
}

async function v10GetDbContextForUnit(subjectName, unitId) {
  const subject = v10SubjectForDb(subjectName);
  if (!window.aimeasyFetchUnitRoadmap || !subject) return null;
  const { data, error } = await window.aimeasyFetchUnitRoadmap({
    subject,
    unit: { id: unitId, name: `Unit ${unitId}`, dbUnitId: subject?.dbUnitIds?.[unitId] },
  });
  if (error) {
    console.warn('Content DB context failed:', error);
    return null;
  }
  return data;
}

function v10MergeUnitContentRows(subjectName, unitId, notesRows = [], pyqRows = [], iqRows = []) {
  const branch = v10BranchForSubject(subjectName);
  function mergeByDbId(key, rows, mapRow) {
    const all = JSON.parse(localStorage.getItem(key) || '[]').filter(item => (
      item.subject !== subjectName || parseInt(item.unit) !== parseInt(unitId) || !item.dbContentId || !v10SameBranchContent(item, branch)
    ));
    const mapped = (rows || []).map(mapRow);
    localStorage.setItem(key, JSON.stringify([...all, ...mapped]));
  }
  mergeByDbId('edusync_admin_notes', notesRows, row => ({
    id: row.id,
    dbContentId: row.id,
    title: row.title || row.metadata?.topicTitle || 'Note',
    description: row.body || '',
    type: 'link',
    link: row.url || '',
    subject: subjectName,
    branch: row.branch || row.metadata?.branch || branch,
    unit: unitId,
    topicId: row.metadata?.topicLegacyId || row.metadata?.topicId || '',
    topicName: row.metadata?.topicTitle || row.metadata?.topicText || row.title || '',
    uploadedAt: row.created_at ? new Date(row.created_at).toLocaleDateString() : '',
  }));
  mergeByDbId('edusync_admin_pyqs', pyqRows, row => ({
    id: row.id,
    dbContentId: row.id,
    question: row.body || row.title || '',
    year: row.metadata?.year || '',
    marks: row.metadata?.marks || '',
    count: row.metadata?.count || 1,
    answer: row.metadata?.answer || '',
    subject: subjectName,
    branch: row.branch || row.metadata?.branch || branch,
    unit: unitId,
    topicId: row.metadata?.topicLegacyId || row.metadata?.topicId || '',
    topicName: row.metadata?.topicTitle || row.metadata?.topicText || '',
  }));
  mergeByDbId('edusync_admin_iqs', iqRows, row => ({
    id: row.id,
    dbContentId: row.id,
    question: row.body || row.title || '',
    priority: row.metadata?.priority || 'med',
    tags: row.metadata?.tags || '',
    subject: subjectName,
    branch: row.branch || row.metadata?.branch || branch,
    unit: unitId,
    topicId: row.metadata?.topicLegacyId || row.metadata?.topicId || '',
    topicName: row.metadata?.topicTitle || row.metadata?.topicText || '',
    uploadedAt: row.created_at ? new Date(row.created_at).toLocaleString() : '',
  }));
}

async function v10ReloadUnitContentFromDb(subjectName, unitId) {
  if (!window.aimeasyListContent) return;
  const ctx = await v10GetDbContextForUnit(subjectName, unitId);
  if (!ctx?.subjectId || !ctx?.unitId) return;
  const [notesResult, pyqsResult, iqsResult] = await Promise.all([
    window.aimeasyListContent({ subjectId: ctx.subjectId, unitId: ctx.unitId, contentType: 'note' }),
    window.aimeasyListContent({ subjectId: ctx.subjectId, unitId: ctx.unitId, contentType: 'pyq' }),
    window.aimeasyListContent({ subjectId: ctx.subjectId, unitId: ctx.unitId, contentType: 'iq' }),
  ]);
  if (notesResult?.error || pyqsResult?.error || iqsResult?.error) {
    console.warn('Content DB reload failed:', notesResult?.error || pyqsResult?.error || iqsResult?.error);
    return;
  }
  v10MergeUnitContentRows(subjectName, unitId, notesResult.data || [], pyqsResult.data || [], iqsResult.data || []);
}

function v10FormatRoadmapError(error) {
  if (!error) return 'Unknown Supabase error';
  return [
    error.code,
    error.message,
    error.details,
    error.hint,
  ].filter(Boolean).join(' | ') || JSON.stringify(error);
}

function v10EscapeAttr(value) {
  return String(value || '').replace(/"/g, '&quot;');
}

function v10EscapeJs(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function v10TopicFieldsHTML(subjectName, unitId, target) {
  return `<div class="input-group"><span class="v10-label">TOPIC DROPDOWN (OPTIONAL)</span>${v10TopicSelect(subjectName, unitId, '', target)}</div>
    <div class="input-group"><span class="v10-label">TOPIC TEXT</span><input class="input v10-topic-text-input" id="v10-${target}-topic-text-${unitId}" placeholder="Type or select a topic" /></div>`;
}

function v10ApplyTopicSelection(select, target, unitId) {
  const selected = select?.options?.[select.selectedIndex];
  const title = selected?.dataset?.title || selected?.textContent || '';
  const input = document.getElementById(`v10-${target}-topic-text-${unitId}`);
  if (input && title && select.value) input.value = title.trim();
}

window.v10ApplyTopicSelection = v10ApplyTopicSelection;

function v10ReadTopicInput(unitId, target) {
  const select = document.querySelector(`#v10-${target}-${unitId} .v10-topic-select`);
  const topicId = select?.value || '';
  const selectedTitle = topicId ? (select?.options?.[select.selectedIndex]?.dataset?.title || v10TopicNameById(unitId, topicId)) : '';
  const topicText = document.getElementById(`v10-${target}-topic-text-${unitId}`)?.value.trim() || selectedTitle.trim();
  return { topicId, topicName: topicText, selectedTitle };
}

function v10ContentActionMenu(editCall, deleteCall) {
  return `<details class="v10-actions-menu"><summary title="Actions">...</summary><div class="v10-actions-dropdown">
    <button onclick="${editCall}">Edit</button>
    <button class="danger" onclick="${deleteCall}">Delete</button>
  </div></details>`;
}

async function v10RefreshContentPane(kind, subjectName, unitId) {
  await v10ReloadUnitContentFromDb(subjectName, unitId);
  const pane = document.getElementById(`v10-${kind}-${unitId}`);
  if (!pane) {
    console.warn('[ROADMAP] Content refresh skipped: missing pane', { kind, unitId });
    return;
  }
  const renderers = {
    notes: v10NotesForm,
    pyq: v10PYQForm,
    iq: v10IQForm,
  };
  const renderer = renderers[kind];
  if (typeof renderer === 'function') pane.innerHTML = renderer(subjectName, unitId);
}

function v10NormalizeVideosFromRow(row) {
  return Array.from(row.querySelectorAll('.v10-url-row')).map((urlRow) => ({
    url: urlRow.querySelector('.v10-url-input')?.value.trim() || '',
    description: urlRow.querySelector('.v10-video-desc-input')?.value.trim() || '',
  })).filter(video => video.url || video.description);
}

function v10SavedRoadmapTree(topics, subjId, unitId) {
  const list = Array.isArray(topics) ? topics : [];
  if (!list.length) return '<div class="v10-saved-roadmap-empty">Saved roadmap will appear here after save.</div>';
  return `<div class="v10-saved-roadmap"><div class="v10-items-head">Saved Roadmap (${list.length})</div>${list.map((topic, ti) => {
    const videos = Array.isArray(topic.videos) && topic.videos.length
      ? topic.videos
      : (topic.youtubeUrls || topic.urls || []).map((url) => ({ url, description: '' }));
    const topicName = topic.name || topic.topicName || `Topic ${ti + 1}`;
    return `<div class="v10-saved-topic" data-topic-index="${ti}">
      <div class="v10-saved-topic-head" style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">
        <input class="input v10-saved-topic-input" value="${String(topicName).replace(/"/g, '&quot;')}" onchange="v10EditSavedRoadmapTopic(${subjId},${unitId},${ti},this.value)" style="font-weight:700;font-size:.82rem;min-width:0;flex:1;" />
        <details class="v10-actions-menu"><summary title="Actions">...</summary><div class="v10-actions-dropdown">
          <button onclick="this.closest('details').removeAttribute('open');this.closest('.v10-saved-topic').querySelector('.v10-saved-topic-input')?.focus()">Edit</button>
          <button class="danger" onclick="v10DeleteSavedRoadmapTopic(${subjId},${unitId},${ti})">Delete</button>
        </div></details>
      </div>
      <div class="roadmap-video-tree">${videos.length ? videos.map((video, vi) => `<div class="roadmap-video-child" style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px;align-items:start;margin-top:6px;">
        <input class="input" value="${String(video.description || '').replace(/"/g, '&quot;')}" placeholder="Description ${vi + 1}" onchange="v10EditSavedRoadmapVideo(${subjId},${unitId},${ti},${vi},'description',this.value)" style="font-size:.76rem;" />
        <details class="v10-actions-menu"><summary title="Actions">...</summary><div class="v10-actions-dropdown">
          <button onclick="this.closest('.roadmap-video-child').querySelector('input')?.focus()">Edit</button>
          <button class="danger" onclick="v10DeleteSavedRoadmapVideo(${subjId},${unitId},${ti},${vi})">Delete</button>
        </div></details>
        <input class="input" value="${String(video.url || '').replace(/"/g, '&quot;')}" placeholder="Video URL ${vi + 1}" onchange="v10EditSavedRoadmapVideo(${subjId},${unitId},${ti},${vi},'url',this.value)" style="font-size:.76rem;grid-column:1 / -1;" />
      </div>`).join('') : '<div class="roadmap-video-child">No videos added yet</div>'}</div>
    </div>`;
  }).join('')}</div>`;
}

v10RoadmapPanel = function v10RoadmapPanelEnhanced(subjId, unitId, topics) {
  const rows = topics.length ? topics.map((t, i) => v10TopicRowHTML(
    subjId,
    unitId,
    i,
    t.name || t.topicName || '',
    Array.isArray(t.videos) && t.videos.length
      ? t.videos
      : (Array.isArray(t.youtubeUrls) ? t.youtubeUrls : (t.youtubeUrl || t.url ? [t.youtubeUrl || t.url] : [''])),
    topics.length,
    t.id || ''
  )).join('')
    : `<div id="v10-rm-empty-${unitId}" style="text-align:center;padding:1.8rem;color:var(--text3);">
        <div style="font-weight:600;font-size:.88rem;">No topics yet</div>
        <div style="font-size:.76rem;margin-top:4px;">Click "+ Add Topic" to build the roadmap</div>
       </div>`;

  return `
  <div class="v10-panel">
    <div class="v10-panel-head">
      <h4>Learning Roadmap</h4>
      <div class="v10-panel-actions">
        <button class="btn btn-primary btn-sm"onclick="v10AddTopic('${subjId}','${unitId}',false)">+ Add Main Topic</button>
        <button class="btn btn-ghost btn-sm"onclick="v10AddTopic('${subjId}','${unitId}',true)">+ Add Sub Topic</button>
      </div>
    </div>
    <div class="v10-panel-body">
      <div id="v10-topics-${unitId}">${rows}</div>
      <button class="v10-submit"onclick="v10SaveRoadmap('${subjId}','${unitId}')">Save Learning Roadmap</button>
      <div id="v10-saved-roadmap-${unitId}" style="margin-top:1rem;">${v10SavedRoadmapTree(topics, subjId, unitId)}</div>
    </div>
  </div>`;
};

v10TopicRowHTML = function v10TopicRowHTMLEnhanced(subjId, unitId, idx, name, urls, total, topicId = '') {
  const isFilled = name.trim() !== '';
  const videos = (Array.isArray(urls) && urls.length ? urls : ['']).map((item) => (
    typeof item === 'object'
      ? { url: item.url || item.youtubeUrl || '', description: item.description || item.title || '' }
      : { url: item || '', description: '' }
  ));
  const urlRows = videos.map((video, ui) => `
    <div class="v10-url-row" style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;margin-top:8px;align-items:start;">
      <input class="v10-url-input" placeholder="${ui === 0 ? 'Video URL' : 'Additional video URL'}" value="${(video.url || '').replace(/"/g, '&quot;')}" style="font-size:.78rem;width:100%;" />
      ${ui === 0
      ? `<button type="button" class="btn btn-ghost btn-sm" onclick="v10AddTopicUrl('${subjId}','${unitId}','${idx}')" title="Add another video">+</button>`
      : `<button type="button" class="btn btn-ghost btn-sm" onclick="v10RemoveTopicUrl(this)" title="Remove video">x</button>`}
      <input class="v10-video-desc-input" placeholder="${ui === 0 ? 'Video 1 description' : `Video ${ui + 1} description`}" value="${(video.description || '').replace(/"/g, '&quot;')}" style="font-size:.78rem;grid-column:1 / -1;width:100%;" />
    </div>`).join('');
  return `
  <div class="v10-topic-row" id="v10-tr-${unitId}-${idx}" data-topic-id="${topicId}">
    <div class="v10-dot ${isFilled ? 'filled' : ''}" id="v10-dot-${unitId}-${idx}">${idx + 1}</div>
    <div class="v10-topic-fields">
      <input class="${isFilled ? 'filled' : ''}" placeholder="Topic name (e.g. Introduction to AI)" value="${name.replace(/"/g, '&quot;')}" oninput="v10DotUpdate('${unitId}',${idx},this.value)" />
      <div class="v10-url-list">${urlRows}</div>
    </div>
    <button class="v10-rm-btn" onclick="v10RemoveTopic('${unitId0}',${idx})" title="Remove">x</button>
  </div>`;
};

v10AddTopicUrl = function v10AddTopicUrlEnhanced(subjId, unitId, topicIdx) {
  const row = document.getElementById('v10-tr-' + unitId + '-' + topicIdx);
  const urlList = row?.querySelector('.v10-url-list');
  if (!urlList) return;
  const count = urlList.querySelectorAll('.v10-url-row').length + 1;
  const div = document.createElement('div');
  div.className = 'v10-url-row';
  div.style.cssText = 'display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;margin-top:8px;align-items:start;';
  div.innerHTML = `<input class="v10-url-input" placeholder="Additional video URL" style="font-size:.78rem;width:100%;" />
    <button type="button" class="btn btn-ghost btn-sm" onclick="v10RemoveTopicUrl(this)" title="Remove video">x</button>
    <input class="v10-video-desc-input" placeholder="Video ${count} description" style="font-size:.78rem;grid-column:1 / -1;width:100%;" />`;
  urlList.appendChild(div);
};

function v10RoadmapRows(unitId) {
  return Array.from(document.querySelectorAll(`#v10-topics-${unitId} .v10-topic-row`));
}

function v10SavedRow(unitId, topicIdx) {
  return v10RoadmapRows(unitId)[topicIdx] || null;
}

function v10EditSavedRoadmapTopic(subjId, unitId, topicIdx, value) {
  const row = v10SavedRow(unitId, topicIdx);
  const input = row?.querySelector('.v10-topic-fields input:first-child');
  if (!input) return;
  input.value = value;
  v10DotUpdate?.(unitId, topicIdx, value);
  v10SaveRoadmap(subjId, unitId);
}

function v10EditSavedRoadmapVideo(subjId, unitId, topicIdx, videoIdx, field, value) {
  const row = v10SavedRow(unitId, topicIdx);
  const videoRow = row?.querySelectorAll('.v10-url-row')?.[videoIdx];
  if (!videoRow) return;
  const target = field === 'description'
    ? videoRow.querySelector('.v10-video-desc-input')
    : videoRow.querySelector('.v10-url-input');
  if (!target) return;
  target.value = value;
  v10SaveRoadmap(subjId, unitId);
}

function v10DeleteSavedRoadmapVideo(subjId, unitId, topicIdx, videoIdx) {
  const row = v10SavedRow(unitId, topicIdx);
  const videoRows = row ? Array.from(row.querySelectorAll('.v10-url-row')) : [];
  const videoRow = videoRows[videoIdx];
  if (!videoRow) return;
  if (videoRows.length === 1) {
    const urlInput = videoRow.querySelector('.v10-url-input');
    const descInput = videoRow.querySelector('.v10-video-desc-input');
    if (urlInput) urlInput.value = '';
    if (descInput) descInput.value = '';
  } else {
    videoRow.remove();
  }
  v10SaveRoadmap(subjId, unitId);
}

function v10DeleteSavedRoadmapTopic(subjId, unitId, topicIdx) {
  const row = v10SavedRow(unitId, topicIdx);
  if (!row) return;
  row.remove();
  v10SaveRoadmap(subjId, unitId);
}

v10SaveRoadmap = async function v10SaveRoadmapEnhanced(subjId, unitId) {
  console.log('[ROADMAP] Save Started');
  const container = document.getElementById('v10-topics-' + unitId);
  if (!container) return;
  const topics = [];
  container.querySelectorAll('.v10-topic-row').forEach((row, index) => {
    const name = row.querySelector('.v10-topic-fields input:first-child')?.value.trim();
    const videos = v10NormalizeVideosFromRow(row);
    if (!name) return;
    const topicId = row.dataset.topicId || `${Date.now()}-${index}`;
    const urls = videos.map(video => video.url).filter(Boolean);
    topics.push({
      id: topicId,
      topicName: name,
      name,
      videos,
      youtubeUrl: urls[0] || '',
      youtubeUrls: urls,
      url: urls[0] || '',
      urls,
    });
  });

    const subject = JSON.parse(localStorage.getItem('edusync_custom_subjects') || '[]').find(s => String(s.id) === String(subjId)) || window._v10SASubj || window._v11AdminSubj;
  const units = JSON.parse(localStorage.getItem('edusync_units_' + subjId) || '[]');
  const unit = units.find(u => parseInt(u.id) === parseInt(unitId)) || { id: unitId, name: `Unit ${unitId}` };
  if (!window.aimeasySaveUnitRoadmap || !subject) {
    showToast('Roadmap DB save is unavailable. Supabase is the required source of truth.', 'red');
    return;
  }
  const { data, error } = await window.aimeasySaveUnitRoadmap({ subject, unit, topics });
  if (error) {
    const exact = v10FormatRoadmapError(error);
    console.error('[ROADMAP] Save Failed', error);
    showToast('Roadmap DB sync failed: ' + exact, 'red');
    return;
  }
    if (typeof window.v10PersistSubjectDbIds === 'function') {
      window.v10PersistSubjectDbIds(subjId, unitId, data);
    }
  await v10ReloadUnitRoadmapFromDb(subjId, unitId, { ...subject, dbSubjectId: data.subjectId }, { ...unit, dbUnitId: data.unitId });
    if (document.getElementById('sa-content')) {
      window.v10SAUnitDetail?.(subjId, unitId);
    } else if (document.getElementById('admin-content')) {
      window.v11AdminUnitDetail?.(subjId, unitId);
    }
  showToast('Learning Roadmap saved and refreshed.', 'green');
};

function v10VideosFromRoadmapPanel(subjectName, unitId) {
  const topics = v10UnitTopics(unitId);
  const rows = topics.flatMap((topic, ti) => {
    const videos = Array.isArray(topic.videos) && topic.videos.length
      ? topic.videos
      : (topic.youtubeUrls || topic.urls || []).map(url => ({ url, description: '' }));
    return videos.map((video, vi) => ({ topic, ti, video, vi }));
  });
  return `<div class="v10-items"><div class="v10-items-head">Videos from Learning Roadmap (${rows.length})</div>
    ${rows.length ? rows.map(({ topic, ti, video, vi }) => `<div class="v10-item"><span>${vi === rows.length - 1 ? '└' : '├'}</span><div class="v10-item-body"><div class="v10-item-title">${topic.name || topic.topicName || `Topic ${ti + 1}`}</div><div class="v10-item-meta">${video.description || `Video ${vi + 1}`}</div><div class="v10-item-meta" style="color:var(--primary);word-break:break-all;">${video.url || ''}</div></div></div>`).join('') : '<p style="color:var(--text3);font-size:.83rem;padding:1rem;">No roadmap videos yet.</p>'}
  </div>`;
}

v10ContentPanel = function v10ContentPanelLinked(subjectName, unitId, role) {
  return `<div class="v10-panel"><div class="v10-panel-head"><h4>Unit Content</h4></div><div class="v10-tabs">
    <button class="v10-tab on" onclick="v10SwitchTab(this,'v10-notes-${unitId}')">Notes</button>
    <button class="v10-tab" onclick="v10SwitchTab(this,'v10-pyq-${unitId}')">PYQs</button>
    <button class="v10-tab" onclick="v10SwitchTab(this,'v10-iq-${unitId}')">Important Qs</button>
  </div><div class="v10-pane on" id="v10-notes-${unitId}">${v10NotesForm(subjectName, unitId)}</div><div class="v10-pane" id="v10-pyq-${unitId}">${v10PYQForm(subjectName, unitId)}</div><div class="v10-pane" id="v10-iq-${unitId}">${v10IQForm(subjectName, unitId)}</div></div>`;
};

v10NotesForm = function v10NotesFormLinked(subjectName, unitId) {
  const notes = JSON.parse(localStorage.getItem('edusync_admin_notes') || '[]').filter(n => n.subject === subjectName && parseInt(n.unit) === parseInt(unitId));
  const s = v10EscapeJs(subjectName);
  return `<div class="v10-form"><p class="hint">Select an existing roadmap topic or type a new topic.</p>${v10TopicFieldsHTML(subjectName, unitId, 'notes')}<div class="input-group"><span class="v10-label">NOTE URL / FILE</span><input class="input" id="v10-nlink-${unitId}" placeholder="https://drive.google.com/..." type="url"></div><div class="input-group"><span class="v10-label">DESCRIPTION</span><textarea class="input" id="v10-ndesc-${unitId}" rows="3" style="resize:vertical;"></textarea></div><button class="v10-submit" onclick="v10UploadNote('${s}',${unitId})">Save Note</button></div>${notes.length ? `<div class="v10-items"><div class="v10-items-head">Uploaded Notes (${notes.length})</div>${notes.map(n => `<div class="v10-item"><span>📄</span><div class="v10-item-body"><div class="v10-item-title">${n.topicName || n.title}</div><div class="v10-item-meta">${n.description || n.title || ''} · ${n.uploadedAt || ''}</div></div><button class="v10-del v10-edit-btn" onclick="aimeasyEditNote('${n.id}','${s}',${unitId})" style="color:var(--primary);margin-right:4px;">Edit</button><button class="v10-del v10-del-btn" onclick="v10DeleteNote('${n.id}','${s}',${unitId})">Delete</button></div>`).join('')}</div>` : ''}`;
};

v10UploadNote = async function v10UploadNoteLinked(subjectName, unitId) {
  const link = document.getElementById('v10-nlink-' + unitId)?.value.trim();
  const description = document.getElementById('v10-ndesc-' + unitId)?.value.trim() || '';
  const { topicId, topicName } = v10ReadTopicInput(unitId, 'notes');
  if (!topicName) { showToast('Enter topic text or select a topic', 'red'); return; }
  const notes = JSON.parse(localStorage.getItem('edusync_admin_notes') || '[]');
  const note = { id: Date.now(), title: topicName, description, type: 'link', link, subject: subjectName, unit: unitId, topicId, topicName, uploadedAt: new Date().toLocaleDateString() };
  const saved = await window.aimeasySaveLinkedContentItem?.({ subject: v10SubjectForDb(subjectName), unit: v10UnitForDb(unitId), topicTitle: topicName, topicLegacyId: topicId, contentType: 'note', title: topicName, body: description, url: link, metadata: { topicId, topicText: topicName } });
  if (saved?.error) { showToast('DB save failed: ' + saved.error.message, 'red'); return; }
  if (saved?.data?.id) note.dbContentId = saved.data.id;
  notes.push(note);
  localStorage.setItem('edusync_admin_notes', JSON.stringify(notes));
  await v10RefreshContentPane('notes', subjectName, unitId);
  window.renderSubAdminDashboardLive?.();
  console.log('[NOTES] Save Success', { subjectName, unitId, topicId, topicName, contentId: saved?.data?.id });
  showToast('Note saved under topic.', 'green');
};

v10PYQForm = function v10PYQFormLinked(subjectName, unitId) {
  const pyqs = JSON.parse(localStorage.getItem('edusync_admin_pyqs') || '[]').filter(p => p.subject === subjectName && parseInt(p.unit) === parseInt(unitId));
  const s = (subjectName || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  return `<div class="v10-form"><p class="hint">PYQs are linked to a roadmap topic.</p><div class="input-group"><span class="v10-label">TOPIC</span>${v10TopicSelect(subjectName, unitId)}</div><div class="v10-2col"><div class="input-group"><span class="v10-label">YEAR</span><input class="input" id="v10-pyqyr-${unitId}" type="number" min="2000" max="2099"></div><div class="input-group"><span class="v10-label">MARKS</span><input class="input" id="v10-pyqmarks-${unitId}" type="number" min="1"></div></div><div class="input-group"><span class="v10-label">QUESTION</span><textarea class="input" id="v10-pyqtxt-${unitId}" rows="3" style="resize:vertical;"></textarea></div><button class="v10-submit" onclick="v10UploadPYQ('${s}',${unitId})">Save PYQ</button></div>${pyqs.length ? `<div class="v10-items"><div class="v10-items-head">PYQs (${pyqs.length})</div>${pyqs.map(p => `<div class="v10-item"><span>📝</span><div class="v10-item-body"><div class="v10-item-title">${p.question}</div><div class="v10-item-meta">${p.topicName || 'No topic'} · ${p.year || '-'} · ${p.marks || p.count || '-'} marks</div></div><button class="v10-del v10-edit-btn" onclick="aimeasyEditPYQ(${p.id},'${s}',${unitId})" style="color:var(--primary);margin-right:4px;">Edit</button><button class="v10-del v10-del-btn" onclick="v10DeletePYQ(${p.id},'${s}',${unitId})">Del</button></div>`).join('')}</div>` : ''}`;
};

v10UploadPYQ = async function v10UploadPYQLinked(subjectName, unitId) {
  const question = document.getElementById('v10-pyqtxt-' + unitId)?.value.trim();
  const year = document.getElementById('v10-pyqyr-' + unitId)?.value;
  const marks = document.getElementById('v10-pyqmarks-' + unitId)?.value;
  const topicId = document.querySelector(`#v10-pyq-${unitId} .v10-topic-select`)?.value || '';
  const topicName = v10TopicNameById(unitId, topicId);
  if (!topicId) { showToast('Select a topic', 'red'); return; }
  if (!question) { showToast('Enter question', 'red'); return; }
  const pyqs = JSON.parse(localStorage.getItem('edusync_admin_pyqs') || '[]');
  const pyq = { id: Date.now(), question, year, marks, subject: subjectName, unit: unitId, topicId, topicName };
  const saved = await window.aimeasySaveLinkedContentItem?.({ subject: v10SubjectForDb(subjectName), unit: v10UnitForDb(unitId), topicTitle: topicName, topicLegacyId: topicId, contentType: 'pyq', title: question.slice(0, 80), body: question, metadata: { year, marks, topicId } });
  if (saved?.error) { showToast('DB save failed: ' + saved.error.message, 'red'); return; }
  if (saved?.data?.id) pyq.dbContentId = saved.data.id;
  pyqs.push(pyq);
  localStorage.setItem('edusync_admin_pyqs', JSON.stringify(pyqs));
  await v10RefreshContentPane('pyq', subjectName, unitId);
  window.renderSubAdminDashboardLive?.();
  console.log('[PYQ] Save Success', { subjectName, unitId, topicId, topicName, contentId: saved?.data?.id });
  showToast('PYQ saved under topic.', 'green');
};

v10IQForm = function v10IQFormLinked(subjectName, unitId) {
  const iqs = JSON.parse(localStorage.getItem('edusync_admin_iqs') || '[]').filter(q => q.subject === subjectName && parseInt(q.unit) === parseInt(unitId));
  const s = (subjectName || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  return `<div class="v10-form"><p class="hint">Important questions are linked to a roadmap topic.</p><div class="input-group"><span class="v10-label">TOPIC</span>${v10TopicSelect(subjectName, unitId)}</div><div class="input-group"><span class="v10-label">QUESTION</span><textarea class="input" id="v10-iqtxt-${unitId}" rows="3" style="resize:vertical;"></textarea></div><div class="input-group"><span class="v10-label">PRIORITY</span><select class="select" id="v10-iqprio-${unitId}"><option value="high">High</option><option value="med" selected>Medium</option><option value="low">Low</option></select></div><button class="v10-submit" onclick="v10UploadIQ('${s}',${unitId})">Save Important Question</button></div>${iqs.length ? `<div class="v10-items"><div class="v10-items-head">Important Questions (${iqs.length})</div>${iqs.map(q => `<div class="v10-item"><span>⭐</span><div class="v10-item-body"><div class="v10-item-title">${q.question}</div><div class="v10-item-meta">${q.topicName || 'No topic'} · ${q.priority || 'med'}</div></div><button class="v10-del v10-edit-btn" onclick="aimeasyEditIQ(${q.id},'${s}',${unitId})" style="color:var(--primary);margin-right:4px;">Edit</button><button class="v10-del v10-del-btn" onclick="v10DeleteIQ(${q.id},'${s}',${unitId})">Del</button></div>`).join('')}</div>` : ''}`;
};

v10UploadIQ = async function v10UploadIQLinked(subjectName, unitId) {
  const question = document.getElementById('v10-iqtxt-' + unitId)?.value.trim();
  const priority = document.getElementById('v10-iqprio-' + unitId)?.value;
  const topicId = document.querySelector(`#v10-iq-${unitId} .v10-topic-select`)?.value || '';
  const topicName = v10TopicNameById(unitId, topicId);
  if (!topicId) { showToast('Select a topic', 'red'); return; }
  if (!question) { showToast('Enter question', 'red'); return; }
  const iqs = JSON.parse(localStorage.getItem('edusync_admin_iqs') || '[]');
  const iq = { id: Date.now(), question, priority, subject: subjectName, unit: unitId, topicId, topicName, uploadedAt: new Date().toLocaleString() };
  const saved = await window.aimeasySaveLinkedContentItem?.({ subject: v10SubjectForDb(subjectName), unit: v10UnitForDb(unitId), topicTitle: topicName, topicLegacyId: topicId, contentType: 'iq', title: question.slice(0, 80), body: question, metadata: { priority, topicId } });
  if (saved?.error) { showToast('DB save failed: ' + saved.error.message, 'red'); return; }
  if (saved?.data?.id) iq.dbContentId = saved.data.id;
  iqs.push(iq);
  localStorage.setItem('edusync_admin_iqs', JSON.stringify(iqs));
  await v10RefreshContentPane('iq', subjectName, unitId);
  window.renderSubAdminDashboardLive?.();
  console.log('[IMPORTANT] Save Success', { subjectName, unitId, topicId, topicName, contentId: saved?.data?.id });
  showToast('Important question saved under topic.', 'green');
};

/* ── Patch renderSAUnitsPage so old onclick still works ── */
v10DeleteNote = async function v10DeleteNoteLinked(id, subjectName, unitId) {
  if (!confirm('Delete this note?')) return;
  const notes = JSON.parse(localStorage.getItem('edusync_admin_notes') || '[]');
  const note = notes.find(n => n.id === id);
  if (note?.dbContentId) await window.aimeasyDeleteContent?.(note.dbContentId);
  localStorage.setItem('edusync_admin_notes', JSON.stringify(notes.filter(n => n.id !== id)));
  await v10RefreshContentPane('notes', subjectName, unitId);
  window.renderSubAdminDashboardLive?.();
  showToast('Note deleted', 'red');
};

v10DeletePYQ = async function v10DeletePYQLinked(id, subjectName, unitId) {
  if (!confirm('Delete this PYQ?')) return;
  const pyqs = JSON.parse(localStorage.getItem('edusync_admin_pyqs') || '[]');
  const pyq = pyqs.find(p => p.id === id);
  if (pyq?.dbContentId) await window.aimeasyDeleteContent?.(pyq.dbContentId);
  localStorage.setItem('edusync_admin_pyqs', JSON.stringify(pyqs.filter(p => p.id !== id)));
  await v10RefreshContentPane('pyq', subjectName, unitId);
  window.renderSubAdminDashboardLive?.();
  showToast('PYQ deleted', 'red');
};

v10DeleteIQ = async function v10DeleteIQLinked(id, subjectName, unitId) {
  if (!confirm('Delete this question?')) return;
  const iqs = JSON.parse(localStorage.getItem('edusync_admin_iqs') || '[]');
  const iq = iqs.find(q => q.id === id);
  if (iq?.dbContentId) await window.aimeasyDeleteContent?.(iq.dbContentId);
  localStorage.setItem('edusync_admin_iqs', JSON.stringify(iqs.filter(q => q.id !== id)));
  await v10RefreshContentPane('iq', subjectName, unitId);
  window.renderSubAdminDashboardLive?.();
  showToast('Question deleted', 'red');
};

v10NotesForm = function v10NotesFormTopicText(subjectName, unitId) {
  const notes = JSON.parse(localStorage.getItem('edusync_admin_notes') || '[]').filter(n => n.subject === subjectName && parseInt(n.unit) === parseInt(unitId));
  const s = v10EscapeJs(subjectName);
  return `<div class="v10-form"><p class="hint">Select an existing roadmap topic or type a new topic.</p>${v10TopicFieldsHTML(subjectName, unitId, 'notes')}<div class="input-group"><span class="v10-label">NOTE URL / FILE</span><input class="input" id="v10-nlink-${unitId}" placeholder="https://drive.google.com/..." type="url"></div><div class="input-group"><span class="v10-label">DESCRIPTION</span><textarea class="input" id="v10-ndesc-${unitId}" rows="3" style="resize:vertical;"></textarea></div><button class="v10-submit" onclick="v10UploadNote('${s}',${unitId})">Save Note</button></div>${notes.length ? `<div class="v10-items"><div class="v10-items-head">Uploaded Notes (${notes.length})</div>${notes.map(n => `<div class="v10-item"><span>📄</span><div class="v10-item-body"><div class="v10-item-title">${n.topicName || n.title}</div><div class="v10-item-meta">${n.description || n.title || ''} · ${n.uploadedAt || ''}</div></div><button class="v10-del v10-edit-btn" onclick="aimeasyEditNote('${n.id}','${s}',${unitId})" style="color:var(--primary);margin-right:4px;">Edit</button><button class="v10-del v10-del-btn" onclick="v10DeleteNote('${n.id}','${s}',${unitId})">Delete</button></div>`).join('')}</div>` : ''}`;
};

v10UploadNote = async function v10UploadNoteTopicText(subjectName, unitId) {
  const link = document.getElementById('v10-nlink-' + unitId)?.value.trim();
  const description = document.getElementById('v10-ndesc-' + unitId)?.value.trim() || '';
  const { topicId, topicName } = v10ReadTopicInput(unitId, 'notes');
  if (!topicName) { showToast('Enter topic text or select a topic', 'red'); return; }
  const notes = JSON.parse(localStorage.getItem('edusync_admin_notes') || '[]');
  const branch = v10BranchForSubject(subjectName);
  const note = { id: Date.now(), title: topicName, description, type: 'link', link, subject: subjectName, branch, unit: unitId, topicId, topicName, uploadedAt: new Date().toLocaleDateString() };
  const saved = await window.aimeasySaveLinkedContentItem?.({ subject: v10SubjectForDb(subjectName), unit: v10UnitForDb(unitId), topicTitle: topicName, topicLegacyId: topicId, contentType: 'note', title: topicName, body: description, url: link, metadata: { topicId, topicText: topicName, branch } });
  if (saved?.error) { showToast('DB save failed: ' + saved.error.message, 'red'); return; }
  if (saved?.data?.id) note.dbContentId = saved.data.id;
  notes.push(note);
  localStorage.setItem('edusync_admin_notes', JSON.stringify(notes));
  await v10RefreshContentPane('notes', subjectName, unitId);
  window.renderSubAdminDashboardLive?.();
  showToast('Note saved under topic.', 'green');
};

v10PYQForm = function v10PYQFormTopicText(subjectName, unitId) {
  const pyqs = JSON.parse(localStorage.getItem('edusync_admin_pyqs') || '[]').filter(p => p.subject === subjectName && parseInt(p.unit) === parseInt(unitId));
  const s = v10EscapeJs(subjectName);
  return `<div class="v10-form"><p class="hint">Select an existing roadmap topic or type a new topic.</p>${v10TopicFieldsHTML(subjectName, unitId, 'pyq')}<div class="v10-2col"><div class="input-group"><span class="v10-label">YEAR</span><input class="input" id="v10-pyqyr-${unitId}" type="number" min="2000" max="2099"></div><div class="input-group"><span class="v10-label">MARKS</span><input class="input" id="v10-pyqmarks-${unitId}" type="number" min="1"></div></div><div class="input-group"><span class="v10-label">QUESTION</span><textarea class="input" id="v10-pyqtxt-${unitId}" rows="3" style="resize:vertical;"></textarea></div><button class="v10-submit" onclick="v10UploadPYQ('${s}',${unitId})">Save PYQ</button></div>${pyqs.length ? `<div class="v10-items"><div class="v10-items-head">Uploaded PYQs (${pyqs.length})</div>${pyqs.map(p => `<div class="v10-item"><span>📝</span><div class="v10-item-body"><div class="v10-item-title">${p.question}</div><div class="v10-item-meta">${p.topicName || 'No topic'} · ${p.year || '-'} · ${p.marks || p.count || '-'} marks</div></div><button class="v10-del v10-edit-btn" onclick="aimeasyEditPYQ('${p.id}','${s}',${unitId})" style="color:var(--primary);margin-right:4px;">Edit</button><button class="v10-del v10-del-btn" onclick="v10DeletePYQ('${p.id}','${s}',${unitId})">Delete</button></div>`).join('')}</div>` : ''}`;
};

v10UploadPYQ = async function v10UploadPYQTopicText(subjectName, unitId) {
  const question = document.getElementById('v10-pyqtxt-' + unitId)?.value.trim();
  const year = document.getElementById('v10-pyqyr-' + unitId)?.value;
  const marks = document.getElementById('v10-pyqmarks-' + unitId)?.value;
  const { topicId, topicName } = v10ReadTopicInput(unitId, 'pyq');
  if (!topicName) { showToast('Enter topic text or select a topic', 'red'); return; }
  if (!question) { showToast('Enter question', 'red'); return; }
  const pyqs = JSON.parse(localStorage.getItem('edusync_admin_pyqs') || '[]');
  const branch = v10BranchForSubject(subjectName);
  const pyq = { id: Date.now(), question, year, marks, subject: subjectName, branch, unit: unitId, topicId, topicName };
  const saved = await window.aimeasySaveLinkedContentItem?.({ subject: v10SubjectForDb(subjectName), unit: v10UnitForDb(unitId), topicTitle: topicName, topicLegacyId: topicId, contentType: 'pyq', title: question.slice(0, 80), body: question, metadata: { year, marks, topicId, topicText: topicName, branch } });
  if (saved?.error) { showToast('DB save failed: ' + saved.error.message, 'red'); return; }
  if (saved?.data?.id) pyq.dbContentId = saved.data.id;
  pyqs.push(pyq);
  localStorage.setItem('edusync_admin_pyqs', JSON.stringify(pyqs));
  await v10RefreshContentPane('pyq', subjectName, unitId);
  window.renderSubAdminDashboardLive?.();
  showToast('PYQ saved under topic.', 'green');
};

v10IQForm = function v10IQFormTopicText(subjectName, unitId) {
  const iqs = JSON.parse(localStorage.getItem('edusync_admin_iqs') || '[]').filter(q => q.subject === subjectName && parseInt(q.unit) === parseInt(unitId));
  const s = v10EscapeJs(subjectName);
  return `<div class="v10-form"><p class="hint">Select an existing roadmap topic or type a new topic.</p>${v10TopicFieldsHTML(subjectName, unitId, 'iq')}<div class="input-group"><span class="v10-label">QUESTION</span><textarea class="input" id="v10-iqtxt-${unitId}" rows="3" style="resize:vertical;"></textarea></div><div class="input-group"><span class="v10-label">PRIORITY</span><select class="select" id="v10-iqprio-${unitId}"><option value="high">High</option><option value="med" selected>Medium</option><option value="low">Low</option></select></div><button class="v10-submit" onclick="v10UploadIQ('${s}',${unitId})">Save Important Question</button></div>${iqs.length ? `<div class="v10-items"><div class="v10-items-head">Uploaded Important Questions (${iqs.length})</div>${iqs.map(q => `<div class="v10-item"><span>⭐</span><div class="v10-item-body"><div class="v10-item-title">${q.question}</div><div class="v10-item-meta">${q.topicName || 'No topic'} · ${q.priority || 'med'}</div></div><button class="v10-del v10-edit-btn" onclick="aimeasyEditIQ('${q.id}','${s}',${unitId})" style="color:var(--primary);margin-right:4px;">Edit</button><button class="v10-del v10-del-btn" onclick="v10DeleteIQ('${q.id}','${s}',${unitId})">Delete</button></div>`).join('')}</div>` : ''}`;
};

v10UploadIQ = async function v10UploadIQTopicText(subjectName, unitId) {
  const question = document.getElementById('v10-iqtxt-' + unitId)?.value.trim();
  const priority = document.getElementById('v10-iqprio-' + unitId)?.value;
  const { topicId, topicName } = v10ReadTopicInput(unitId, 'iq');
  if (!topicName) { showToast('Enter topic text or select a topic', 'red'); return; }
  if (!question) { showToast('Enter question', 'red'); return; }
  const iqs = JSON.parse(localStorage.getItem('edusync_admin_iqs') || '[]');
  const branch = v10BranchForSubject(subjectName);
  const iq = { id: Date.now(), question, priority, subject: subjectName, branch, unit: unitId, topicId, topicName, uploadedAt: new Date().toLocaleString() };
  const saved = await window.aimeasySaveLinkedContentItem?.({ subject: v10SubjectForDb(subjectName), unit: v10UnitForDb(unitId), topicTitle: topicName, topicLegacyId: topicId, contentType: 'iq', title: question.slice(0, 80), body: question, metadata: { priority, topicId, topicText: topicName, branch } });
  if (saved?.error) { showToast('DB save failed: ' + saved.error.message, 'red'); return; }
  if (saved?.data?.id) iq.dbContentId = saved.data.id;
  iqs.push(iq);
  localStorage.setItem('edusync_admin_iqs', JSON.stringify(iqs));
  await v10RefreshContentPane('iq', subjectName, unitId);
  window.renderSubAdminDashboardLive?.();
  showToast('Important question saved under topic.', 'green');
};

v10NotesForm = function v10NotesFormMenuActions(subjectName, unitId) {
  const branch = v10BranchForSubject(subjectName);
  const notes = JSON.parse(localStorage.getItem('edusync_admin_notes') || '[]').filter(n => n.subject === subjectName && parseInt(n.unit) === parseInt(unitId) && v10SameBranchContent(n, branch));
  const s = v10EscapeJs(subjectName);
  return `<div class="v10-form"><p class="hint">Select a saved roadmap topic or type a matching topic.</p>${v10TopicFieldsHTML(subjectName, unitId, 'notes')}<div class="input-group"><span class="v10-label">PDF / NOTE URL</span><input class="input" id="v10-nlink-${unitId}" placeholder="https://drive.google.com/..." type="url"></div><div class="input-group"><span class="v10-label">DESCRIPTION</span><textarea class="input" id="v10-ndesc-${unitId}" rows="3" style="resize:vertical;"></textarea></div><button class="v10-submit" onclick="v10UploadNote('${s}',${unitId})">Save Note</button></div>${notes.length ? `<div class="v10-items"><div class="v10-items-head">Uploaded Notes (${notes.length})</div>${notes.map(n => `<div class="v10-item"><span>📄</span><div class="v10-item-body"><div class="v10-item-title">${n.topicName || n.title}</div><div class="v10-item-meta">${n.description || n.title || ''} · ${n.uploadedAt || ''}</div></div>${v10ContentActionMenu(`aimeasyEditNote('${n.id}','${s}',${unitId})`, `v10DeleteNote('${n.id}','${s}',${unitId})`)}</div>`).join('')}</div>` : ''}`;
};

v10PYQForm = function v10PYQFormMenuActions(subjectName, unitId) {
  const branch = v10BranchForSubject(subjectName);
  const pyqs = JSON.parse(localStorage.getItem('edusync_admin_pyqs') || '[]').filter(p => p.subject === subjectName && parseInt(p.unit) === parseInt(unitId) && v10SameBranchContent(p, branch));
  const s = v10EscapeJs(subjectName);
  return `<div class="v10-form"><p class="hint">Select a saved roadmap topic or type a matching topic.</p>${v10TopicFieldsHTML(subjectName, unitId, 'pyq')}<div class="v10-2col"><div class="input-group"><span class="v10-label">YEAR</span><input class="input" id="v10-pyqyr-${unitId}" type="number" min="2000" max="2099"></div><div class="input-group"><span class="v10-label">MARKS</span><input class="input" id="v10-pyqmarks-${unitId}" type="number" min="1"></div></div><div class="input-group"><span class="v10-label">QUESTION</span><textarea class="input" id="v10-pyqtxt-${unitId}" rows="3" style="resize:vertical;"></textarea></div><button class="v10-submit" onclick="v10UploadPYQ('${s}',${unitId})">Save PYQ</button></div>${pyqs.length ? `<div class="v10-items"><div class="v10-items-head">Uploaded PYQs (${pyqs.length})</div>${pyqs.map(p => `<div class="v10-item"><span>📝</span><div class="v10-item-body"><div class="v10-item-title">${p.question}</div><div class="v10-item-meta">${p.topicName || 'No topic'} · ${p.year || '-'} · ${p.marks || p.count || '-'} marks</div></div>${v10ContentActionMenu(`aimeasyEditPYQ('${p.id}','${s}',${unitId})`, `v10DeletePYQ('${p.id}','${s}',${unitId})`)}</div>`).join('')}</div>` : ''}`;
};

v10IQForm = function v10IQFormMenuActions(subjectName, unitId) {
  const branch = v10BranchForSubject(subjectName);
  const iqs = JSON.parse(localStorage.getItem('edusync_admin_iqs') || '[]').filter(q => q.subject === subjectName && parseInt(q.unit) === parseInt(unitId) && v10SameBranchContent(q, branch));
  const s = v10EscapeJs(subjectName);
  return `<div class="v10-form"><p class="hint">Select a saved roadmap topic or type a matching topic.</p>${v10TopicFieldsHTML(subjectName, unitId, 'iq')}<div class="input-group"><span class="v10-label">QUESTION</span><textarea class="input" id="v10-iqtxt-${unitId}" rows="3" style="resize:vertical;"></textarea></div><div class="input-group"><span class="v10-label">PRIORITY</span><select class="select" id="v10-iqprio-${unitId}"><option value="high">High</option><option value="med" selected>Medium</option><option value="low">Low</option></select></div><button class="v10-submit" onclick="v10UploadIQ('${s}',${unitId})">Save Important Question</button></div>${iqs.length ? `<div class="v10-items"><div class="v10-items-head">Uploaded Important Questions (${iqs.length})</div>${iqs.map(q => `<div class="v10-item"><span>⭐</span><div class="v10-item-body"><div class="v10-item-title">${q.question}</div><div class="v10-item-meta">${q.topicName || 'No topic'} · ${q.priority || 'med'}</div></div>${v10ContentActionMenu(`aimeasyEditIQ('${q.id}','${s}',${unitId})`, `v10DeleteIQ('${q.id}','${s}',${unitId})`)}</div>`).join('')}</div>` : ''}`;
};

function v10CloseActionMenus() {
  document.querySelectorAll('.v10-actions-menu.open').forEach(menu => menu.classList.remove('open'));
}

window.v10ToggleActionMenu = function v10ToggleActionMenu(button) {
  window.event?.stopPropagation();
  const menu = button.closest('.v10-actions-menu');
  const wasOpen = menu?.classList.contains('open');
  v10CloseActionMenus();
  if (menu && !wasOpen) menu.classList.add('open');
};

document.addEventListener('click', (event) => {
  if (!event.target.closest('.v10-actions-menu')) v10CloseActionMenus();
});

v10ContentActionMenu = function v10ContentActionMenuFixed(editCall, deleteCall) {
  return `<div class="v10-actions-menu">
    <button type="button" class="v10-actions-trigger" title="Actions" onclick="v10ToggleActionMenu(this)">...</button>
    <div class="v10-actions-dropdown">
      <button type="button" onclick="v10CloseActionMenus();${editCall}">Edit</button>
      <button type="button" class="danger" onclick="v10CloseActionMenus();${deleteCall}">Delete</button>
    </div>
  </div>`;
};

function v10FileUploadArea(unitId, target) {
  return `<div class="v10-drop-zone" data-target="${target}" data-unit="${unitId}" ondragover="v10UploadDragOver(event)" ondragleave="v10UploadDragLeave(event)" ondrop="v10UploadDrop(event,'${target}',${unitId})" onclick="document.getElementById('v10-${target}-file-${unitId}')?.click()">
    <input type="file" id="v10-${target}-file-${unitId}" accept=".pdf,.docx,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation" style="display:none" onchange="v10HandleUploadFile(this.files?.[0],'${target}',${unitId})">
    <div class="v10-drop-title">Drag PDF here</div>
    <div class="v10-drop-sub">or click to upload PDF, DOCX, or PPTX</div>
    <div class="v10-upload-progress" id="v10-${target}-progress-${unitId}"><span></span></div>
  </div>`;
}

window.v10UploadDragOver = function v10UploadDragOver(event) {
  event.preventDefault();
  event.currentTarget.classList.add('dragging');
};

window.v10UploadDragLeave = function v10UploadDragLeave(event) {
  event.currentTarget.classList.remove('dragging');
};

window.v10UploadDrop = function v10UploadDrop(event, target, unitId) {
  event.preventDefault();
  event.currentTarget.classList.remove('dragging');
  v10HandleUploadFile(event.dataTransfer?.files?.[0], target, unitId);
};

window.v10HandleUploadFile = function v10HandleUploadFile(file, target, unitId) {
  if (!file) return;
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const maxBytes = 25 * 1024 * 1024;
  if (!['pdf', 'docx', 'pptx'].includes(ext)) {
    showToast('Only PDF, DOCX, and PPTX files are supported.', 'red');
    return;
  }
  if (file.size > maxBytes) {
    showToast('Maximum upload size is 25 MB.', 'red');
    return;
  }
  const inputId = target === 'notes' ? `v10-nlink-${unitId}` : `v10-${target}link-${unitId}`;
  const urlInput = document.getElementById(inputId);
  const progress = document.getElementById(`v10-${target}-progress-${unitId}`);
  if (progress) {
    progress.classList.add('active');
    progress.querySelector('span').style.width = '30%';
  }
  window.setTimeout(() => {
    if (progress) progress.querySelector('span').style.width = '100%';
    if (urlInput) urlInput.value = URL.createObjectURL(file);
    console.log(`[${target === 'notes' ? 'NOTES' : target.toUpperCase()}] Upload Success`, { fileName: file.name, size: file.size });
    showToast('Upload ready. Press Save to publish it.', 'green');
  }, 250);
};

function v10RoadmapTopicActionMenu(subjId, unitId, topicIdx) {
  return `<div class="v10-actions-menu">
    <button type="button" class="v10-actions-trigger" title="Actions" onclick="v10ToggleActionMenu(this)">...</button>
    <div class="v10-actions-dropdown">
      <button type="button" onclick="v10CloseActionMenus();v10OpenRoadmapEditModal(${subjId},${unitId},${topicIdx})">Edit Topic</button>
      <button type="button" class="danger" onclick="v10CloseActionMenus();v10DeleteSavedRoadmapTopic(${subjId},${unitId},${topicIdx})">Delete Topic</button>
    </div>
  </div>`;
}

v10SavedRoadmapTree = function v10SavedRoadmapTreeFixed(topics, subjId, unitId) {
  const list = Array.isArray(topics) ? topics : [];
  if (!list.length) return '<div class="v10-saved-roadmap-empty">Saved roadmap will appear here after save.</div>';
  return `<div class="v10-saved-roadmap"><div class="v10-items-head">Saved Roadmap (${list.length})</div>${list.map((topic, ti) => {
    const videos = Array.isArray(topic.videos) && topic.videos.length
      ? topic.videos
      : (topic.youtubeUrls || topic.urls || []).map((url) => ({ url, description: '' }));
    const topicName = topic.name || topic.topicName || `Topic ${ti + 1}`;
    return `<div class="v10-saved-topic" data-topic-index="${ti}">
      <div class="v10-saved-topic-head">
        <div class="v10-saved-topic-title">${topicName}</div>
        ${v10RoadmapTopicActionMenu(subjId, unitId, ti)}
      </div>
      <div class="roadmap-video-tree">${videos.length ? videos.map((video, vi) => `<div class="roadmap-video-child"><strong>Video ${vi + 1}:</strong> ${video.description || 'No description'}<br><span>${video.url || 'No URL'}</span></div>`).join('') : '<div class="roadmap-video-child">No videos added yet</div>'}</div>
    </div>`;
  }).join('')}</div>`;
};

window.v10OpenRoadmapEditModal = function v10OpenRoadmapEditModal(subjId, unitId, topicIdx) {
  const row = v10SavedRow(unitId, topicIdx);
  if (!row) return;
  const topicInput = row.querySelector('.v10-topic-fields input:first-child');
  const videoRow = row.querySelector('.v10-url-row');
  const urlInput = videoRow?.querySelector('.v10-url-input');
  const descInput = videoRow?.querySelector('.v10-video-desc-input');
  const modal = document.createElement('div');
  modal.className = 'v10-edit-modal';
  modal.innerHTML = `<div class="v10-edit-box">
    <h3>Edit Topic</h3>
    <label>Topic Name<input class="input" id="v10-edit-topic-name" value="${v10EscapeAttr(topicInput?.value || '')}"></label>
    <label>Video URL<input class="input" id="v10-edit-topic-url" value="${v10EscapeAttr(urlInput?.value || '')}"></label>
    <label>Description<textarea class="input" id="v10-edit-topic-desc" rows="4">${descInput?.value || ''}</textarea></label>
    <div class="v10-edit-actions">
      <button class="btn btn-ghost" onclick="this.closest('.v10-edit-modal').remove()">Cancel</button>
      <button class="btn btn-primary" onclick="v10SaveRoadmapEditModal(${subjId},${unitId},${topicIdx})">Save Changes</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
};

window.v10SaveRoadmapEditModal = async function v10SaveRoadmapEditModal(subjId, unitId, topicIdx) {
  const row = v10SavedRow(unitId, topicIdx);
  if (!row) return;
  const topicInput = row.querySelector('.v10-topic-fields input:first-child');
  const videoRow = row.querySelector('.v10-url-row');
  const urlInput = videoRow?.querySelector('.v10-url-input');
  const descInput = videoRow?.querySelector('.v10-video-desc-input');
  if (topicInput) topicInput.value = document.getElementById('v10-edit-topic-name')?.value.trim() || '';
  if (urlInput) urlInput.value = document.getElementById('v10-edit-topic-url')?.value.trim() || '';
  if (descInput) descInput.value = document.getElementById('v10-edit-topic-desc')?.value.trim() || '';
  document.querySelector('.v10-edit-modal')?.remove();
  console.log('[DB] Topic Updated', { subjId, unitId, topicIdx });
  await v10SaveRoadmap(subjId, unitId);
};

const v10DeleteSavedRoadmapTopicOriginal = v10DeleteSavedRoadmapTopic;
v10DeleteSavedRoadmapTopic = function v10DeleteSavedRoadmapTopicConfirmed(subjId, unitId, topicIdx) {
  if (!confirm('Delete this roadmap topic and its related video URLs/descriptions?')) return;
  console.log('[DB] Topic Deleted', { subjId, unitId, topicIdx });
  v10DeleteSavedRoadmapTopicOriginal(subjId, unitId, topicIdx);
};

v10NotesForm = function v10NotesFormDropZone(subjectName, unitId) {
  const branch = v10BranchForSubject(subjectName);
  const notes = JSON.parse(localStorage.getItem('edusync_admin_notes') || '[]').filter(n => n.subject === subjectName && parseInt(n.unit) === parseInt(unitId) && v10SameBranchContent(n, branch));
  const s = v10EscapeJs(subjectName);
  return `<div class="v10-form">${v10TopicFieldsHTML(subjectName, unitId, 'notes')}${v10FileUploadArea(unitId, 'notes')}<div class="input-group"><span class="v10-label">PDF / NOTE URL</span><input class="input" id="v10-nlink-${unitId}" placeholder="https://drive.google.com/..." type="url"></div><div class="input-group"><span class="v10-label">DESCRIPTION</span><textarea class="input" id="v10-ndesc-${unitId}" rows="3" style="resize:vertical;"></textarea></div><button class="v10-submit" onclick="v10UploadNote('${s}',${unitId})">Save Note</button></div>${notes.length ? `<div class="v10-items"><div class="v10-items-head">Uploaded Notes (${notes.length})</div>${notes.map(n => `<div class="v10-item"><span>File</span><div class="v10-item-body"><div class="v10-item-title">${n.topicName || n.title}</div><div class="v10-item-meta">${n.description || n.title || ''} ${n.uploadedAt || ''}</div></div>${v10ContentActionMenu(`aimeasyEditNote('${n.id}','${s}',${unitId})`, `v10DeleteNote('${n.id}','${s}',${unitId})`)}</div>`).join('')}</div>` : ''}`;
};

v10PYQForm = function v10PYQFormDropZone(subjectName, unitId) {
  const branch = v10BranchForSubject(subjectName);
  const pyqs = JSON.parse(localStorage.getItem('edusync_admin_pyqs') || '[]').filter(p => p.subject === subjectName && parseInt(p.unit) === parseInt(unitId) && v10SameBranchContent(p, branch));
  const s = v10EscapeJs(subjectName);
  return `<div class="v10-form">${v10TopicFieldsHTML(subjectName, unitId, 'pyq')}${v10FileUploadArea(unitId, 'pyq')}<input class="input" id="v10-pyqlink-${unitId}" type="hidden"><div class="v10-2col"><div class="input-group"><span class="v10-label">YEAR</span><input class="input" id="v10-pyqyr-${unitId}" type="number" min="2000" max="2099"></div><div class="input-group"><span class="v10-label">MARKS</span><input class="input" id="v10-pyqmarks-${unitId}" type="number" min="1"></div></div><div class="input-group"><span class="v10-label">QUESTION</span><textarea class="input" id="v10-pyqtxt-${unitId}" rows="3" style="resize:vertical;"></textarea></div><button class="v10-submit" onclick="v10UploadPYQ('${s}',${unitId})">Save PYQ</button></div>${pyqs.length ? `<div class="v10-items"><div class="v10-items-head">Uploaded PYQs (${pyqs.length})</div>${pyqs.map(p => `<div class="v10-item"><span>Q</span><div class="v10-item-body"><div class="v10-item-title">${p.question}</div><div class="v10-item-meta">${p.topicName || 'No topic'} ${p.year || '-'} ${p.marks || p.count || '-'} marks</div></div>${v10ContentActionMenu(`aimeasyEditPYQ('${p.id}','${s}',${unitId})`, `v10DeletePYQ('${p.id}','${s}',${unitId})`)}</div>`).join('')}</div>` : ''}`;
};

v10IQForm = function v10IQFormDropZone(subjectName, unitId) {
  const branch = v10BranchForSubject(subjectName);
  const iqs = JSON.parse(localStorage.getItem('edusync_admin_iqs') || '[]').filter(q => q.subject === subjectName && parseInt(q.unit) === parseInt(unitId) && v10SameBranchContent(q, branch));
  const s = v10EscapeJs(subjectName);
  return `<div class="v10-form">${v10TopicFieldsHTML(subjectName, unitId, 'iq')}${v10FileUploadArea(unitId, 'iq')}<input class="input" id="v10-iqlink-${unitId}" type="hidden"><div class="input-group"><span class="v10-label">QUESTION</span><textarea class="input" id="v10-iqtxt-${unitId}" rows="3" style="resize:vertical;"></textarea></div><div class="input-group"><span class="v10-label">PRIORITY</span><select class="select" id="v10-iqprio-${unitId}"><option value="high">High</option><option value="med" selected>Medium</option><option value="low">Low</option></select></div><button class="v10-submit" onclick="v10UploadIQ('${s}',${unitId})">Save Important Question</button></div>${iqs.length ? `<div class="v10-items"><div class="v10-items-head">Uploaded Important Questions (${iqs.length})</div>${iqs.map(q => `<div class="v10-item"><span>!</span><div class="v10-item-body"><div class="v10-item-title">${q.question}</div><div class="v10-item-meta">${q.topicName || 'No topic'} ${q.priority || 'med'}</div></div>${v10ContentActionMenu(`aimeasyEditIQ('${q.id}','${s}',${unitId})`, `v10DeleteIQ('${q.id}','${s}',${unitId})`)}</div>`).join('')}</div>` : ''}`;
};

const v10UploadNoteWithLogs = v10UploadNote;
v10UploadNote = async function v10UploadNoteReliable(subjectName, unitId) {
  const before = JSON.parse(localStorage.getItem('edusync_admin_notes') || '[]').length;
  const result = await v10UploadNoteWithLogs(subjectName, unitId);
  const after = JSON.parse(localStorage.getItem('edusync_admin_notes') || '[]').length;
  if (after > before) console.log('[NOTES] Upload Success', { subjectName, unitId });
  return result;
};

const v10UploadPYQWithLogs = v10UploadPYQ;
v10UploadPYQ = async function v10UploadPYQReliable(subjectName, unitId) {
  const before = JSON.parse(localStorage.getItem('edusync_admin_pyqs') || '[]').length;
  const result = await v10UploadPYQWithLogs(subjectName, unitId);
  const after = JSON.parse(localStorage.getItem('edusync_admin_pyqs') || '[]').length;
  if (after > before) console.log('[PYQ] Save Success', { subjectName, unitId });
  return result;
};

const v10UploadIQWithLogs = v10UploadIQ;
v10UploadIQ = async function v10UploadIQReliable(subjectName, unitId) {
  const before = JSON.parse(localStorage.getItem('edusync_admin_iqs') || '[]').length;
  const result = await v10UploadIQWithLogs(subjectName, unitId);
  const after = JSON.parse(localStorage.getItem('edusync_admin_iqs') || '[]').length;
  if (after > before) console.log('[IMPORTANT] Save Success', { subjectName, unitId });
  return result;
};

renderSAUnitsPage = function (subj) {
  if (typeof subj === 'string') try { subj = JSON.parse(subj); } catch (e) { }
  if (!subj || !subj.id) return;
  window._v10SASubj = subj;
  v10SAUnitsPage(subj);
};

/* ── On load: patch admin "subjects" nav ── */
(function patchAdminSubjectsNav() {
  setTimeout(() => {
    const navEl = document.getElementById('admin-nav-subjects');
    if (navEl) navEl.onclick = function () { switchAdminSection('subjects'); };
  }, 300);
})();
// MOHAN'S STUDENT TRACKING AND METRICS
function updateLandingStats() {
  try {
    const elStudents = document.getElementById('stat-students');
    if (elStudents) elStudents.textContent = '0';

    const elSubjects = document.getElementById('stat-subjects');
    if (elSubjects) elSubjects.textContent = '0';

    const elPyqs = document.getElementById('stat-pyqs');
    if (elPyqs) elPyqs.textContent = '0';

    const elSat = document.getElementById('stat-satisfaction');
    if (elSat) elSat.textContent = '0';
  } catch (e) {
    // Landing page must never crash.
    try {
      console.warn('updateLandingStats failed:', e);
    } catch (_) { }
  }
}

function getSubjectProgress(subj) {
  if (!subj) return 0;
  if (typeof subj === 'string') {
    const found = Object.values(SUBJECTS_DB).flat().find(s => s.id === subj);
    if (found) {
      subj = found;
    } else {
      const customSubjects = JSON.parse(localStorage.getItem('edusync_custom_subjects') || '[]');
      const cFound = customSubjects.find(s => s.id === subj || s.rawId === subj);
      if (cFound) subj = cFound;
      else return 0;
    }
  }
  const subjId = subj.id;

  let units = [];
  if (subj.rawId) {
    units = JSON.parse(localStorage.getItem('edusync_units_' + subj.rawId) || '[]');
  } else if (subj.isCustom || (subjId && subjId.toString().startsWith('custom_'))) {
    const rawId = subjId.toString().replace('custom_', '');
    units = JSON.parse(localStorage.getItem('edusync_units_' + rawId) || '[]');
  }
  if (!units.length) {
    units = JSON.parse(localStorage.getItem('edusync_units_' + subjId) || '[]');
  }

  const unitCount = subj.units || 5;
  let totalTopics = 0;
  let completedTopics = 0;
  const completed = JSON.parse(localStorage.getItem('edusync_completed_topics') || '[]');

  if (units.length > 0) {
    units.forEach(u => {
      const topicCount = (u.topics || []).length;
      totalTopics += topicCount;
      (u.topics || []).forEach((t, i) => {
        const key = `${subjId}-${u.id}-${i}`;
        if (completed.includes(key)) {
          completedTopics++;
        }
      });
    });
  } else {
    const topicsDb = UNIT_TOPICS[subjId] || UNIT_TOPICS.default;
    for (let u = 1; u <= unitCount; u++) {
      const topics = topicsDb[u] || UNIT_TOPICS.default[1];
      totalTopics += topics.length;
      topics.forEach((t, i) => {
        const key = `${subjId}-${u}-${i}`;
        if (completed.includes(key)) {
          completedTopics++;
        }
      });
    }
  }

  if (totalTopics === 0) return 0;
  return Math.round((completedTopics / totalTopics) * 100);
}

function readStudentJson(key, fallback = []) {
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch { return fallback; }
}

function writeStudentJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function todayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function startOfWeek(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay() || 7;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day + 1);
  return d;
}

function getStudentAssignedSubjects() {
  const sem = APP.user?.semester || '3-1';
  const customSubjects = readStudentJson('edusync_custom_subjects', []);
  const colorOptions = ['teal', 'lavender', 'blue', 'green', 'amber'];
  return customSubjects
    .filter(s =>
      s.sem === sem &&
      (!APP.user?.branch || s.branch === APP.user.branch) &&
      (!APP.user?.regulation || s.reg === APP.user.regulation || !s.reg)
    )
    .map((s, i) => {
      const units = readStudentJson('edusync_units_' + s.id, []);
      return {
        id: 'custom_' + s.id,
        rawId: s.id,
        name: s.name,
        code: s.code || 'Subject',
        credits: parseInt(s.credits) || 3,
        units: units.length,
        color: colorOptions[i % colorOptions.length],
        icon: '\u{1F4D6}',
        branch: s.branch,
        isCustom: true
      };
    });
}

function contentItemsForSubject(subject) {
  const subjectName = subject?.name || '';
  const branch = subject?.branch || APP.user?.branch || APP.user?.branch_name || '';
  const keys = [
    ['edusync_admin_notes', 'note'],
    ['edusync_admin_videos', 'video'],
    ['edusync_admin_pyqs', 'quiz'],
    ['edusync_admin_iqs', 'iq']
  ];
  return keys.flatMap(([key, type]) => readStudentJson(key, [])
    .filter(item => item.subject === subjectName && v10SameBranchContent(item, branch))
    .map(item => ({ ...item, type })));
}

function totalLearningItems(subjects) {
  return subjects.reduce((total, subject) => {
    const units = readStudentJson('edusync_units_' + (subject.rawId || String(subject.id).replace('custom_', '')), []);
    const topicCount = units.reduce((sum, unit) => sum + (unit.topics || []).length, 0);
    return total + topicCount + units.length + contentItemsForSubject(subject).length;
  }, 0);
}

function recordStudyActivity(type, details = {}) {
  const now = new Date();
  const events = readStudentJson('edusync_study_activity', []);
  events.unshift({ type, ...details, at: now.toISOString(), day: todayKey(now) });
  writeStudentJson('edusync_study_activity', events.slice(0, 600));
  updateStudyStreak(now);
}

function updateStudyStreak(now = new Date()) {
  const events = readStudentJson('edusync_study_activity', []);
  const days = [...new Set(events.map(event => event.day).filter(Boolean))].sort().reverse();
  const today = todayKey(now);
  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = todayKey(yesterdayDate);
  let current = 0;
  if (days.includes(today) || days.includes(yesterday)) {
    const cursor = new Date(days.includes(today) ? now : yesterdayDate);
    while (days.includes(todayKey(cursor))) {
      current++;
      cursor.setDate(cursor.getDate() - 1);
    }
  }
  const best = Math.max(current, parseInt(localStorage.getItem('edusync_best_streak') || '0'));
  localStorage.setItem('edusync_streak', String(current));
  localStorage.setItem('edusync_best_streak', String(best));
  localStorage.setItem('edusync_last_active_date', events[0]?.day || '');
}

function markUnitCompletedIfReady(subjectId, unitId) {
  const subject = APP.currentSubject;
  const units = readStudentJson('edusync_units_' + (subject?.rawId || String(subjectId || '').replace('custom_', '')), []);
  const unit = units.find(item => String(item.id) === String(unitId));
  const topics = unit?.topics || [];
  if (!topics.length) return;
  const completed = readStudentJson('edusync_completed_topics', []);
  const unitDone = topics.every((topic, idx) => completed.includes(`${subjectId}-${unitId}-${idx}`));
  if (!unitDone) return;
  const unitsDone = readStudentJson('edusync_completed_units', []);
  const key = `${subjectId}-${unitId}`;
  if (!unitsDone.some(item => item.key === key)) {
    unitsDone.push({ key, subjectId, unitId, at: new Date().toISOString(), day: todayKey() });
    writeStudentJson('edusync_completed_units', unitsDone);
  }
}

function markTopicCompleted(subjectId, unitId, topicIndex) {
  if (topicIndex === undefined || topicIndex === null) return;
  const completed = readStudentJson('edusync_completed_topics', []);
  const key = `${subjectId}-${unitId}-${topicIndex}`;
  if (!completed.includes(key)) {
    completed.push(key);
    writeStudentJson('edusync_completed_topics', completed);
    recordStudyActivity('content_completed', { subjectId, unitId, topicIndex });
    markUnitCompletedIfReady(subjectId, unitId);
  }
}

function weeklyDashboardStats(subjects) {
  const weekStart = startOfWeek();
  const events = readStudentJson('edusync_study_activity', [])
    .filter(event => new Date(event.at) >= weekStart);
  const completedUnits = readStudentJson('edusync_completed_units', [])
    .filter(item => item.at && new Date(item.at) >= weekStart);
  const activeSubjects = new Set(events.map(event => event.subjectId).filter(Boolean));
  const weeklyCompletion = totalLearningItems(subjects)
    ? Math.min(100, Math.round((events.filter(event => event.type === 'content_completed').length / totalLearningItems(subjects)) * 100))
    : 0;
  return { weeklyCompletion, unitsCompleted: completedUnits.length, subjectsActive: activeSubjects.size };
}

function achievementList(subjects) {
  const events = readStudentJson('edusync_study_activity', []);
  const unitsDone = readStudentJson('edusync_completed_units', []);
  const streak = parseInt(localStorage.getItem('edusync_streak') || '0');
  const notesRead = events.filter(event => event.type === 'note_read').length;
  const subjectMilestones = subjects.filter(subject => getSubjectProgress(subject) >= 100).length;
  return [
    { label: 'First Subject Opened', icon: '\u{1F4D6}', earned: events.some(event => event.type === 'subject_opened') },
    { label: 'First Unit Completed', icon: '\u{2705}', earned: unitsDone.length >= 1 },
    { label: '5 Units Completed', icon: '\u{26A1}', earned: unitsDone.length >= 5 },
    { label: '10 Units Completed', icon: '\u{1F3C6}', earned: unitsDone.length >= 10 },
    { label: '7 Day Streak', icon: '\u{1F525}', earned: streak >= 7 },
    { label: '30 Day Streak', icon: '\u{1F451}', earned: streak >= 30 },
    { label: '100 Notes Read', icon: '\u{1F4DA}', earned: notesRead >= 100 },
    { label: `${subjectMilestones} Subject Milestone${subjectMilestones === 1 ? '' : 's'}`, icon: '\u{1F393}', earned: subjectMilestones > 0 }
  ];
}

function formatRecentTime(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.max(0, Math.floor(diffMs / 60000));
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function updateStudentDashboardMetrics() {
  loadCalcState();
  const calcdSems = APP.calcSemesters ? APP.calcSemesters.filter(s => s.sgpa !== null) : [];
  let cgpa = 0.0;
  if (calcdSems.length > 0) {
    cgpa = calcdSems.reduce((s, x) => s + x.sgpa, 0) / calcdSems.length;
  }

  updateStudyStreak();
  const subjects = getStudentAssignedSubjects();
  const weekly = weeklyDashboardStats(subjects);

  const metricVals = document.querySelectorAll('#page-dashboard .metric-card .metric-val');
  if (metricVals.length >= 3) {
    metricVals[0].textContent = cgpa > 0 ? cgpa.toFixed(2) : '0';
    const avgProgress = subjects.length
      ? Math.round(subjects.reduce((sum, s) => sum + getSubjectProgress(s), 0) / subjects.length)
      : 0;
    metricVals[1].textContent = avgProgress + '%';

    const streak = parseInt(localStorage.getItem('edusync_streak') || '0');
    metricVals[2].textContent = streak;
  }

  const trendEl = document.querySelector('#page-dashboard .metric-card.blue .metric-trend');
  if (trendEl) {
    if (calcdSems.length > 1) {
      const prevSems = calcdSems.slice(0, -1);
      const prevCgpa = prevSems.reduce((s, x) => s + x.sgpa, 0) / prevSems.length;
      const diff = cgpa - prevCgpa;
      const arrow = diff >= 0 ? '↑' : '↓';
      trendEl.textContent = `${arrow} ${Math.abs(diff).toFixed(2)} from last sem`;
    } else {
      trendEl.textContent = '↑ 0.0 from last sem';
    }
  }

  const streakEl = document.getElementById('study-streak-current');
  if (streakEl) streakEl.textContent = `${localStorage.getItem('edusync_streak') || '0'} \u{1F525}`;
  const streakMeta = document.getElementById('study-streak-meta');
  if (streakMeta) {
    const best = localStorage.getItem('edusync_best_streak') || '0';
    const last = localStorage.getItem('edusync_last_active_date') || 'Never';
    streakMeta.textContent = `Best Streak: ${best} · Last Active: ${last}`;
  }

  const progressTracker = document.querySelector('#page-dashboard .progress-tracker');
  if (progressTracker) {
    const heading = progressTracker.querySelector('.section-heading');
    progressTracker.innerHTML = '';
    if (heading) progressTracker.appendChild(heading);
    progressTracker.insertAdjacentHTML('beforeend', `
      <div class="weekly-summary">
        <div><strong>${weekly.weeklyCompletion}%</strong><span>Weekly Completion</span></div>
        <div><strong>${weekly.unitsCompleted}</strong><span>Units Completed This Week</span></div>
        <div><strong>${weekly.subjectsActive}</strong><span>Subjects Active This Week</span></div>
      </div>
    `);

    subjects.slice(0, 5).forEach((s, idx) => {
      const progress = getSubjectProgress(s);
      const colors = ['var(--green),var(--teal)', 'var(--amber),#f97316', 'var(--primary),var(--lavender)', 'var(--lavender),var(--primary)', 'var(--red),#f97316'];
      const color = colors[idx % colors.length];
      const trackerItem = document.createElement('div');
      trackerItem.className = 'tracker-item';
      trackerItem.innerHTML = `
        <div class="tracker-header">
          <span class="tracker-name">${v10Html(s.name)}</span>
          <span class="tracker-pct">${progress}%</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width:${progress}%;background:linear-gradient(90deg,${color});"></div>
        </div>
      `;
      progressTracker.appendChild(trackerItem);
    });
    if (!subjects.length) {
      progressTracker.insertAdjacentHTML('beforeend', '<p style="color:var(--text3);font-size:0.83rem;padding:1rem 0;text-align:center;">No assigned subjects yet.</p>');
    }
  }

  const recentListEl = document.getElementById('recently-opened-list');
  if (recentListEl) {
    const list = readStudentJson('edusync_recently_opened', []);
    if (list.length === 0) {
      recentListEl.innerHTML = `<p style="color:var(--text3);font-size:0.83rem;padding:1.4rem 0;text-align:center;">No recently opened subjects yet.</p>`;
    } else {
      recentListEl.innerHTML = list.map(item => `
        <div class="recent-item">
          <div class="recent-thumb" style="background:var(--primary-light);">${item.icon || '\u{1F4D6}'}</div>
          <div class="recent-info">
            <div class="recent-title">${v10Html(item.name)}</div>
            <div class="recent-sub">${v10Html(item.code || 'Subject')} · ${formatRecentTime(item.openedAt)}</div>
          </div>
          <button class="btn btn-primary btn-sm" onclick="openSubjectFromRecent('${v10EscapeJs(item.id || item.name)}')">Continue</button>
        </div>
      `).join('');
    }
  }

  const achievementsEl = document.getElementById('achievements-list');
  if (achievementsEl) {
    achievementsEl.innerHTML = achievementList(subjects).map(item => `
      <div class="achievement-card ${item.earned ? 'earned' : 'locked'}">
        <div class="achievement-icon">${item.icon}</div>
        <div>${v10Html(item.label)}</div>
      </div>
    `).join('');
  }
}

function addToRecentlyOpened(name, code, icon, id) {
  let list = readStudentJson('edusync_recently_opened', []);
  list = list.filter(item => item.id !== id && item.name !== name);
  list.unshift({ name, code, icon, id, openedAt: new Date().toISOString() });
  writeStudentJson('edusync_recently_opened', list.slice(0, 5));
}

/* Final roadmap/content fixes: floating menus, subtopics, DB-only student playback. */
function v10Html(value) {
  return String(value || '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

function v10VideoSubTopic(video, index) {
  return (video?.subTopicName || video?.description || video?.sub_topic_name || video?.title || `Resource ${index + 1}`).trim();
}

v10CloseActionMenus = function v10CloseActionMenusPortal() {
  document.querySelectorAll('.v10-actions-menu.open').forEach(menu => menu.classList.remove('open'));
  document.getElementById('v10-actions-portal')?.remove();
};

window.v10ToggleActionMenu = function v10ToggleActionMenuPortal(button, ev) {
  ev?.stopPropagation();
  const wrapper = button.closest('.v10-actions-menu');
  const wasOpen = wrapper?.classList.contains('open');
  v10CloseActionMenus();
  if (!wrapper || wasOpen) return;
  wrapper.classList.add('open');

  const portal = document.createElement('div');
  portal.id = 'v10-actions-portal';
  portal.className = 'v10-actions-portal';
  portal.innerHTML = `
    <button type="button" onclick="v10CloseActionMenus();${button.dataset.edit || ''}">${button.dataset.editLabel || 'Edit'}</button>
    <button type="button" class="danger" onclick="v10CloseActionMenus();${button.dataset.delete || ''}">${button.dataset.deleteLabel || 'Delete'}</button>`;
  document.body.appendChild(portal);

  const rect = button.getBoundingClientRect();
  const portalRect = portal.getBoundingClientRect();
  const left = Math.min(window.innerWidth - portalRect.width - 10, Math.max(10, rect.right - portalRect.width));
  const top = Math.min(window.innerHeight - portalRect.height - 10, rect.bottom + 6);
  portal.style.left = `${left}px`;
  portal.style.top = `${top}px`;
};

document.addEventListener('click', (event) => {
  if (!event.target.closest('.v10-actions-menu') && !event.target.closest('#v10-actions-portal')) {
    v10CloseActionMenus();
  }
}, true);
window.addEventListener('scroll', () => v10CloseActionMenus(), true);
window.addEventListener('resize', () => v10CloseActionMenus());

v10ContentActionMenu = function v10ContentActionMenuPortal(editCall, deleteCall) {
  return `<div class="v10-actions-menu">
    <button type="button" class="v10-actions-trigger" title="Actions" aria-label="Actions" data-edit="${v10EscapeAttr(editCall)}" data-delete="${v10EscapeAttr(deleteCall)}" onclick="v10ToggleActionMenu(this,event)">...</button>
  </div>`;
};

v10RoadmapTopicActionMenu = function (subjId, unitId, topicIdx) {
  return `<div class="v10-actions-menu">
    <button type="button" class="v10-actions-trigger" title="Actions" aria-label="Actions" data-edit-label="Edit Topic" data-delete-label="Delete Topic" data-edit="v10OpenRoadmapEditModal(${subjId},${unitId},${topicIdx})" data-delete="v10DeleteSavedRoadmapTopic(${subjId},${unitId},${topicIdx})" onclick="v10ToggleActionMenu(this,event)">...</button>
  </div>`;
}

v10NormalizeVideosFromRow = function v10NormalizeVideosFromRowSubtopics(row) {
  const urlRow = row.querySelector('.v10-url-row');
  if (!urlRow) return [];
  const video = {
    subTopicName: urlRow.querySelector('.v10-subtopic-input')?.value.trim() || '',
    url: urlRow.querySelector('.v10-url-input')?.value.trim() || '',
    description: urlRow.querySelector('.v10-video-desc-input')?.value.trim() || '',
  };
  return [video].filter(v => v.subTopicName || v.url || v.description);
};

v10TopicRowHTML = function v10TopicRowHTMLSubtopics(subjId, unitId, idx, name, urls, total, topicId = '', isSubTopic = false) {
  const isFilled = name.trim() !== '';
  const topicPlaceholder = isSubTopic ? 'Sub topic name (e.g. Topic 1.1)' : 'Topic name (e.g. Introduction to AI)';
  const video = Array.isArray(urls) && urls.length ? urls[0] : '';
  const parsedVideo = typeof video === 'object'
    ? { subTopicName: video.subTopicName || video.sub_topic_name || '', url: video.url || video.youtubeUrl || video.url || '', description: video.description || '' }
    : { subTopicName: '', url: video || '', description: '' };
  return `
  <div class="v10-topic-row${isSubTopic ? ' subtopic-row' : ''}" id="v10-tr-${unitId}-${idx}" data-topic-id="${topicId}">
    <div class="v10-dot ${isFilled ? 'filled' : ''}" id="v10-dot-${unitId}-${idx}">${idx + 1}</div>
    <div class="v10-topic-fields">
      <input class="${isFilled ? 'filled' : ''}" placeholder="${topicPlaceholder}" value="${v10EscapeAttr(name)}" oninput="v10DotUpdate('${unitId}',${idx},this.value)" />
      <div class="v10-url-row" style="display:grid;grid-template-columns:1fr;gap:8px;margin-top:10px;">
        <input class="input v10-subtopic-input" placeholder="Sub Topic name (optional)" value="${v10EscapeAttr(parsedVideo.subTopicName)}" style="font-size:.88rem;width:100%;" />
        <input class="input v10-url-input" placeholder="Video URL (optional)" value="${v10EscapeAttr(parsedVideo.url)}" style="font-size:.88rem;width:100%;" />
        <input class="input v10-video-desc-input" placeholder="Video description (optional)" value="${v10EscapeAttr(parsedVideo.description)}" style="font-size:.88rem;width:100%;" />
      </div>
    </div>
    <button class="v10-rm-btn" onclick="v10RemoveTopic('${unitId}',${idx})" title="Remove">✕</button>
  </div>`;
};

v10AddTopicUrl = function v10AddTopicUrlSubtopic(subjId, unitId, topicIdx) {
  const row = document.getElementById('v10-tr-' + unitId + '-' + topicIdx);
  const urlList = row?.querySelector('.v10-url-list');
  if (!urlList) return;
  const count = urlList.querySelectorAll('.v10-url-row').length + 1;
  const div = document.createElement('div');
  div.className = 'v10-url-row';
  div.style.cssText = 'display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;margin-top:8px;align-items:start;';
  div.innerHTML = `<input class="input v10-subtopic-input" placeholder="Sub Topic Name" value="Video ${count}" style="font-size:.78rem;width:100%;" />
    <button type="button" class="btn btn-ghost btn-sm" onclick="v10RemoveTopicUrl(this)" title="Remove video">x</button>
    <input class="v10-url-input" placeholder="Additional video URL" style="font-size:.78rem;width:100%;grid-column:1 / -1;" />
    <input class="v10-video-desc-input" placeholder="Video ${count} description" style="font-size:.78rem;grid-column:1 / -1;width:100%;" />`;
  urlList.appendChild(div);
};

v10SavedRoadmapTree = function v10SavedRoadmapTreeSubtopics(topics, subjId, unitId) {
  const list = Array.isArray(topics) ? topics : [];
  if (!list.length) return '<div class="v10-saved-roadmap-empty">Saved roadmap will appear here after save.</div>';
  return `<div class="v10-saved-roadmap"><div class="v10-items-head">Saved Roadmap (${list.length})</div>${list.map((topic, ti) => {
    const videos = Array.isArray(topic.videos) && topic.videos.length
      ? topic.videos
      : (topic.youtubeUrls || topic.urls || []).map((url) => ({ url, subTopicName: '', description: '' }));
    const topicName = topic.name || topic.topicName || `Topic ${ti + 1}`;
    return `<div class="v10-saved-topic" data-topic-index="${ti}">
      <div class="v10-saved-topic-head">
        <div class="v10-saved-topic-title">${v10Html(topicName)}</div>
        <div class="v10-saved-topic-actions">
          <button type="button" class="btn btn-ghost btn-sm" onclick="v10OpenRoadmapEditModal(${subjId},${unitId},${ti})">Edit</button>
          <button type="button" class="btn btn-danger btn-sm" onclick="v10DeleteSavedRoadmapTopic(${subjId},${unitId},${ti})">Delete</button>
        </div>
      </div>
      <div class="roadmap-video-tree">${videos.length ? videos.map((video, vi) => {
      const label = v10Html(video.subTopicName || video.description || 'Topic resource');
      return `<div class="roadmap-video-child"><strong>${label}</strong>${video.url ? `<div class="roadmap-video-url">${v10Html(video.url)}</div>` : ''}</div>`;
    }).join('') : '<div class="roadmap-video-child">No sub topics added yet</div>'}</div>
    </div>`;
  }).join('')}</div>`;
};

window.v10OpenRoadmapEditModal = function v10OpenRoadmapEditModalSubtopic(subjId, unitId, topicIdx) {
  const row = v10SavedRow(unitId, topicIdx);
  if (!row) return;
  const topicInput = row.querySelector('.v10-topic-fields input:first-child');
  const videoRow = row.querySelector('.v10-url-row');
  const subTopicInput = videoRow?.querySelector('.v10-subtopic-input');
  const urlInput = videoRow?.querySelector('.v10-url-input');
  const descInput = videoRow?.querySelector('.v10-video-desc-input');
  const modal = document.createElement('div');
  modal.className = 'v10-edit-modal';
  modal.innerHTML = `<div class="v10-edit-box">
    <h3>Edit Topic</h3>
    <label>Topic<input class="input" id="v10-edit-topic-name" value="${v10EscapeAttr(topicInput?.value || '')}"></label>
    <label>Sub Topic Name<input class="input" id="v10-edit-subtopic-name" value="${v10EscapeAttr(subTopicInput?.value || '')}"></label>
    <label>Video URL<input class="input" id="v10-edit-topic-url" value="${v10EscapeAttr(urlInput?.value || '')}"></label>
    <label>Description<textarea class="input" id="v10-edit-topic-desc" rows="4">${v10Html(descInput?.value || '')}</textarea></label>
    <div class="v10-edit-actions">
      <button class="btn btn-ghost" onclick="this.closest('.v10-edit-modal').remove()">Cancel</button>
      <button class="btn btn-primary" onclick="v10SaveRoadmapEditModal(${subjId},${unitId},${topicIdx})">Save Changes</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
};

window.v10SaveRoadmapEditModal = async function v10SaveRoadmapEditModalSubtopic(subjId, unitId, topicIdx) {
  const row = v10SavedRow(unitId, topicIdx);
  if (!row) return;
  const topicInput = row.querySelector('.v10-topic-fields input:first-child');
  const videoRow = row.querySelector('.v10-url-row');
  const subTopicInput = videoRow?.querySelector('.v10-subtopic-input');
  const urlInput = videoRow?.querySelector('.v10-url-input');
  const descInput = videoRow?.querySelector('.v10-video-desc-input');
  if (topicInput) topicInput.value = document.getElementById('v10-edit-topic-name')?.value.trim() || '';
  if (subTopicInput) subTopicInput.value = document.getElementById('v10-edit-subtopic-name')?.value.trim() || '';
  if (urlInput) urlInput.value = document.getElementById('v10-edit-topic-url')?.value.trim() || '';
  if (descInput) descInput.value = document.getElementById('v10-edit-topic-desc')?.value.trim() || '';
  document.querySelector('.v10-edit-modal')?.remove();
  await v10SaveRoadmap(subjId, unitId);
};

function studentUnitStateKey(subjectId = APP.currentSubject?.id, unitId = APP.currentUnit) {
  const userId = APP.user?.id || APP.user?.googleId || APP.user?.email || 'guest';
  return `edusync_student_unit_state_${userId}_${subjectId || 'subject'}_${unitId || 'unit'}`;
}

function readStudentUnitState(subjectId, unitId) {
  try {
    return JSON.parse(localStorage.getItem(studentUnitStateKey(subjectId, unitId)) || '{}');
  } catch {
    return {};
  }
}

function writeStudentUnitState(patch = {}) {
  const subjectId = APP.currentSubject?.id || APP.currentSubject?.rawId || 'subject';
  const unitId = APP.currentUnit || 'unit';
  const current = readStudentUnitState(subjectId, unitId);
  localStorage.setItem(studentUnitStateKey(subjectId, unitId), JSON.stringify({
    ...current,
    subjectId,
    unitId,
    updatedAt: new Date().toISOString(),
    ...patch,
  }));
}

function reviewStorageKey() {
  const userId = APP.user?.id || APP.user?.googleId || APP.user?.email || 'guest';
  return `edusync_marked_reviews_${userId}`;
}

function hydrateMarkedReviews() {
  try {
    const saved = JSON.parse(localStorage.getItem(reviewStorageKey()) || '[]');
    APP.markedReviews = new Set(saved);
  } catch {
    APP.markedReviews = APP.markedReviews || new Set();
  }
}

function persistMarkedReviews() {
  localStorage.setItem(reviewStorageKey(), JSON.stringify([...APP.markedReviews]));
}

async function syncTopicProgressToDb({ subjectId, unitId, topicIndex, topicId, status }) {
  const supabase = window.__AIMEASY_SUPABASE__;
  let userId = APP.user?.id || APP.user?.googleId;
  try {
    const { data } = await supabase?.auth?.getUser?.();
    userId = data?.user?.id || userId;
  } catch {}
  if (!supabase || !userId || !subjectId || !unitId || topicIndex === undefined || topicIndex === null) return;
  try {
    const { error } = await supabase
      .from('student_topic_progress')
      .upsert({
        user_id: userId,
        subject_key: String(subjectId),
        unit_key: String(unitId),
        topic_index: Number(topicIndex),
        topic_id: topicId || null,
        status,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,subject_key,unit_key,topic_index' });
    if (error) console.warn('[STUDENT] Progress DB sync failed:', error.message || error);
    else window.dispatchEvent(new CustomEvent('aiiens:student-progress-changed'));
  } catch (error) {
    console.warn('[STUDENT] Progress DB sync failed:', error?.message || error);
  }
}

function topicReviewKey(subjectId, unitId, topicIndex) {
  return `${subjectId}-${unitId}-${topicIndex}`;
}

const aimeasySwitchTabWithUnitState = switchTab;
switchTab = function switchTabPersistStudentState(tab) {
  const result = aimeasySwitchTabWithUnitState?.call(this, tab);
  if (document.getElementById('page-unit-content')?.style.display !== 'none') {
    writeStudentUnitState({ tab });
  }
  return result;
};
window.switchTab = switchTab;

function syncRoadmapNodeStates() {
  const sid = APP.currentSubject?.id || APP.currentSubject?.rawId || 'subject';
  const uid = APP.currentUnit || 1;
  const completed = readStudentJson('edusync_completed_topics', []);
  document.querySelectorAll('.video-item').forEach((node) => {
    const idx = Number(node.dataset.topicIndex || 0);
    const key = topicReviewKey(sid, uid, idx);
    node.classList.toggle('review', APP.markedReviews.has(key));
    node.classList.toggle('completed', completed.includes(key));
    node.classList.toggle('active', idx === APP.currentVideoIndex);
    const isReview = APP.markedReviews.has(key);
    const isCompleted = completed.includes(key);
    node.setAttribute('aria-current', idx === APP.currentVideoIndex ? 'step' : 'false');
    node.setAttribute('aria-label', `${node.textContent.trim()}${isCompleted ? ', completed' : ''}${isReview ? ', marked for review' : ''}`);
    const dot = node.querySelector('.video-item-dot');
    if (dot) dot.textContent = isCompleted ? '✓' : String(idx + 1);
  });
}

async function fetchApprovedTopicSuggestions(subjectId, unitId) {
  const supabase = window.__AIMEASY_SUPABASE__;
  if (!supabase || !subjectId || !unitId) return [];
  const { data, error } = await supabase
    .from('student_url_suggestions')
    .select('id, topic_name, url, description, subject_id, unit_id, topic_id, status, created_at')
    .eq('subject_id', subjectId)
    .eq('unit_id', unitId)
    .eq('status', 'approved')
    .order('created_at', { ascending: true });
  if (error) {
    console.warn('[SUGGESTIONS] Approved URL load failed:', error.message || error);
    return [];
  }
  return data || [];
}

renderVideoList = async function renderVideoListDbSubtopics(subjectId, unitNum) {
  let roadmapTopics = [];
  let roadmapContext = null;
  if (subjectId) {
    const dbSubject = APP.currentSubject;
    if (window.aimeasyFetchUnitRoadmap && dbSubject) {
      const { data, error } = await window.aimeasyFetchUnitRoadmap({
        subject: dbSubject,
        unit: { id: unitNum, name: `Unit ${unitNum}` },
      });
      if (error) {
        console.warn('[STUDENT] Roadmap Failed', error);
        showToast?.('Roadmap load failed: ' + (error.message || JSON.stringify(error)), 'red');
      } else {
        roadmapTopics = data?.topics || [];
        roadmapContext = data || null;
      }
    }
  }

  const list = document.getElementById('video-list');
  if (!list) return;
  hydrateMarkedReviews();
  const unitState = readStudentUnitState(APP.currentSubject?.id || subjectId, unitNum);
  APP.currentVideoIndex = Math.max(0, Number(unitState.videoIndex || 0));
  APP._videoItems = [];

  const approvedSuggestions = await fetchApprovedTopicSuggestions(roadmapContext?.subjectId, roadmapContext?.unitId);
  const suggestionsByTopic = approvedSuggestions.reduce((map, row) => {
    const key = String(row.topic_id || '');
    if (!key) return map;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
    return map;
  }, new Map());

  const groupedHtml = roadmapTopics.map((topic, topicIndex) => {
    const topicTitle = topic.topicName || topic.name || `Topic ${topicIndex + 1}`;
    const adminVideos = Array.isArray(topic.videos) && topic.videos.length
      ? topic.videos
      : (topic.youtubeUrls || topic.urls || []).map((url) => ({ url, description: '' }));
    const suggestedVideos = (suggestionsByTopic.get(String(topic.id || topic.dbContentId || '')) || []).map((row) => ({
      id: row.id,
      url: row.url,
      title: row.topic_name || 'Suggested URL',
      description: row.description || '',
      source: 'suggestion',
    }));
    const sourceVideos = [...adminVideos, ...suggestedVideos]
      .map((video) => ({
        id: video.id || video.dbContentId || '',
        url: (video.url || video.youtubeUrl || '').trim(),
        title: video.title || video.description || topicTitle,
        description: video.description || '',
        source: video.source || 'admin',
      }))
      .filter((video) => video.url || video.description);
    const displayVideos = sourceVideos.length ? sourceVideos : [{ url: '', title: topicTitle, description: '', source: 'admin' }];
    const baseIndex = APP._videoItems.length;
    displayVideos.forEach((video, videoIndex) => APP._videoItems.push({
      type: video.source === 'suggestion' ? 'suggested' : 'roadmap',
      id: topic.id || topic.dbContentId || '',
      topicId: topic.id || topic.dbContentId || '',
      suggestionId: video.source === 'suggestion' ? video.id : '',
      title: topicTitle,
      url: video.url,
      description: video.description || '',
      topicIndex,
      videoIndex,
    }));
    const extraButtons = displayVideos.length > 1 ? `<div class="video-item-extras">${displayVideos.map((video, videoIndex) => {
      const label = video.source === 'suggestion' ? `Suggested ${videoIndex}` : `Video ${videoIndex + 1}`;
      return `<button type="button" class="video-extra-btn" onclick="event.stopPropagation(); selectTopicUrl(${topicIndex},${videoIndex})">${v10Html(label)}</button>`;
    }).join('')}</div>` : '';
    const hasApproved = displayVideos.some((video) => video.source === 'suggestion');
    return `<button type="button" class="video-item ${topicIndex === APP.currentVideoIndex ? 'active' : ''}" data-topic-index="${topicIndex}" onclick="selectVideoItem(${baseIndex})">
      <div class="video-connector"></div>
      <div class="video-item-dot">${topicIndex + 1}</div>
      <div class="video-item-info">
        <div class="video-item-title">${v10Html(topicTitle)}${hasApproved ? ' <span class="badge badge-green">Suggested URLs</span>' : ''}</div>
        ${extraButtons}
      </div>
    </button>`;
  }).join('');

  list.innerHTML = groupedHtml;
  if (APP._videoItems.length) {
    const restoredIndex = Math.min(APP.currentVideoIndex, APP._videoItems.length - 1);
    selectVideoItem(restoredIndex);
    const restoredTab = unitState.tab || APP.currentTab;
    if (restoredTab && restoredTab !== 'videos') window.setTimeout(() => switchTab(restoredTab), 0);
  } else {
    const wrapper = document.getElementById('video-embed-wrapper') || document.querySelector('.video-embed-wrapper');
    if (wrapper) {
      wrapper.innerHTML = `<div class="video-placeholder"><div style="font-size:3.5rem;margin-bottom:4px;">Video</div><div style="opacity:0.75;font-size:0.95rem;color:#fff;">No roadmap available yet</div><div style="font-size:0.8rem;opacity:0.6;margin-top:1rem;">SubAdmin has not saved roadmap videos for this unit</div></div>`;
    }
    const descEl = document.getElementById('video-topic-desc');
    if (descEl) descEl.textContent = 'No roadmap records are saved for this subject and unit yet.';
  }
};

selectVideoItem = function selectVideoItemFlat(idx) {
  APP.currentVideoIndex = idx;
  const item = APP._videoItems?.[idx];
  if (!item) return;
  document.querySelectorAll('.video-item').forEach(el => el.classList.toggle('active', Number(el.dataset.topicIndex) === item.topicIndex));
  writeStudentUnitState({ videoIndex: idx, topicIndex: item.topicIndex, tab: APP.currentTab || 'videos' });
  syncRoadmapNodeStates();

  const displayTitle = item.title;
  const nowLabel = document.getElementById('now-playing-label');
  if (nowLabel) nowLabel.textContent = displayTitle;
  const topicTitleEl = document.getElementById('video-topic-title');
  if (topicTitleEl) topicTitleEl.textContent = displayTitle;
  const mobileTopicTitleEl = document.getElementById('video-mobile-topic-title');
  if (mobileTopicTitleEl) mobileTopicTitleEl.textContent = displayTitle;

  const sid = APP.currentSubject?.id || 'os';
  const uid = APP.currentUnit || 1;
  recordStudyActivity('video_opened', { subjectId: sid, subjectName: APP.currentSubject?.name || '', unitId: uid, topicIndex: item.topicIndex });
  const reviewKey = topicReviewKey(sid, uid, item.topicIndex);
  const rb = document.getElementById('review-btn');
  if (rb) {
    const isReview = APP.markedReviews.has(reviewKey);
    rb.classList.toggle('marked', isReview);
    rb.textContent = isReview ? 'Marked for Review' : 'Mark for Review';
  }

  const wrapper = document.getElementById('video-embed-wrapper') || document.querySelector('.video-embed-wrapper');
  const descEl = document.getElementById('video-topic-desc');
  if (!wrapper) return;
  const url = item.url || '';
  const videoId = convertYouTubeToEmbed(url);
  if (videoId) {
    renderStudentYouTubeVideo(wrapper, item, idx, videoId, displayTitle);
    if (descEl) descEl.textContent = '';
    renderTopicInlineNotes(item.title, sid, uid, item.topicIndex);
    window.renderPendingUrls?.();
    return;
  }
  if (url) {
    if (/\.(mp4|webm|ogg)(\?|#|$)/i.test(url)) {
      wrapper.innerHTML = `<video src="${v10EscapeAttr(url)}" controls autoplay playsinline style="width:100%;height:100%;border-radius:var(--radius-lg);background:#000;"></video>`;
    } else {
      wrapper.innerHTML = `<iframe src="${v10EscapeAttr(url)}" frameborder="0" allowfullscreen></iframe>`;
    }
    if (descEl) descEl.textContent = '';
    renderTopicInlineNotes(item.title, sid, uid, item.topicIndex);
    window.renderPendingUrls?.();
    return;
  }
  wrapper.innerHTML = `<div class="video-placeholder"><div style="font-size:3.5rem;margin-bottom:4px;">Video</div><div style="opacity:0.75;font-size:0.95rem;color:#fff;margin-top:6px;">${v10Html(displayTitle)}</div></div>`;
  if (descEl) descEl.textContent = 'Video coming soon.';
  renderTopicInlineNotes(item.title, sid, uid, item.topicIndex);
  window.renderPendingUrls?.();
};

selectTopicUrl = function selectTopicUrlFlat(topicIndex, urlIndex) {
  const matchIndex = (APP._videoItems || []).findIndex(item => item.topicIndex === topicIndex && item.videoIndex === urlIndex);
  if (matchIndex >= 0) selectVideoItem(matchIndex);
};

prevVideo = function prevVideoFlat() {
  if (APP.currentVideoIndex > 0) {
    selectVideoItem(APP.currentVideoIndex - 1);
    showToast('Previous video', 'blue');
  } else {
    showToast('This is the first video', 'amber');
  }
};

nextVideo = function nextVideoFlat() {
  const total = APP._videoItems?.length || 0;
  const item = APP._videoItems?.[APP.currentVideoIndex];
  const sid = APP.currentSubject?.id || 'os';
  const uid = APP.currentUnit || 1;
  const active = document.querySelector(`.video-item[data-topic-index="${item?.topicIndex ?? APP.currentVideoIndex}"]`);
  active?.classList.add('completed');
  if (item) {
    markTopicCompleted(sid, uid, item.topicIndex);
    syncTopicProgressToDb({ subjectId: sid, unitId: uid, topicIndex: item.topicIndex, topicId: item.id || item.topicId || null, status: 'completed' });
  }
  if (APP.currentVideoIndex < total - 1) {
    selectVideoItem(APP.currentVideoIndex + 1);
    document.querySelector('#screen-app.active > .main')?.scrollTo({ top: 0, behavior: 'smooth' });
    document.getElementById('page-unit-content')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    showToast('Progress saved', 'green');
  } else {
    showToast('Unit complete', 'green');
  }
};

/* Persistent PDF uploads for student-side note preview. */
const AIMEASY_CONTENT_BUCKET = 'aimeasy-content';
window.__aimeasyLocalFilePreviews = window.__aimeasyLocalFilePreviews || {};
window.__aimeasyPendingUploads = window.__aimeasyPendingUploads || {};

function aimeasySafePathPart(value) {
  return String(value || 'file').trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'file';
}

function aimeasyFileExt(file) {
  return (file?.name?.split('.').pop() || '').toLowerCase();
}

function aimeasyPreviewableNoteUrl(link) {
  return String(link || '').trim();
}

async function aimeasyUploadContentFile(file, target, unitId) {
  const supabase = window.__AIMEASY_SUPABASE__;
  if (!supabase?.storage) {
    return { url: '', error: new Error('Supabase Storage is not configured') };
  }
  const ext = aimeasyFileExt(file) || 'pdf';
  const safeName = aimeasySafePathPart(file.name || `upload.${ext}`);
  const folder = target === 'notes' ? 'notes' : target;
  const path = `${folder}/unit-${unitId}/${Date.now()}-${safeName}`;
  const upload = await supabase.storage
    .from(AIMEASY_CONTENT_BUCKET)
    .upload(path, file, {
      cacheControl: '3600',
      contentType: file.type || (ext === 'pdf' ? 'application/pdf' : 'application/octet-stream'),
      upsert: false,
    });
  if (upload.error) return { url: '', error: upload.error };
  const publicUrl = supabase.storage.from(AIMEASY_CONTENT_BUCKET).getPublicUrl(path)?.data?.publicUrl || '';
  return { url: publicUrl, path, error: null };
}

window.v10HandleUploadFile = async function v10HandleUploadFilePersistent(file, target, unitId) {
  if (!file) return;
  const ext = aimeasyFileExt(file);
  const maxBytes = 25 * 1024 * 1024;
  if (!['pdf', 'docx', 'pptx'].includes(ext)) {
    showToast('Only PDF, DOCX, and PPTX files are supported.', 'red');
    return;
  }
  if (file.size > maxBytes) {
    showToast('Maximum upload size is 25 MB.', 'red');
    return;
  }

  const inputId = target === 'notes' ? `v10-nlink-${unitId}` : `v10-${target}link-${unitId}`;
  const urlInput = document.getElementById(inputId);
  const progress = document.getElementById(`v10-${target}-progress-${unitId}`);
  const localUrl = URL.createObjectURL(file);
  window.__aimeasyLocalFilePreviews[localUrl] = { file, name: file.name, type: file.type };
  if (urlInput) urlInput.value = localUrl;
  if (progress) {
    progress.classList.add('active');
    progress.querySelector('span').style.width = '35%';
  }

  const uploadPromise = aimeasyUploadContentFile(file, target, unitId);
  window.__aimeasyPendingUploads[inputId] = uploadPromise;
  const uploaded = await uploadPromise.finally(() => {
    delete window.__aimeasyPendingUploads[inputId];
  });
  if (progress) progress.querySelector('span').style.width = uploaded.error ? '70%' : '100%';
  if (uploaded.url) {
    if (urlInput) urlInput.value = uploaded.url;
    console.log(`[${target === 'notes' ? 'NOTES' : target.toUpperCase()}] Upload Success`, {
      fileName: file.name,
      size: file.size,
      url: uploaded.url,
    });
    showToast('File uploaded. Press Save to publish it.', 'green');
    return;
  }

  console.warn('[NOTES] Storage upload failed; using session preview only', uploaded.error);
  showToast('Storage upload failed. Preview works in this session only; configure the aimeasy-content bucket migration.', 'amber');
};

const v10UploadNoteBeforePersistentFiles = v10UploadNote;
v10UploadNote = async function v10UploadNoteWaitForPersistentFile(subjectName, unitId) {
  const inputId = `v10-nlink-${unitId}`;
  const pending = window.__aimeasyPendingUploads?.[inputId];
  if (pending) {
    showToast('Finishing file upload before saving...', 'blue');
    await pending;
  }
  return v10UploadNoteBeforePersistentFiles(subjectName, unitId);
};

previewNoteInline = function previewNoteInlinePersistent(link, title) {
  const cleanLink = aimeasyPreviewableNoteUrl(link);
  if (!cleanLink) {
    showToast('No preview available for this note', 'amber');
    return;
  }
  recordStudyActivity('note_read', {
    subjectId: APP.currentSubject?.id || '',
    subjectName: APP.currentSubject?.name || '',
    unitId: APP.currentUnit || '',
    title: title || 'Note'
  });
  const modal = document.getElementById('note-preview-modal');
  const bodyEl = document.getElementById('note-preview-body');
  const titleEl = document.getElementById('note-preview-title');
  const dlBtn = document.getElementById('note-download-btn');
  if (!modal || !bodyEl) return;
  if (titleEl) titleEl.textContent = title || 'Note Preview';
  if (dlBtn) dlBtn.onclick = function () { downloadNote(cleanLink, title); };

  let embedUrl = cleanLink;
  if (cleanLink.includes('drive.google.com')) {
    const fileIdMatch = cleanLink.match(/\/d\/([a-zA-Z0-9_-]+)/);
    embedUrl = fileIdMatch
      ? `https://drive.google.com/file/d/${fileIdMatch[1]}/preview`
      : cleanLink.replace('/view', '/preview').replace('?usp=sharing', '');
  }
  const isPdf = /\.pdf($|[?#])/i.test(cleanLink) || cleanLink.includes('/storage/v1/object/public/') || cleanLink.startsWith('blob:') || cleanLink.startsWith('data:application/pdf');
  const suffix = isPdf && !cleanLink.startsWith('data:') ? '#toolbar=0&navpanes=0&scrollbar=1' : '';
  bodyEl.innerHTML = `<iframe src="${v10EscapeAttr(embedUrl + suffix)}" allow="autoplay"></iframe>`;
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
};

downloadNote = function downloadNotePersistent(link, title) {
  const cleanLink = aimeasyPreviewableNoteUrl(link);
  if (!cleanLink) {
    showToast('No download available', 'amber');
    return;
  }
  const fileIdMatch = cleanLink.match(/\/d\/([a-zA-Z0-9_-]+)/);
  const href = fileIdMatch ? `https://drive.google.com/uc?export=download&id=${fileIdMatch[1]}` : cleanLink;
  const a = document.createElement('a');
  a.href = href;
  a.download = title || window.__aimeasyLocalFilePreviews[cleanLink]?.name || 'note';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  showToast('Downloading...', 'green');
};

/* Curriculum workflow: isolated from Create Subject data. */
const CURRICULUM_STATUS = ['Draft', 'In Progress', 'Completed', 'Sent To SubAdmin', 'Published', 'Returned'];

function aimReadJson(key, fallback = []) {
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch { return fallback; }
}

function aimWriteJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function aimStatusBadge(status) {
  const value = status || 'Draft';
  const colors = {
    Draft: 'badge-amber',
    'In Progress': 'badge-primary',
    Completed: 'badge-green',
    'Sent To SubAdmin': 'badge-lavender',
    Published: 'badge-green',
    Returned: 'badge-amber',
  };
  return `<span class="badge ${colors[value] || 'badge-primary'}">${v10Html(value)}</span>`;
}

function aimLocalCurriculums() {
  return aimReadJson('aimeasy_curriculums', []);
}

function aimSaveLocalCurriculum(curriculum) {
  const rows = aimLocalCurriculums();
  const index = rows.findIndex(item => String(item.id) === String(curriculum.id));
  if (index >= 0) rows[index] = curriculum;
  else rows.unshift(curriculum);
  aimWriteJson('aimeasy_curriculums', rows);
}

async function aimLoadCurriculums() {
  const remote = await window.aimeasyListCurriculums?.();
  if (!remote?.error && Array.isArray(remote?.data)) {
    const mapped = remote.data.map(row => ({
      id: row.id,
      subjectName: row.subject_name,
      subjectCode: row.subject_code,
      branch: row.branch,
      regulationCode: row.regulation_code,
      semester: row.semester,
      universityName: row.university_name,
      status: row.status || 'Draft',
      units: (row.curriculum_units || []).sort((a, b) => Number(a.display_order || 0) - Number(b.display_order || 0)).map(unit => ({
        id: unit.id,
        unitName: unit.unit_name,
        status: unit.status || row.status || 'Draft',
        topics: (unit.curriculum_topics || []).sort((a, b) => Number(a.display_order || 0) - Number(b.display_order || 0)).map(topic => ({
          id: topic.id,
          topicName: topic.topic_name,
        })),
      })),
    }));
    aimWriteJson('aimeasy_curriculums', mapped);
    return mapped;
  }
  return aimLocalCurriculums();
}

function aimCurriculumForm(unitIndex = 0) {
  return `<div class="card" style="margin-bottom:1rem;">
    <h3 style="font-size:1rem;margin-bottom:1rem;">Create Curriculum</h3>
    <div class="v10-2col">
      <div class="input-group"><label>Subject</label><input class="input" id="aim-cur-subject" placeholder="Subject name"></div>
      <div class="input-group"><label>Subject Code</label><input class="input" id="aim-cur-code" placeholder="Optional"></div>
    </div>
    <div class="v10-2col">
      <div class="input-group"><label>Unit</label><input class="input" id="aim-cur-unit" placeholder="Unit name"></div>
      <div class="input-group"><label>Topic Name</label><input class="input" id="aim-cur-topic" placeholder="Topic name"></div>
    </div>
    <button class="btn btn-primary" onclick="aimCreateCurriculumBlueprint()">Save Curriculum</button>
  </div>`;
}

window.aimCreateCurriculumBlueprint = async function aimCreateCurriculumBlueprint() {
  const subjectName = document.getElementById('aim-cur-subject')?.value.trim();
  const subjectCode = document.getElementById('aim-cur-code')?.value.trim();
  const unitName = document.getElementById('aim-cur-unit')?.value.trim();
  const topicName = document.getElementById('aim-cur-topic')?.value.trim();
  if (!subjectName || !unitName || !topicName) {
    showToast('Enter subject, unit, and topic name.', 'red');
    return;
  }
  const payload = { subjectName, subjectCode, units: [{ unitName, topics: [{ topicName }] }] };
  const saved = await window.aimeasyCreateCurriculumBlueprint?.(payload);
  if (saved?.error) console.warn('[CURRICULUM] DB save failed; using local fallback', saved.error);
  const local = {
    id: saved?.data?.curriculum?.id || `local-${Date.now()}`,
    subjectName,
    subjectCode,
    status: 'Draft',
    units: [{
      id: saved?.data?.units?.[0]?.id || `local-unit-${Date.now()}`,
      unitName,
      status: 'Draft',
      topics: [{ id: saved?.data?.topics?.[0]?.id || `local-topic-${Date.now()}`, topicName }],
    }],
  };
  aimSaveLocalCurriculum(local);
  showToast('Curriculum saved as Draft.', 'green');
  renderSubAdminCurriculum();
};

window.renderSubAdminCurriculum = async function renderSubAdminCurriculum() {
  const content = document.getElementById('sa-content');
  if (!content) return;
  const curriculums = await aimLoadCurriculums();
  content.innerHTML = `<div style="padding:2rem;max-width:1100px;margin:0 auto;width:100%;">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:1rem;">
      <div><h2 style="font-size:1.35rem;font-weight:800;">Curriculum</h2>
      <p style="font-size:.82rem;color:var(--text3);">Blueprint-only curriculum. Create Subject content stays separate.</p></div>
    </div>
    ${aimCurriculumForm()}
    <div class="v10-items">
      <div class="v10-items-head">Curriculum Blueprints (${curriculums.length})</div>
      ${curriculums.map(cur => `<div class="v10-item">
        <div class="v10-item-body">
          <div class="v10-item-title">${v10Html(cur.subjectName)} ${aimStatusBadge(cur.status)}</div>
          <div class="v10-item-meta">${v10Html(cur.subjectCode || '')} · ${(cur.units || []).length} unit(s)</div>
          <div class="roadmap-video-tree">${(cur.units || []).map(unit => `<div class="roadmap-video-child">${v10Html(unit.unitName)} ${aimStatusBadge(unit.status)}: ${(unit.topics || []).map(t => v10Html(t.topicName)).join(', ')}</div>`).join('')}</div>
        </div>
        ${cur.status === 'Sent To SubAdmin' ? `<button class="btn btn-primary btn-sm" onclick="aimReviewCurriculum('${cur.id}','Published')">Approve</button><button class="btn btn-ghost btn-sm" onclick="aimReviewCurriculum('${cur.id}','Returned')">Reject</button>` : ''}
      </div>`).join('') || '<p style="padding:1rem;color:var(--text3);">No curriculum blueprints yet.</p>'}
    </div>
  </div>`;
};

window.aimReviewCurriculum = async function aimReviewCurriculum(id, status) {
  const rows = aimLocalCurriculums();
  const cur = rows.find(item => String(item.id) === String(id));
  if (cur) {
    cur.status = status;
    (cur.units || []).forEach(unit => { unit.status = status; });
    aimWriteJson('aimeasy_curriculums', rows);
  }
  await window.aimeasyUpdateCurriculumStatus?.({ curriculumId: id, status });
  showToast(`Curriculum ${status}.`, status === 'Published' ? 'green' : 'amber');
  renderSubAdminCurriculum();
};

const aimOriginalSwitchSASection = window.switchSASection || switchSASection;
window.switchSASection = switchSASection = function switchSASectionCurriculum(section) {
  if (section === 'curriculum') {
    closeSASidebar?.();
    document.querySelectorAll('[id^="sa-nav-"]').forEach(el => el.classList.remove('active'));
    document.getElementById('sa-nav-curriculum')?.classList.add('active');
    const titleEl = document.getElementById('sa-topbar-title');
    if (titleEl) titleEl.textContent = 'Curriculum';
    renderSubAdminCurriculum();
    return;
  }
  return aimOriginalSwitchSASection?.(section);
};

async function aimCreatorDashboardCounts() {
  const remote = await window.aimeasyFetchWorkflowDashboardCounts?.();
  if (!remote?.error && remote?.data) return remote.data;
  const curriculums = aimLocalCurriculums();
  const units = curriculums.flatMap(cur => cur.units || []);
  return {
    assignedUnits: units.length,
    completedUnits: units.filter(unit => ['Completed', 'Sent To SubAdmin', 'Published'].includes(unit.status)).length,
    pendingUnits: units.filter(unit => ['Draft', 'In Progress', 'Returned'].includes(unit.status || 'Draft')).length,
  };
}
window.v10PersistSubjectDbIds = v10PersistSubjectDbIds;

window.renderCRDashboard = async function renderCRDashboardWorkflow() {
  const content = document.getElementById('cr-content');
  if (!content) return;
  const counts = await aimCreatorDashboardCounts();
  content.innerHTML = `<div style="padding:2rem;max-width:1100px;margin:0 auto;width:100%;">
    <h2 style="font-size:1.35rem;font-weight:800;margin-bottom:.4rem;">Creator Dashboard</h2>
    <p style="font-size:.84rem;color:var(--text2);margin-bottom:1.4rem;">Live curriculum workflow metrics.</p>
    <div class="admin-grid">
      ${[['Assigned Units', counts.assignedUnits, 'var(--primary)'], ['Completed Units', counts.completedUnits, 'var(--green)'], ['Pending Units', counts.pendingUnits, 'var(--amber)']].map(([label, value, color]) => `
      <div class="admin-stat-card"><div class="admin-stat-accent" style="background:${color};"></div><div style="font-size:2.1rem;font-weight:800;color:${color};">${value}</div><div style="font-size:.84rem;font-weight:600;">${label}</div></div>`).join('')}
    </div>
    <div class="card" style="margin-top:1rem;"><button class="btn btn-primary" onclick="switchCRSection('addcontent')">Open Assigned Curriculum</button></div>
  </div>`;
};

function regulationManagerPanel() {
  return `<div class="card manage-panel regulation-panel card-soft-mint" id="aimeasy-regulation-manager">
    <div class="manage-panel-head">
      <div><h3>Regulation Management</h3><span>Academic regulation options</span></div>
    </div>
    <p class="manage-helper">Created regulations are shown to Sub Admin, Creator, and Student filters.</p>
    <div class="regulation-create-row">
      <input class="input" id="aimeasy-reg-name" placeholder="e.g. R24">
      <button class="btn btn-primary btn-sm" id="aimeasy-reg-submit" onclick="aimeasyAddRegulation()">Create</button>
    </div>
    <div id="aimeasy-regulation-list" class="v10-items manage-list regulation-list"></div>
  </div>`;
}

window.renderCRAddContent = async function renderCRAddContentWorkflow() {
  const content = document.getElementById('cr-content');
  if (!content) return;
  const curriculums = await aimLoadCurriculums();
  const selectedId = window._crSelectedCurriculumId || curriculums[0]?.id;
  const cur = curriculums.find(item => String(item.id) === String(selectedId));
  window._crSelectedCurriculumId = selectedId;
  if (!cur) {
    content.innerHTML = `<div style="padding:2rem;color:var(--text3);">No curriculum assigned yet.</div>`;
    return;
  }
  const selectedUnitId = window._crSelectedUnit || cur.units?.[0]?.id;
  const unit = (cur.units || []).find(item => String(item.id) === String(selectedUnitId)) || cur.units?.[0];
  window._crSelectedUnit = unit?.id;
  const rows = aimReadJson('aimeasy_curriculum_content', []).filter(item => String(item.curriculumId) === String(cur.id) && String(item.unitId) === String(unit?.id));
  const hasRequired = ['video', 'note', 'pyq', 'iq'].every(type => rows.some(item => item.contentType === type));
  content.innerHTML = `<div style="padding:2rem;max-width:1100px;margin:0 auto;width:100%;">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:1rem;">
      <div><h2 style="font-size:1.3rem;font-weight:800;">${v10Html(cur.subjectName)}</h2>
      <p style="font-size:.82rem;color:var(--text2);">Creator content workspace · ${aimStatusBadge(unit?.status || cur.status)}</p></div>
      <button class="btn btn-primary btn-sm" ${hasRequired ? '' : 'disabled'} onclick="aimSendCurriculumForReview('${cur.id}','${unit?.id || ''}')">Send For Review</button>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:1rem;">${curriculums.map(item => `<button class="btn ${String(item.id) === String(cur.id) ? 'btn-primary' : 'btn-ghost'} btn-sm" onclick="window._crSelectedCurriculumId='${item.id}';window._crSelectedUnit=null;renderCRAddContent()">${v10Html(item.subjectName)}</button>`).join('')}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:1rem;">${(cur.units || []).map(item => `<button class="btn ${String(item.id) === String(unit?.id) ? 'btn-teal' : 'btn-ghost'} btn-sm" onclick="window._crSelectedUnit='${item.id}';renderCRAddContent()">${v10Html(item.unitName)} ${aimStatusBadge(item.status)}</button>`).join('')}</div>
    <div class="card" style="margin-bottom:1rem;"><div style="font-weight:700;margin-bottom:8px;">Topics</div>${(unit?.topics || []).map(topic => `<span class="tag">${v10Html(topic.topicName)}</span>`).join(' ')}</div>
    <div class="card">
      <div class="v10-2col">
        <input class="input" id="aim-cc-title" placeholder="Title">
        <select class="select" id="aim-cc-type"><option value="video">Video</option><option value="note">Note</option><option value="pyq">PYQ</option><option value="iq">Important Question</option><option value="other">Other</option></select>
      </div>
      <input class="input" id="aim-cc-url" placeholder="URL" style="margin-top:8px;">
      <textarea class="input" id="aim-cc-desc" rows="3" placeholder="Description / Question" style="margin-top:8px;resize:vertical;"></textarea>
      <button class="btn btn-teal" style="margin-top:8px;" onclick="aimSaveCreatorCurriculumContent('${cur.id}','${unit?.id || ''}')">Save Content</button>
    </div>
    <div class="v10-items" style="margin-top:1rem;"><div class="v10-items-head">Saved Content (${rows.length})</div>
      ${rows.map(item => `<div class="v10-item"><div class="v10-item-body"><div class="v10-item-title">${v10Html(item.title)} ${aimStatusBadge(item.contentType)}</div><div class="v10-item-meta">${v10Html(item.url || item.description || '')}</div></div></div>`).join('') || '<p style="padding:1rem;color:var(--text3);">Add one Video, Note, PYQ, and Important Question to enable Send For Review.</p>'}
    </div>
  </div>`;
};

window.aimSaveCreatorCurriculumContent = async function aimSaveCreatorCurriculumContent(curriculumId, unitId) {
  const title = document.getElementById('aim-cc-title')?.value.trim();
  const contentType = document.getElementById('aim-cc-type')?.value;
  const url = document.getElementById('aim-cc-url')?.value.trim();
  const description = document.getElementById('aim-cc-desc')?.value.trim();
  if (!title && !description && !url) {
    showToast('Enter content details.', 'red');
    return;
  }
  const item = { id: `local-content-${Date.now()}`, curriculumId, unitId, contentType, title: title || contentType, url, description, createdAt: new Date().toISOString() };
  const rows = aimReadJson('aimeasy_curriculum_content', []);
  rows.unshift(item);
  aimWriteJson('aimeasy_curriculum_content', rows);
  await window.aimeasySaveCurriculumContent?.({ curriculumId, unitId, contentType, title: item.title, url, description, body: description });
  const curriculums = aimLocalCurriculums();
  const cur = curriculums.find(row => String(row.id) === String(curriculumId));
  const unit = cur?.units?.find(row => String(row.id) === String(unitId));
  if (unit && unit.status === 'Draft') unit.status = 'In Progress';
  if (cur && cur.status === 'Draft') cur.status = 'In Progress';
  aimWriteJson('aimeasy_curriculums', curriculums);
  showToast('Content saved. You stayed on this unit.', 'green');
  renderCRAddContent();
};

window.aimSendCurriculumForReview = async function aimSendCurriculumForReview(curriculumId, unitId) {
  const curriculums = aimLocalCurriculums();
  const cur = curriculums.find(row => String(row.id) === String(curriculumId));
  const unit = cur?.units?.find(row => String(row.id) === String(unitId));
  if (unit) unit.status = 'Sent To SubAdmin';
  if (cur) cur.status = 'Sent To SubAdmin';
  aimWriteJson('aimeasy_curriculums', curriculums);
  await window.aimeasyUpdateCurriculumStatus?.({ curriculumId, unitId, status: 'Sent To SubAdmin' });
  showToast('Sent to SubAdmin for review.', 'green');
  renderCRAddContent();
};

/* Production admin/student experience patch. Keep this late so it wins over legacy overrides. */
(function installAiiensProductionExperiencePatch() {
  if (window.__aiiensProductionExperiencePatchInstalled) return;
  window.__aiiensProductionExperiencePatchInstalled = true;

  const read = (key, fallback = []) => {
    if (key === 'edusync_subadmins' && Array.isArray(window.__aiiensSubAdminCache)) {
      return window.__aiiensSubAdminCache;
    }
    try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch { return fallback; }
  };
  const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const js = (value) => String(value ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const activeScreen = () => document.querySelector('.screen.active')?.id || '';
  const isValidUrl = (value) => {
    try {
      const parsed = new URL(String(value || ''));
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  };
  const externalIcon = '<span class="external-link-icon" aria-hidden="true">↗</span>';
  const actionIcon = {
    edit: '<span aria-hidden="true">✎</span>',
    delete: '<span aria-hidden="true">×</span>'
  };
  const currentStudentKey = () => {
    const user = APP.user || read('edusync_session_user', {});
    return String(user.id || user.googleId || user.email || user.phone || user.name || 'anonymous').replace(/[^a-z0-9_.@-]+/gi, '_');
  };
  const studentRecentKey = () => `edusync_recently_opened:${currentStudentKey()}`;
  const allSubjectUnits = (subject) => read('edusync_units_' + (subject.rawId || String(subject.id || '').replace('custom_', '')), []);
  const sameText = (a, b) => !a || !b || String(a).toLowerCase() === String(b).toLowerCase();
  const routePush = (path) => {
    const hash = `#${path}`;
    if (window.location.hash !== hash) {
      const nextIndex = (window.history.state?.aimeasyIndex ?? 0) + 1;
      window.__aimeasyRouterWritingHistory = true;
      try {
        window.history.pushState({ aimeasyPath: path, aimeasyIndex: nextIndex }, '', hash);
      } finally {
        window.__aimeasyRouterWritingHistory = false;
      }
    }
  };

  const ADMIN_ROUTE_TO_SECTION = { manage: 'create', management: 'create', 'create-management': 'create', 'create-manage': 'create', 'url-approvals': 'approvals', urls: 'approvals' };
  const ADMIN_SECTION_TO_ROUTE = { create: 'create-manage', dashboard: 'dashboard', subjects: 'subjects', approvals: 'url-approvals', creatorview: 'creatorview', skillup: 'skillup', notifications: 'notifications' };
  const SA_ROUTE_TO_SECTION = { 'create-subject': 'subjects', content: 'view', 'manage-content': 'view', approvals: 'urls', 'url-approvals': 'urls' };
  const SA_SECTION_TO_ROUTE = { dashboard: 'dashboard', subjects: 'create-subject', view: 'manage-content', curriculum: 'curriculum', skillup: 'skillup', urls: 'url-approvals' };
  const normalizeAdminSection = (section) => ADMIN_ROUTE_TO_SECTION[section] || section || 'dashboard';
  const normalizeSASection = (section) => SA_ROUTE_TO_SECTION[section] || section || 'dashboard';
  const adminRouteFor = (section) => ADMIN_SECTION_TO_ROUTE[section] || section || 'dashboard';
  const saRouteFor = (section) => SA_SECTION_TO_ROUTE[section] || section || 'dashboard';
  const sectionFromHash = (portal) => {
    const parts = String(window.location.hash || '').replace(/^#/, '').split('/').filter(Boolean);
    if (parts[0] !== portal || !parts[1]) return '';
    if (portal === 'admin') return normalizeAdminSection(parts[1]);
    if (portal === 'subadmin') {
      if (['units', 'topics'].includes(parts[1])) return 'subjects';
      return normalizeSASection(parts[1]);
    }
    return '';
  };

  window.aiiensNormalizeAdminRoute = function aiiensNormalizeAdminRoute(path) {
    const parts = String(path || '').split('/').filter(Boolean);
    if (parts[0] === 'admin' && parts[1]) return '/admin/' + adminRouteFor(normalizeAdminSection(parts[1]));
    if (parts[0] === 'subadmin' && ['units', 'topics'].includes(parts[1])) return '/' + parts.join('/');
    if (parts[0] === 'subadmin' && parts[1]) return '/subadmin/' + saRouteFor(normalizeSASection(parts[1]));
    return path;
  };

  function refreshActiveAdminSurfaces() {
    if (window.aiiensIsAdminEditing && window.aiiensIsAdminEditing()) {
      console.log('[Aiiens Admin] Skipping refreshActiveAdminSurfaces because Admin is editing.');
      return;
    }
    const screen = activeScreen();
    if (screen === 'screen-subadmin') {
      if (window._v10SAUnitId && window._v10SASubj && typeof v10SAUnitDetail === 'function') {
        v10SAUnitDetail(window._v10SASubj.id, window._v10SAUnitId);
        return;
      }
      if (window._v10SASubj && typeof v10SAUnitsPage === 'function') {
        v10SAUnitsPage(window._v10SASubj);
        return;
      }
      const section = document.querySelector('#screen-subadmin .admin-nav-item.active')?.id?.replace('sa-nav-', '') || sectionFromHash('subadmin');
      if (!section) return;
      if (section === 'dashboard') renderSubAdminDashboardProduction();
      if (section === 'subjects' && typeof v10SASubjects === 'function') v10SASubjects();
      if (section === 'view' && typeof renderSASection === 'function') renderSASection('view');
    }
    if (screen === 'screen-admin') {
      const section = document.querySelector('#screen-admin .admin-nav-item.active')?.id?.replace('admin-nav-', '') || sectionFromHash('admin');
      if (!section) return;
      if (section === 'dashboard') renderAdminDashboardProduction();
      if (section === 'create') renderAdminCreateManageProduction();
      if (section === 'subjects' && typeof v10AdminSubjects === 'function') v10AdminSubjects();
      if (section === 'approvals') renderApprovalLinksProduction('admin');
    }
    if (screen === 'screen-app') updateStudentDashboardMetrics?.();
  }
  window.aiiensRefreshActiveAdminSurfaces = refreshActiveAdminSurfaces;
  window.refreshActiveAdminSurfaces = refreshActiveAdminSurfaces;

  addToRecentlyOpened = function addToRecentlyOpenedPerStudent(name, code, icon, id) {
    const subjects = getStudentAssignedSubjects?.() || [];
    const user = APP.user || {};
    const allowed = subjects.find(subject =>
      (String(subject.id) === String(id) || String(subject.rawId) === String(id) || subject.name === name) &&
      sameText(subject.branch, user.branch || user.branch_name) &&
      sameText(subject.reg || subject.regulation, user.regulation || user.regulation_code || user.reg) &&
      sameText(subject.sem || subject.semester, user.semester || user.sem)
    );
    if (!allowed) return;
    let list = read(studentRecentKey(), []);
    list = list.filter(item => item.id !== allowed.id && item.name !== allowed.name);
    list.unshift({
      id: allowed.id,
      name: allowed.name,
      code: allowed.code || code || 'Subject',
      icon: allowed.icon || icon || 'Book',
      openedAt: new Date().toISOString(),
      branch: allowed.branch || APP.user?.branch || '',
      reg: allowed.reg || APP.user?.regulation || '',
      sem: allowed.sem || APP.user?.semester || ''
    });
    write(studentRecentKey(), list.slice(0, 5));
  };

  function regulationManagerPanel() {
      return `\u003cdiv class=\"card manage-panel regulation-panel card-soft-mint\" id=\"aimeasy-regulation-manager\"\u003e
        \u003cdiv class=\"manage-panel-head\"\u003e
          \u003cdiv\u003e\u003ch3\u003eRegulation Management\u003c/h3\u003e\u003cspan\u003eAcademic regulation options\u003c/span\u003e\u003c/div\u003e
        \u003c/div\u003e
        \u003cp class=\"manage-helper\"\u003eCreated regulations are shown to Sub Admin, Creator, and Student filters.\u003c/p\u003e
        \u003cdiv class=\"regulation-create-row\"\u003e
          \u003cinput class=\"input\" id=\"aimeasy-reg-name\" placeholder=\"e.g. R24\"\u003e
          \u003cbutton class=\"btn btn-primary btn-sm\" id=\"aimeasy-reg-submit\" onclick=\"aimeasyAddRegulation()\"\u003eCreate\u003c/button\u003e
        \u003c/div\u003e
        \u003cdiv id=\"aimeasy-regulation-list\" class=\"v10-items manage-list regulation-list\"\u003e\u003c/div\u003e
      \u003c/div\>`;
    }

  const previousUpdateStudentDashboardMetrics = updateStudentDashboardMetrics;
  updateStudentDashboardMetrics = function updateStudentDashboardMetricsProduction() {
    previousUpdateStudentDashboardMetrics?.();
    const card = document.querySelector('#page-dashboard .streak-card');
    if (card) {
      const current = localStorage.getItem('edusync_streak') || '0';
      const best = localStorage.getItem('edusync_best_streak') || '0';
      const last = localStorage.getItem('edusync_last_active_date') || 'Never';
      card.innerHTML = `
        <div class="compact-streak-card">
          <div>
            <div class="compact-kicker">Current Streak</div>
            <div class="compact-streak-value">${esc(current)} days</div>
          </div>
          <div class="compact-streak-meta">
            <span>Best: <strong>${esc(best)}</strong></span>
            <span>Last active: <strong>${esc(last)}</strong></span>
          </div>
          <div class="streak-week">${weeklyStreakDots(current)}</div>
        </div>`;
    }
    const subjectsForStudent = getStudentAssignedSubjects?.() || [];
    const weekly = typeof weeklyDashboardStats === 'function'
      ? weeklyDashboardStats(subjectsForStudent)
      : { weeklyCompletion: 0, unitsCompleted: 0, subjectsActive: 0 };
    const weeklyEvents = read('edusync_study_activity', []).filter(event => {
      const at = new Date(event.at || event.openedAt || 0);
      return Number.isFinite(at.getTime()) && Date.now() - at.getTime() <= 7 * 24 * 60 * 60 * 1000;
    });
    const progressTracker = document.querySelector('#page-dashboard .progress-tracker');
    if (progressTracker) {
      progressTracker.innerHTML = `
        <div class="section-heading">Weekly Progress</div>
        <div class="weekly-summary compact-weekly-summary">
          <div><strong>${esc(weekly.weeklyCompletion)}%</strong><span>Weekly Completion</span></div>
          <div><strong>${esc(weekly.unitsCompleted)}</strong><span>Units Completed</span></div>
          <div><strong>${esc(weekly.subjectsActive)}</strong><span>Active Subjects</span></div>
          <div><strong>${esc(weeklyEvents.length)}</strong><span>Learning Sessions</span></div>
        </div>
        <div class="weekly-mini-progress"><span style="width:${Math.max(4, Math.min(100, Number(weekly.weeklyCompletion) || 0))}%"></span></div>
      `;
    }
    const recentListEl = document.getElementById('recently-opened-list');
    if (recentListEl) {
      const user = APP.user || {};
      const allowed = subjectsForStudent.filter(subject =>
        sameText(subject.branch, user.branch || user.branch_name) &&
        sameText(subject.reg || subject.regulation, user.regulation || user.reg) &&
        sameText(subject.sem || subject.semester, user.semester || user.sem)
      );
      const allowedIds = new Set(allowed.flatMap(subject => [String(subject.id), String(subject.rawId || '')]));
      const allowedNames = new Set(allowed.map(subject => subject.name));
      const list = read(studentRecentKey(), []).filter(item =>
        (allowedIds.has(String(item.id)) || allowedNames.has(item.name)) &&
        sameText(item.branch, user.branch || user.branch_name) &&
        sameText(item.reg || item.regulation, user.regulation || user.reg) &&
        sameText(item.sem || item.semester, user.semester || user.sem)
      ).slice(0, 5);
      recentListEl.innerHTML = list.length
        ? list.map(item => `
          <div class="recent-item">
            <div class="recent-info">
              <div class="recent-title">${esc(item.name)}</div>
              <div class="recent-sub">${esc(formatRecentTime(item.openedAt))}</div>
            </div>
            <button class="btn btn-primary btn-sm" onclick="openSubjectFromRecent('${js(item.id)}')">Continue</button>
          </div>`).join('')
        : '<div class="empty-state-card">No subjects opened yet.</div>';
    }
    const achievementsEl = document.getElementById('achievements-list');
    if (achievementsEl && typeof achievementList === 'function') {
      achievementsEl.innerHTML = achievementList(subjectsForStudent).map(item => `
        <div class="achievement-card ${item.earned ? 'earned' : 'locked'}">
          <div class="achievement-icon">${item.earned ? item.icon : 'Lock'}</div>
          <div>${esc(item.label)}</div>
          <div class="achievement-progress"><span style="width:${item.earned ? 100 : 35}%"></span></div>
        </div>
      `).join('');
    }
  };

  function subjectScope() {
    const sa = APP.subAdminData || {};
    return read('edusync_custom_subjects', []).filter(subject =>
      (!sa.branch || subject.branch === sa.branch) &&
      (!sa.regulation && !sa.reg || !sa.regulation || subject.reg === sa.regulation)
    );
  }

  function productionCards(items) {
    return items.map(([label, value, color, sub, trend = '']) => `
      <div class="admin-stat-card production-kpi">
        <div class="admin-stat-accent" style="background:${color};"></div>
        <div class="kpi-head">
          <span>${esc(label)}</span>
          ${trend ? `<em style="color:${color};">${esc(trend)}</em>` : ''}
        </div>
        <div class="kpi-value" style="color:${color};">${esc(value)}</div>
        <div class="kpi-sub">${esc(sub || '')}</div>
      </div>`).join('');
  }

  function cachedRegulations() {
    const fromCache = read('aimeasy_cached_regulations', []);
    const fromLegacy = read('edusync_regulations', []);
    const fromSubjects = read('edusync_custom_subjects', []).map(subject => subject.reg || subject.regulation);
    return [...new Set([...fromCache, ...fromLegacy, ...fromSubjects]
      .map(item => String(item?.regulation_name || item?.regulation_code || item?.name || item || '').trim().toUpperCase())
      .filter(Boolean))];
  }

  const defaultUniversities = [];
  const defaultUniversityKeys = new Set();

  function managedUniversities() {
    const catalogRows = window.__aiiensCatalogUniversities || [];
    if (catalogRows.length) {
      return catalogRows.map((row) => ({
        name: String(row?.name || '').trim(),
        code: String(row?.code || row?.name || '').trim(),
        state: String(row?.state || '').trim(),
        status: String(row?.status || 'active').trim() || 'active',
        id: row?.id,
        updatedAt: row?.updated_at || row?.updatedAt,
      })).filter((row) => row.name && String(row.status).toLowerCase() !== 'inactive' && String(row.status).toLowerCase() !== 'deleted');
    }
    const seen = new Set();
    return [...defaultUniversities]
      .map((row) => ({
        name: String(row?.name || row?.university_name || row?.university || row?.code || row || '').trim(),
        code: String(row?.code || row?.university_code || row?.name || row || '').trim(),
        state: String(row?.state || '').trim(),
        status: String(row?.status || 'Active').trim() || 'Active',
        id: row?.id,
        updatedAt: row?.updatedAt,
      }))
      .filter((row) => {
        const status = row.status.toLowerCase();
        const key = row.name.toLowerCase();
        return row.name && status !== 'inactive' && status !== 'deleted';
      })
      .filter((row) => {
        const key = row.name.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  function saveManagedUniversities(rows) {
    console.warn('[universities] localStorage save ignored — Supabase is the catalog source of truth');
    window.aiiensRefreshAllCatalogDropdowns?.(document);
  }

  function managedUniversitiesFrom(rows) {
    const seen = new Set();
    return (rows || [])
      .map((row) => ({
        name: String(row?.name || row?.university_name || row?.university || row?.code || row || '').trim(),
        code: String(row?.code || row?.university_code || row?.name || row || '').trim(),
        state: String(row?.state || '').trim(),
        status: String(row?.status || 'Active').trim() || 'Active',
        id: row?.id,
        updatedAt: row?.updatedAt,
      }))
      .filter((row) => row.name)
      .filter((row) => {
        const key = row.name.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  function featureSlug(value) {
    return String(value || '').trim().toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  function featureRows() {
    const defaults = ['Videos', 'Notes', 'PYQs', 'Important Questions'];
    const stored = read('edusync_features', []);
    const disabled = new Set(read('edusync_disabled_features', []).map(featureSlug));
    const seen = new Set();
    return [...defaults, ...(Array.isArray(stored) ? stored : [])]
      .map(item => String(item || '').trim())
      .filter(Boolean)
      .filter(item => {
        const key = featureSlug(item);
        if (!key || seen.has(key) || disabled.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  function saveFeatureRows(rows) {
    const defaults = new Set(['videos', 'notes', 'pyqs', 'important-questions']);
    const custom = rows.filter(item => !defaults.has(featureSlug(item)));
    write('edusync_features', custom);
    window.dispatchEvent(new CustomEvent('edusync:data-sync', { detail: { key: 'edusync_features' } }));
  }

  function renderFeatureList() {
    const list = document.getElementById('admin-feature-list');
    if (!list) return;
    const rows = featureRows();
    list.innerHTML = rows.map((feature, index) => {
      const isCore = ['videos', 'notes', 'pyqs', 'important-questions'].includes(featureSlug(feature));
      return `<div class="v10-item management-record feature-row">
        <div class="record-icon">${esc(feature.charAt(0).toUpperCase())}</div>
        <div class="v10-item-body">
          <div class="v10-item-title">${esc(feature)}</div>
          <div class="v10-item-meta">${isCore ? 'Core learning module' : 'Custom module'}</div>
        </div>
        <span class="badge badge-green">${isCore ? 'Core' : 'Live'}</span>
        <button class="icon-action-btn" onclick="adminEditFeature(${index})" title="Edit feature" aria-label="Edit ${esc(feature)}">${actionIcon.edit}</button>
        <button class="icon-action-btn danger" onclick="adminDeleteFeature(${index})"${isCore ? ' title="Core features stay available for existing content"' : ' title="Delete feature"'} aria-label="Delete ${esc(feature)}">${actionIcon.delete}</button>
      </div>`;
    }).join('');
  }

  function featureManagerPanel() {
    return `<div class="card manage-panel card-soft-lavender">
      <div class="manage-panel-head">
        <div><h3>Feature Management</h3><span>${esc(featureRows().length)} live modules</span></div>
      </div>
      <div class="regulation-create-row">
        <input class="input" id="adm-feature-name" placeholder="New feature name">
        <button class="btn btn-primary btn-sm" id="adm-feature-submit" onclick="adminAddFeature()">Create</button>
      </div>
      <div id="admin-feature-list" class="v10-items manage-list"></div>
    </div>`;
  }

  function regulationManagerPanel(regulations = cachedRegulations()) {
    return `<div class="card manage-panel regulation-panel card-soft-mint glass-panel" id="aimeasy-regulation-manager">
      <div class="manage-panel-head">
        <div><h3>Regulation Management</h3><span>Academic regulation options</span></div>
      </div>
      <p class="manage-helper">Created regulations are shown to Sub Admin, Creator, and Student filters.</p>
      <div class="regulation-create-row">
        <input class="input" id="aimeasy-reg-name" placeholder="e.g. R24">
        <button class="btn btn-primary btn-sm" id="aimeasy-reg-submit" onclick="aimeasyAddRegulation()">Create</button>
      </div>
      <div id="aimeasy-regulation-list" class="v10-items manage-list regulation-list">
        ${regulations.length ? regulations.map((reg, index) => `
          <div class="v10-item regulation-row">
            <div class="v10-item-body"><div class="v10-item-title">${esc(reg)}</div></div>
            <span class="badge badge-green">Live</span>
            <button class="icon-action-btn" onclick="aimeasyEditRegulation(${index})" title="Edit regulation" aria-label="Edit ${esc(reg)} regulation">${actionIcon.edit}</button>
            <button class="icon-action-btn danger" onclick="aimeasyDeleteRegulation(${index})" title="Delete regulation" aria-label="Delete ${esc(reg)} regulation">${actionIcon.delete}</button>
          </div>`).join('') : '<div class="empty-state-card">No regulations created yet.</div>'}
      </div>
    </div>`;
  }

  function branchManagerPanel() {
    return `<div class="card manage-panel regulation-panel card-soft-mint" id="aimeasy-branch-manager">
      <div class="manage-panel-head">
        <div><h3>Branch Management</h3><span>Academic branch options</span></div>
      </div>
      <p class="manage-helper">Created branches are shown in Admin, SubAdmin, and Student branch filters.</p>
      <div class="regulation-create-row">
        <input class="input" id="aimeasy-branch-name" placeholder="e.g. CSE">
        <button class="btn btn-primary btn-sm" id="aimeasy-branch-submit" onclick="aimeasyAddBranch()">Create</button>
      </div>
      <div id="aimeasy-branch-list" class="v10-items manage-list regulation-list"></div>
    </div>`;
  }

  function universityPanel(universities = managedUniversities()) {
    return `<div class="card manage-panel card-soft-amber">
      <div class="manage-panel-head"><div><h3>University Management</h3><span>${esc(universities.length)} configured</span></div></div>
      <div class="v10-2col">
        <input class="input" id="uni-name" placeholder="University Name">
        <input class="input" id="uni-code" placeholder="Code">
      </div>
      <div class="v10-2col" style="margin-top:8px;">
        <input class="input" id="uni-state" placeholder="State">
        <select class="select" id="uni-status"><option>Active</option><option>Inactive</option></select>
      </div>
      <button class="btn btn-primary btn-sm" id="uni-save-btn" style="margin-top:8px;" onclick="aiiensSaveUniversity()">Create</button>
      <div class="university-filter-box">
        <input class="input" id="uni-search" placeholder="Search by university name" oninput="aiiensRenderUniversities()">
        <input class="input" id="uni-state-filter" placeholder="Filter by state" oninput="aiiensRenderUniversities()">
        <select class="select" id="uni-status-filter" onchange="aiiensRenderUniversities()">
          <option value="">All statuses</option>
          <option>Active</option>
          <option>Inactive</option>
        </select>
      </div>
      <div id="university-list" class="v10-items manage-list"></div>
    </div>`;
  }

  function barRows(rows) {
    const max = Math.max(1, ...rows.map(row => Number(row[1]) || 0));
    return rows.map(([label, value]) => `
      <div class="analytics-row">
        <span>${esc(label)}</span>
        <div><i style="width:${Math.max(6, Math.round((Number(value) || 0) / max * 100))}%"></i></div>
        <strong>${esc(value)}</strong>
      </div>`).join('');
  }

  function analyticsChart(title, rows, caption = '') {
    const total = rows.reduce((sum, row) => sum + (Number(row[1]) || 0), 0);
    return `<div class="card analytics-card production-chart">
      <div class="analytics-card-head">
        <div><h3>${esc(title)}</h3>${caption ? `<p>${esc(caption)}</p>` : ''}</div>
        <strong>${esc(total)}</strong>
      </div>
      <div class="analytics-chart">${barRows(rows)}</div>
    </div>`;
  }

  function engagementKpis(items) {
    return `<div class="card analytics-card production-activity">
      <div class="analytics-card-head"><div><h3>Student Engagement</h3><p>Learning signals across the platform</p></div></div>
      <div class="engagement-kpis">${items.map(([label, value, tone]) => `
        <div class="engagement-kpi ${tone || ''}">
          <strong>${esc(value)}</strong>
          <span>${esc(label)}</span>
        </div>`).join('')}</div>
    </div>`;
  }

  function weeklyStreakDots(current) {
    const active = Math.min(7, Number(current) || 0);
    return Array.from({ length: 7 }, (_, index) => `<span class="${index < active ? 'active' : ''}"></span>`).join('');
  }

  async function renderSubAdminDashboardProduction() {
    const content = document.getElementById('sa-content');
    if (!content) return;
    if (typeof window.aimeasyFetchCurriculumStats === 'function') {
      const { data, error } = await window.aimeasyFetchCurriculumStats();
      if (!error && data) {
        content.innerHTML = `
      <div class="admin-dashboard-wrap">
        <div style="margin-bottom:1.4rem;">
          <h2 style="font-size:1.35rem;font-weight:800;margin-bottom:4px;">Sub Admin Dashboard</h2>
          <p style="font-size:0.84rem;color:var(--text3);">Live curriculum metrics from Supabase.</p>
        </div>
        <div class="admin-grid production-kpi-grid" style="margin-bottom:1.4rem;">
          ${productionCards([
      ['Total Subjects', data.subjects, 'var(--primary)', 'Database subjects'],
      ['Total Units', data.units, 'var(--teal)', 'Database units'],
      ['Total Topics', data.topics, 'var(--lavender)', 'Roadmap topics'],
      ['Total Videos', data.videos, 'var(--blue)', 'Roadmap and content videos'],
      ['Total Notes', data.notes, 'var(--amber)', 'Database notes'],
      ['Total PYQs', data.pyqs, 'var(--green)', 'Database PYQs']
    ])}
        </div>
      </div>`;
        return;
      }
    }
    const subjects = subjectScope();
    const subjectNames = new Set(subjects.map(subject => subject.name));
    const units = subjects.flatMap(subject => allSubjectUnits(subject).map(unit => ({ ...unit, subject })));
    const students = read('edusync_users', []).filter(user =>
      (!APP.subAdminData?.branch || user.branch === APP.subAdminData.branch || user.branch_name === APP.subAdminData.branch)
    );
    const contentRows = ['edusync_admin_videos', 'edusync_admin_notes', 'edusync_admin_pyqs', 'edusync_admin_iqs']
      .flatMap(key => read(key, []).filter(item => subjectNames.has(item.subject)));
    const activeSubjects = subjects.filter(subject => {
      const unitCount = allSubjectUnits(subject).length;
      return unitCount > 0 || contentRows.some(item => item.subject === subject.name);
    });
    const bySem = [...new Set(subjects.map(subject => subject.sem || 'Other'))].sort()
      .map(sem => [sem, subjects.filter(subject => (subject.sem || 'Other') === sem).length]);
    const contentActivity = [
      ['Videos', read('edusync_admin_videos', []).filter(item => subjectNames.has(item.subject)).length],
      ['Notes', read('edusync_admin_notes', []).filter(item => subjectNames.has(item.subject)).length],
      ['PYQs', read('edusync_admin_pyqs', []).filter(item => subjectNames.has(item.subject)).length],
      ['Important Qs', read('edusync_admin_iqs', []).filter(item => subjectNames.has(item.subject)).length]
    ];
    const activity = read('edusync_study_activity', []).filter(event => subjectNames.has(event.subjectName));
    content.innerHTML = `
      <div class="admin-dashboard-wrap">
        <div style="margin-bottom:1.4rem;">
          <h2 style="font-size:1.35rem;font-weight:800;margin-bottom:4px;">Sub Admin Dashboard</h2>
          <p style="font-size:0.84rem;color:var(--text3);">Educational analytics for ${esc(APP.subAdminData?.branch || 'assigned curriculum')}.</p>
        </div>
        <div class="admin-grid production-kpi-grid" style="margin-bottom:1.4rem;">
          ${productionCards([
      ['Total Subjects', subjects.length, 'var(--primary)', 'Assigned scope only'],
      ['Total Units', units.length, 'var(--teal)', 'Across created subjects'],
      ['Active Subjects', activeSubjects.length, 'var(--green)', 'With units or content']
    ])}
        </div>
      </div>`;
  }
  window.renderSubAdminDashboardLive = renderSubAdminDashboardProduction;

  async function renderAdminDashboardProduction() {
    const content = document.getElementById('admin-content');
    if (!content) return;
    if (typeof window.aimeasyFetchAdminDashboardStats === 'function') {
      const stats = await window.aimeasyFetchAdminDashboardStats();
      if (stats) {
        content.innerHTML = `
      <div class="admin-dashboard-wrap">
        <div class="admin-section-head">
          <div>
            <h2>Admin Dashboard</h2>
            <p>Supabase is the only source of truth.</p>
          </div>
        </div>
        <div class="admin-grid production-kpi-grid">
          ${productionCards([
      ['Total Students', stats.students, 'var(--primary)', 'Database student profiles'],
      ['Total Content Creators', stats.creators, 'var(--teal)', 'Sub Admin and creator profiles'],
      ['Total Subjects', stats.subjects, 'var(--lavender)', 'Database subjects'],
      ['Total Videos', stats.videos, 'var(--blue)', 'Roadmap and content videos'],
      ['Total Notes', stats.notes, 'var(--amber)', 'Database notes'],
      ['Total PYQs', stats.pyqs, 'var(--green)', 'Database PYQs']
    ])}
        </div>
      </div>`;
        return;
      }
    }
    const subjects = read('edusync_custom_subjects', []);
    const students = read('edusync_users', []);
    const subAdmins = read('edusync_subadmins', []);
    const universities = managedUniversities();
    const regulations = cachedRegulations();
    content.innerHTML = `
      <div class="admin-dashboard-wrap">
        <div class="admin-section-head">
          <div>
            <h2>Admin Dashboard</h2>
            <p>Supabase is the only source of truth.</p>
          </div>
        </div>
        <div class="admin-grid production-kpi-grid">
          ${productionCards([
      ['Total Students', students.length, 'var(--primary)', 'Real records only'],
      ['Total Sub Admins', subAdmins.length, 'var(--teal)', 'Real records only'],
      ['Total Subjects', subjects.length, 'var(--lavender)', 'Real records only'],
      ['Total Regulations', regulations.length, 'var(--amber)', 'Real records only'],
      ['Total Universities', universities.length, 'var(--green)', 'Real records only']
    ])}
        </div>
      </div>`;
  }

  function renderApprovalLinksProduction(owner = 'admin') {
    const content = document.getElementById(owner === 'admin' ? 'admin-content' : 'sa-content');
    if (!content) return;
    const requests = read('edusync_url_requests', []);
    content.innerHTML = `
      <div class="admin-dashboard-wrap">
        <h2 style="font-size:1.25rem;font-weight:800;margin-bottom:1rem;">URL Approvals</h2>
        <div class="v10-items">
          ${requests.length ? requests.map((request, index) => `
            <div class="v10-item">
              <div class="v10-item-body">
                <div class="v10-item-title">${esc(request.subject || 'Subject')} · Unit ${esc(request.unit || '-')}</div>
                <a href="${esc(request.url)}" target="_blank" rel="noopener noreferrer" class="approval-link">${esc(request.url)}</a>
                <div class="v10-item-meta">Submitted by ${esc(request.submittedBy || 'Student')} · ${esc(request.submittedAt || '')}</div>
              </div>
              <span class="badge ${request.status === 'approved' ? 'badge-green' : request.status === 'rejected' ? 'badge-red' : 'badge-amber'}">${esc(request.status || 'pending')}</span>
              ${request.status === 'pending' ? `<button class="btn btn-primary btn-sm" onclick="adminApproveUrl(${index})">Approve</button><button class="btn btn-ghost btn-sm" onclick="adminRejectUrl(${index})">Reject</button>` : ''}
            </div>`).join('') : '<p style="padding:1rem;color:var(--text3);">No URL requests yet.</p>'}
        </div>
      </div>`;
  }

  const oldAdminApproveUrl = window.adminApproveUrl || adminApproveUrl;
  adminApproveUrl = window.adminApproveUrl = function adminApproveUrlProduction(index) {
    const requests = read('edusync_url_requests', []);
    if (!requests[index]) return;
    requests[index] = { ...requests[index], status: 'approved', reviewedAt: new Date().toISOString() };
    write('edusync_url_requests', requests);
    window.dispatchEvent(new CustomEvent('edusync:data-sync', { detail: { key: 'edusync_url_requests' } }));
    renderApprovalLinksProduction(activeScreen() === 'screen-subadmin' ? 'subadmin' : 'admin');
    showToast('URL approved', 'green');
  };
  const oldAdminRejectUrl = window.adminRejectUrl || adminRejectUrl;
  adminRejectUrl = window.adminRejectUrl = function adminRejectUrlProduction(index) {
    const requests = read('edusync_url_requests', []);
    if (!requests[index]) return;
    requests[index] = { ...requests[index], status: 'rejected', reviewedAt: new Date().toISOString() };
    write('edusync_url_requests', requests);
    window.dispatchEvent(new CustomEvent('edusync:data-sync', { detail: { key: 'edusync_url_requests' } }));
    renderApprovalLinksProduction(activeScreen() === 'screen-subadmin' ? 'subadmin' : 'admin');
    showToast('URL rejected', 'red');
  };
  renderSAUrlRequests = function renderSAUrlRequestsProduction() {
    const list = document.getElementById('sa-url-list');
    if (!list) return;
    const requests = read('edusync_url_requests', []);
    list.innerHTML = requests.length ? requests.map((request, index) => `
      <div class="v10-item">
        <div class="v10-item-body">
          <a href="${esc(request.url)}" target="_blank" rel="noopener noreferrer" class="approval-link">${esc(request.url)}</a>
          <div class="v10-item-meta">${esc(request.subject)} · by ${esc(request.submittedBy)} · ${esc(request.submittedAt)}</div>
        </div>
        <span class="badge ${request.status === 'approved' ? 'badge-green' : request.status === 'rejected' ? 'badge-red' : 'badge-amber'}">${esc(request.status)}</span>
        ${request.status === 'pending' ? `<button class="btn btn-primary btn-sm" onclick="adminApproveUrl(${index});renderSAUrlRequests()">Approve</button><button class="btn btn-ghost btn-sm" onclick="adminRejectUrl(${index});renderSAUrlRequests()">Reject</button>` : ''}
      </div>`).join('') : '<div style="padding:1.5rem;text-align:center;color:var(--text3);">No URL requests yet</div>';
  };

  renderApprovalLinksProduction = async function renderApprovalLinksCardProduction(owner = 'admin') {
    const content = document.getElementById(owner === 'admin' ? 'admin-content' : 'sa-content');
    if (!content) return;
    const supabase = window.__AIMEASY_SUPABASE__;
    let requests = [];
    if (supabase) {
      const { data, error } = await supabase
        .from('student_url_suggestions')
        .select('id, topic_name, url, description, status, created_at, student_id, student_name, subject_id, unit_id, topic_id, subjects(name), units(title, sort_order), topics(topic_name)')
        .order('created_at', { ascending: false });
      if (error) {
        console.warn('[SUGGESTIONS] Approval load failed:', error.message || error);
      } else {
        requests = data || [];
      }
    } else {
      requests = read('edusync_url_requests', []);
    }
    const pending = requests.filter(request => (request.status || 'pending') === 'pending').length;
    const approved = requests.filter(request => request.status === 'approved').length;
    const rejected = requests.filter(request => request.status === 'rejected').length;
    content.innerHTML = `
      <div class="admin-dashboard-wrap approval-workspace">
        <div class="admin-section-head approval-page-head">
          <div>
            <h2>URL Approvals</h2>
            <p>Review submitted learning links and keep the content library clean.</p>
          </div>
          <div class="approval-stat-cards" aria-label="URL approval statistics">
            <div class="approval-stat-card approved"><span>Approved URLs</span><strong>${esc(approved)}</strong></div>
            <div class="approval-stat-card rejected"><span>Rejected URLs</span><strong>${esc(rejected)}</strong></div>
          </div>
        </div>
        <div class="approval-summary-line"><span class="badge badge-amber">${esc(pending)} pending</span></div>
        <div class="approval-card-grid">
          ${requests.length ? requests.map((request, index) => {
      const status = request.status || 'pending';
      const url = String(request.url || '').trim();
      const valid = isValidUrl(url);
      const displayUrl = url || '-';
      const topic = request.topics?.topic_name || request.topic_name || request.topic || request.subtopic || request.subtopicName || request.topicName || 'Not specified';
      const subjectName = request.subjects?.name || request.subject || 'Subject';
      const unitName = request.units?.title || request.unitName || ('Unit ' + (request.units?.sort_order || request.unit || '-'));
      const actionArg = request.id ? `'${esc(request.id)}'` : index;
      return `<div class="approval-card approval-${esc(status)}">
              <div class="approval-card-top">
                <div class="approval-card-title">
                  <span>Subject</span>
                  <h3>${esc(subjectName)}</h3>
                </div>
                <span class="badge ${status === 'approved' ? 'badge-green' : status === 'rejected' ? 'badge-red' : 'badge-amber'}">${esc(status)}</span>
              </div>
              <div class="approval-detail-grid">
                <div><span>Unit</span><strong>${esc(unitName)}</strong></div>
                <div><span>Topic</span><strong>${esc(topic)}</strong></div>
                <div><span>Student</span><strong>${esc(request.student_name || request.submittedBy || request.student_id || 'Student')}</strong></div>
                <div><span>Submitted Date</span><strong>${esc(request.created_at ? new Date(request.created_at).toLocaleString() : request.submittedAt || request.date || '-')}</strong></div>
              </div>
              <div class="approval-url-row ${valid ? '' : 'invalid'}">
                <span class="approval-url-label">URL</span>
                ${valid
          ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer" class="approval-url-text">${esc(displayUrl)} ${externalIcon}</a>`
          : `<span class="approval-url-text invalid">Invalid URL: ${esc(displayUrl)}</span>`}
              </div>
              <div class="approval-actions">
                <button class="btn btn-primary btn-sm" onclick="adminApproveUrl(${actionArg})">Approve</button>
                <button class="btn btn-ghost btn-sm" onclick="adminRejectUrl(${actionArg})">Reject</button>
              </div>
            </div>`;
    }).join('') : '<div class="empty-state-card">No URL requests yet.</div>'}
        </div>
      </div>`;
  };

  renderSAUrlRequests = function renderSAUrlRequestsCardProduction() {
    renderApprovalLinksProduction('subadmin');
  };

  function renderAdminCreateManageProduction() {
    const content = document.getElementById('admin-content');
    if (!content) return;
    const subAdmins = read('edusync_subadmins', []);
    const universities = managedUniversities();
    content.innerHTML = `
      <div class="admin-dashboard-wrap">
        <div class="admin-section-head">
          <div>
            <h2>Create & Manage</h2>
            <p>Core administration tools grouped for fast scanning.</p>
          </div>
        </div>
        <div class="admin-manage-grid">
          <div class="card manage-panel card-soft-blue">
            <div class="manage-panel-head"><div><h3>Sub Admin Management</h3><span>${esc(subAdmins.length)} active records</span></div><button class="btn btn-primary btn-sm" onclick="openCreateSubAdminModal()">Create</button></div>
            <input class="input" id="subadmin-search" placeholder="Search sub admins" oninput="aiiensRenderSubAdmins(this.value)">
            <div class="v10-items manage-list">${subAdmins.map((sa, index) => subAdminRow(sa, index)).join('') || '<div class="empty-state-card">No sub admins yet.</div>'}</div>
          </div>
          ${featureManagerPanel()}
          ${regulationManagerPanel()}
          ${universityPanel(universities)}
          ${branchManagerPanel()}
        </div>
      </div>`;
    aiiensRenderUniversities();
    renderFeatureList();
    window.aimeasyUpdateRegulationDropdowns?.(document);
    window.aiiensUpdateUniversityDropdowns?.(document);
    window.aiiensRenderBranchList?.();
    window.aimeasyRefreshRegulationUI?.();
  }

  function subAdminRow(sa, index) {
    return `<div class="v10-item subadmin-compact-card management-record">
      <div class="record-icon">${esc((sa.username || 'S').charAt(0).toUpperCase())}</div>
      <div class="v10-item-body">
        <div class="v10-item-title">${esc(sa.username || 'User ID')}</div>
        <div class="subadmin-meta-grid">
          <span><b>Branch</b>${esc(sa.branch || '-')}</span>
          <span><b>Regulation</b>${esc(sa.regulation || '-')}</span>
          <span><b>University</b>${esc(sa.university || sa.department || '-')}</span>
          <span><b>Status</b>${esc(sa.status || 'Active')}</span>
        </div>
      </div>
      <button class="icon-action-btn" onclick="aiiensEditSubAdmin(${index})" title="Edit sub admin" aria-label="Edit ${esc(sa.username || 'sub admin')}">${actionIcon.edit}</button>
      <button class="icon-action-btn danger" onclick="aiiensDeleteSubAdmin(${index})" title="Delete sub admin" aria-label="Delete ${esc(sa.username || 'sub admin')}">${actionIcon.delete}</button>
    </div>`;
  }

  renderExistingSubAdmins = function renderExistingSubAdminsProduction() {
    const el = document.getElementById('sa-existing-list');
    if (!el) return;
    const subAdmins = read('edusync_subadmins', []);
    el.innerHTML = subAdmins.length
      ? '<div style="font-size:0.78rem;font-weight:700;color:var(--text2);margin-bottom:6px;">Existing Sub Admins (' + subAdmins.length + ')</div>' + subAdmins.map((sa, index) => subAdminRow(sa, index)).join('')
      : '';
  };
  window.aiiensRenderSubAdmins = function aiiensRenderSubAdmins(query = '') {
    const card = document.querySelector('#subadmin-search')?.closest('.manage-panel');
    const list = card?.querySelector('.manage-list');
    if (!list) return;
    const q = String(query || '').toLowerCase();
    const rows = read('edusync_subadmins', []).filter(sa => !q || [sa.username, sa.branch, sa.university, sa.regulation].some(value => String(value || '').toLowerCase().includes(q)));
    list.innerHTML = rows.length ? rows.map((sa) => {
      const realIndex = read('edusync_subadmins', []).findIndex(item => item.username === sa.username);
      return subAdminRow(sa, realIndex);
    }).join('') : '<div class="empty-state-card">No matching sub admins.</div>';
  };

  function configureSubAdminModalMode(isEdit = false) {
    const title = document.getElementById('create-subadmin-title');
    const submit = document.getElementById('sa-create-submit');
    if (title) title.textContent = isEdit ? 'Edit Sub Admin' : 'Create Sub Admin';
    if (submit) submit.textContent = isEdit ? 'Save Changes' : 'Create';
    const dept = document.getElementById('sa-create-dept');
    if (dept && !dept.value) dept.value = 'Academics';
    const permissions = document.getElementById('sa-create-permissions');
    if (permissions && !permissions.value) permissions.value = 'subjects, units, content';
  }
  window.configureSubAdminModalMode = configureSubAdminModalMode;

  window.toggleSubAdminPassword = function toggleSubAdminPassword() {
    const input = document.getElementById('sa-create-password');
    const button = document.querySelector('#create-subadmin-modal .password-toggle');
    if (!input) return;
    const showing = input.type === 'text';
    input.type = showing ? 'password' : 'text';
    if (button) {
      button.textContent = showing ? 'Eye' : 'Hide';
      button.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
    }
  };

  document.getElementById('create-subadmin-modal')?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    const target = event.target;
    if (target?.tagName === 'TEXTAREA') return;
    event.preventDefault();
    createSubAdmin();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    const target = event.target;
    if (!target || target.tagName === 'TEXTAREA' || target.closest('#create-subadmin-modal')) return;
    if (target.closest('#sa-create-subject-form') || target.closest('#v10-sa-create-form')) {
      event.preventDefault();
      window.v10SACreateSubject?.();
      return;
    }
    if (target.id === 'uni-name' || target.id === 'uni-code' || target.id === 'uni-status') {
      event.preventDefault();
      window.aiiensSaveUniversity?.();
      return;
    }
    if (target.id === 'adm-feature-name') {
      event.preventDefault();
      window.adminAddFeature?.();
    }
  });

  openCreateSubAdminModal = window.openCreateSubAdminModal = function openCreateSubAdminModalProduction() {
    const modal = document.getElementById('create-subadmin-modal');
    modal?.classList.add('open');
    if (modal) delete modal.dataset.editIndex;
    ['sa-create-username', 'sa-create-password', 'sa-create-branch', 'sa-create-regulation', 'sa-create-university'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    configureSubAdminModalMode(false);
    window.aimeasyUpdateRegulationDropdowns?.(document);
    window.aiiensUpdateUniversityDropdowns?.(document);
  };

  createSubAdmin = window.createSubAdmin = async function createSubAdminProduction() {
    const modal = document.getElementById('create-subadmin-modal');
    const editIndex = modal?.dataset.editIndex;
    const username = document.getElementById('sa-create-username')?.value.trim();
    const password = document.getElementById('sa-create-password')?.value.trim();
    const branch = document.getElementById('sa-create-branch')?.value;
    const department = document.getElementById('sa-create-dept')?.value.trim() || 'Academics';
    const regulation = document.getElementById('sa-create-regulation')?.value;
    const university = document.getElementById('sa-create-university')?.value.trim();
    const permissions = (document.getElementById('sa-create-permissions')?.value || 'subjects, units, content').split(',').map(p => p.trim()).filter(Boolean);
    const errEl = document.getElementById('sa-create-err');
    const sucEl = document.getElementById('sa-create-success');
    if (!username || !password || !branch || !department || !regulation || !university) {
      if (errEl) { errEl.textContent = 'Please fill username, password, branch, department, regulation, and university.'; errEl.style.display = 'block'; }
      if (sucEl) sucEl.style.display = 'none';
      return;
    }
    const subAdmins = read('edusync_subadmins', []);
    const duplicate = subAdmins.some((sa, idx) => sa.username === username && String(idx) !== String(editIndex ?? ''));
    if (duplicate) {
      if (errEl) { errEl.textContent = 'Username already exists.'; errEl.style.display = 'block'; }
      return;
    }
    const row = { username, password, branch, department, regulation, university, permissions, createdAt: subAdmins[editIndex]?.createdAt || new Date().toLocaleString() };
    if (editIndex !== undefined) subAdmins[Number(editIndex)] = { ...subAdmins[Number(editIndex)], ...row };
    else subAdmins.push(row);
    write('edusync_subadmins', subAdmins);
    if (window.supabase && editIndex === undefined) {

      console.log('SUBADMIN INSERT START', username);

      const { data, error } = await window.supabase
        .from('sub_admin_accounts')
        .insert([
          {
            username,
            password,
            status: 'active'
          }
        ])
        .select();

      console.log('SUBADMIN INSERT DATA:', data);
      console.log('SUBADMIN INSERT ERROR:', error);

      if (error) {
        console.error('SUBADMIN INSERT FAILED:', error);
        showToast('Failed to save subadmin to Supabase', 'red');
      } else {
        console.log('SUBADMIN INSERT SUCCESS:', username);
      }
    }
    if (errEl) errEl.style.display = 'none';
    if (sucEl) { sucEl.textContent = editIndex !== undefined ? 'Sub Admin updated.' : 'Sub Admin created.'; sucEl.style.display = 'block'; }
    if (modal) delete modal.dataset.editIndex;
    configureSubAdminModalMode(false);
    renderExistingSubAdmins();
    refreshActiveAdminSurfaces();
    showToast(editIndex !== undefined ? 'Sub Admin updated' : 'Sub Admin created', 'green');
  };

  window.aiiensEditSubAdmin = function aiiensEditSubAdmin(index) {
    const subAdmins = read('edusync_subadmins', []);
    const sa = subAdmins[index];
    if (!sa) return;
    const modal = document.getElementById('create-subadmin-modal');
    modal?.classList.add('open');
    modal?.style.removeProperty('pointer-events');
    if (modal) modal.dataset.editIndex = String(index);
    window.aiiensUpdateUniversityDropdowns?.(document);
    document.getElementById('sa-create-username').value = sa.username || '';
    document.getElementById('sa-create-password').value = sa.password || '';
    document.getElementById('sa-create-branch').value = sa.branch || '';
    document.getElementById('sa-create-dept').value = sa.department || sa.dept || '';
    if (document.getElementById('sa-create-regulation')) document.getElementById('sa-create-regulation').value = sa.regulation || '';
    if (document.getElementById('sa-create-university')) document.getElementById('sa-create-university').value = sa.university || '';
    window.setTimeout(() => {
      if (document.getElementById('sa-create-university')) document.getElementById('sa-create-university').value = sa.university || '';
    }, 0);
    if (document.getElementById('sa-create-permissions')) document.getElementById('sa-create-permissions').value = (sa.permissions || []).join(', ');
    configureSubAdminModalMode(true);
    renderExistingSubAdmins();
  };
  window.aiiensDeleteSubAdmin = async function aiiensDeleteSubAdmin(index) {
    const subAdmins = read('edusync_subadmins', []);
    const deletedUser = subAdmins[index];

    subAdmins.splice(index, 1);
    write('edusync_subadmins', subAdmins);

    if (window.supabase && deletedUser) {
      const { error } = await window.supabase
        .from('sub_admin_accounts')
        .delete()
        .eq('username', deletedUser.username);

      console.log('DELETE ERROR:', error);
    }

    renderExistingSubAdmins();
    refreshActiveAdminSurfaces();
    showToast('Sub Admin deleted', 'red');
  };

  window.aiiensSaveUniversity = function aiiensSaveUniversity() {
    const name = document.getElementById('uni-name')?.value.trim();
    const code = document.getElementById('uni-code')?.value.trim();
    const state = document.getElementById('uni-state')?.value.trim();
    const status = document.getElementById('uni-status')?.value || 'Active';
    if (!name || !code) { showToast('Enter university name and code', 'red'); return; }
    const rows = managedUniversities();
    const editIndex = document.getElementById('uni-name')?.dataset.editIndex;
    const row = { name, code, state, status, updatedAt: new Date().toISOString() };
    if (editIndex !== undefined) rows[Number(editIndex)] = { ...rows[Number(editIndex)], ...row };
    else rows.push(row);
    saveManagedUniversities(rows);
    delete document.getElementById('uni-name').dataset.editIndex;
    document.getElementById('uni-name').value = '';
    document.getElementById('uni-code').value = '';
    if (document.getElementById('uni-state')) document.getElementById('uni-state').value = '';
    if (document.getElementById('uni-status')) document.getElementById('uni-status').value = 'Active';
    aiiensRenderUniversities();
    window.aiiensUpdateUniversityDropdowns?.(document);
    showToast(editIndex !== undefined ? 'University updated' : 'University saved', 'green');
  };
  window.aiiensRenderUniversities = function aiiensRenderUniversities(query = '') {
    const list = document.getElementById('university-list');
    if (!list) return;
    const q = String(query || document.getElementById('uni-search')?.value || '').toLowerCase();
    const stateQ = String(document.getElementById('uni-state-filter')?.value || '').toLowerCase();
    const statusQ = String(document.getElementById('uni-status-filter')?.value || '').toLowerCase();
    const allRows = managedUniversities();
    const rows = allRows.filter(row => {
      const nameMatch = !q || String(row.name || '').toLowerCase().includes(q) || String(row.code || '').toLowerCase().includes(q);
      const stateMatch = !stateQ || String(row.state || '').toLowerCase().includes(stateQ);
      const statusMatch = !statusQ || String(row.status || 'Active').toLowerCase() === statusQ;
      return nameMatch && stateMatch && statusMatch;
    });
    list.innerHTML = rows.length ? rows.map((row, index) => `
      <div class="v10-item management-record"><div class="v10-item-body"><div class="v10-item-title">${esc(row.name)}</div><div class="v10-item-meta">${esc(row.code)} · ${esc(row.state || 'State not set')} · ${esc(row.status || 'Active')}</div></div>
      <button class="icon-action-btn" onclick="aiiensEditUniversity(${allRows.indexOf(row)})" title="Edit university" aria-label="Edit ${esc(row.name)}">${actionIcon.edit}</button><button class="icon-action-btn danger" onclick="aiiensDeleteUniversity(${allRows.indexOf(row)})" title="Delete university" aria-label="Delete ${esc(row.name)}">${actionIcon.delete}</button></div>`).join('') : '<p style="color:var(--text3);">No universities found.</p>';
  };
  window.aiiensEditUniversity = function aiiensEditUniversity(index) {
    const row = managedUniversities()[index];
    if (!row) return;
    document.getElementById('uni-name').value = row.name || '';
    document.getElementById('uni-name').dataset.editIndex = String(index);
    document.getElementById('uni-code').value = row.code || '';
    if (document.getElementById('uni-state')) document.getElementById('uni-state').value = row.state || '';
    document.getElementById('uni-status').value = row.status || 'Active';
    document.getElementById('uni-name')?.focus();
  };
  window.aiiensDeleteUniversity = function aiiensDeleteUniversity(index) {
    const rows = managedUniversities();
    rows.splice(index, 1);
    saveManagedUniversities(rows);
    aiiensRenderUniversities();
    window.aiiensUpdateUniversityDropdowns?.(document);
    showToast('University deleted', 'red');
  };

  adminAddFeature = window.adminAddFeature = function adminAddFeatureProduction() {
    const input = document.getElementById('adm-feature-name');
    const name = input?.value.trim();
    if (!name) { showToast('Enter feature name', 'red'); return; }
    const rows = featureRows();
    if (rows.some(item => featureSlug(item) === featureSlug(name))) {
      showToast('Feature already exists', 'amber');
      return;
    }
    const nextSlug = featureSlug(name);
    write('edusync_disabled_features', read('edusync_disabled_features', []).filter(item => featureSlug(item) !== nextSlug));
    saveFeatureRows([...rows, name]);
    if (input) input.value = '';
    renderFeatureList();
    showToast('Feature added and synced to all panels.', 'green');
  };
  adminEditFeature = window.adminEditFeature = function adminEditFeatureProduction(index) {
    const rows = featureRows();
    const oldName = rows[index];
    const nextName = prompt('Edit feature name:', oldName);
    if (!nextName?.trim()) return;
    const oldSlug = featureSlug(oldName);
    if (['videos', 'notes', 'pyqs', 'important-questions'].includes(oldSlug)) {
      const disabled = [...new Set([...read('edusync_disabled_features', []), oldSlug])];
      write('edusync_disabled_features', disabled);
      rows.splice(index, 1, nextName.trim());
    } else {
      rows[index] = nextName.trim();
    }
    saveFeatureRows(rows);
    renderFeatureList();
    showToast('Feature updated everywhere.', 'green');
  };
  adminDeleteFeature = window.adminDeleteFeature = function adminDeleteFeatureProduction(index) {
    const rows = featureRows();
    const feature = rows[index];
    if (!feature) return;
    if (!confirm(`Delete "${feature}"? Existing content for this feature may no longer be shown.`)) return;
    const key = featureSlug(feature);
    if (['videos', 'notes', 'pyqs', 'important-questions'].includes(key)) {
      write('edusync_disabled_features', [...new Set([...read('edusync_disabled_features', []), key])]);
    } else {
      saveFeatureRows(rows.filter((_, itemIndex) => itemIndex !== index));
    }
    renderFeatureList();
    showToast('Feature deleted', 'red');
  };

  window.aiiensEditUrlRequest = function aiiensEditUrlRequest(index) {
    const rows = read('edusync_url_requests', []);
    const row = rows[index];
    if (!row) return;
    const nextUrl = prompt('Edit URL:', row.url || '');
    if (!nextUrl?.trim()) return;
    rows[index] = { ...row, url: nextUrl.trim() };
    write('edusync_url_requests', rows);
    renderApprovalLinksProduction(activeScreen() === 'screen-subadmin' ? 'subadmin' : 'admin');
    showToast('URL request updated', 'green');
  };
  window.aiiensDeleteUrlRequest = function aiiensDeleteUrlRequest(index) {
    const rows = read('edusync_url_requests', []);
    const row = rows[index];
    if (!row) return;
    if (!confirm('Delete this URL request?')) return;
    rows.splice(index, 1);
    write('edusync_url_requests', rows);
    renderApprovalLinksProduction(activeScreen() === 'screen-subadmin' ? 'subadmin' : 'admin');
    showToast('URL request deleted', 'red');
  };

  adminApproveUrl = window.adminApproveUrl = async function adminApproveUrlDb(idOrIndex) {
    const supabase = window.__AIMEASY_SUPABASE__;
    if (!supabase) {
      const rows = read('edusync_url_requests', []);
      if (!rows[idOrIndex]) return;
      rows[idOrIndex] = { ...rows[idOrIndex], status: 'approved', reviewedAt: new Date().toISOString() };
      write('edusync_url_requests', rows);
      renderApprovalLinksProduction(activeScreen() === 'screen-subadmin' ? 'subadmin' : 'admin');
      showToast('URL approved', 'green');
      return;
    }
    const authUser = supabase.auth?.getUser ? (await supabase.auth.getUser())?.data?.user : null;
    const { error } = await supabase
      .from('student_url_suggestions')
      .update({
        status: 'approved',
        approved_by: authUser?.id || null,
        approved_at: new Date().toISOString(),
      })
      .eq('id', idOrIndex);
    if (error) {
      showToast('Approval failed: ' + error.message, 'red');
      return;
    }
    await renderApprovalLinksProduction(activeScreen() === 'screen-subadmin' ? 'subadmin' : 'admin');
    if (document.querySelector('.screen.active')?.id === 'screen-app' && APP.currentSubject && APP.currentUnit) {
      renderVideoList(APP.currentSubject.id || APP.currentSubject.rawId, APP.currentUnit);
    }
    showToast('URL approved and published', 'green');
  };

  adminRejectUrl = window.adminRejectUrl = async function adminRejectUrlDb(idOrIndex) {
    const supabase = window.__AIMEASY_SUPABASE__;
    if (!supabase) {
      const rows = read('edusync_url_requests', []);
      if (!rows[idOrIndex]) return;
      rows[idOrIndex] = { ...rows[idOrIndex], status: 'rejected', reviewedAt: new Date().toISOString() };
      write('edusync_url_requests', rows);
      renderApprovalLinksProduction(activeScreen() === 'screen-subadmin' ? 'subadmin' : 'admin');
      showToast('URL rejected', 'red');
      return;
    }
    const { error } = await supabase
      .from('student_url_suggestions')
      .update({
        status: 'rejected',
        approved_by: null,
        approved_at: null,
      })
      .eq('id', idOrIndex);
    if (error) {
      showToast('Reject failed: ' + error.message, 'red');
      return;
    }
    await renderApprovalLinksProduction(activeScreen() === 'screen-subadmin' ? 'subadmin' : 'admin');
    showToast('URL rejected', 'red');
  };

  const originalSwitchAdminSection = window.switchAdminSection || switchAdminSection;
  switchAdminSection = window.switchAdminSection = function switchAdminSectionProduction(section) {
    section = normalizeAdminSection(section);
    console.log('[ROUTE RESTORE] Admin section restore', { requested: window.location.hash, section });
    closeAdminSidebar?.();
    document.querySelectorAll('[id^="admin-nav-"]').forEach(el => el.classList.remove('active'));
    document.getElementById('admin-nav-' + section)?.classList.add('active');
    const titleEl = document.getElementById('admin-topbar-title');
    if (titleEl) titleEl.textContent = ({ dashboard: 'Admin Dashboard', create: 'Create & Manage', subjects: 'All Subjects', approvals: 'URL Approvals', creatorview: 'Creator View', skillup: 'Skill Up', notifications: 'Notifications' })[section] || 'Admin';
    routePush('/admin/' + adminRouteFor(section));
    if (section === 'dashboard') return renderAdminDashboardProduction();
    if (section === 'create') return renderAdminCreateManageProduction();
    if (section === 'approvals') return renderApprovalLinksProduction('admin');
    return originalSwitchAdminSection?.(section);
  };

  renderAdminSection = window.renderAdminSection = function renderAdminSectionProduction(section) {
    section = normalizeAdminSection(section);
    document.querySelectorAll('[id^="admin-nav-"]').forEach(el => el.classList.remove('active'));
    document.getElementById('admin-nav-' + section)?.classList.add('active');
    const titleEl = document.getElementById('admin-topbar-title');
    if (titleEl) titleEl.textContent = ({ dashboard: 'Admin Dashboard', create: 'Create & Manage', subjects: 'All Subjects', approvals: 'URL Approvals', creatorview: 'Creator View', skillup: 'Skill Up', notifications: 'Notifications' })[section] || 'Admin';
    if (section === 'dashboard') return renderAdminDashboardProduction();
    if (section === 'create') return renderAdminCreateManageProduction();
    if (section === 'approvals') return renderApprovalLinksProduction('admin');
    return originalSwitchAdminSection?.(section);
  };

  const originalSwitchSASection = window.switchSASection || switchSASection;
  switchSASection = window.switchSASection = function switchSASectionProduction(section) {
    section = normalizeSASection(section);
    console.log('[ROUTE RESTORE] SubAdmin section restore', { requested: window.location.hash, section });
    closeSASidebar?.();
    document.querySelectorAll('[id^="sa-nav-"]').forEach(el => el.classList.remove('active'));
    document.getElementById('sa-nav-' + section)?.classList.add('active');
    const titleEl = document.getElementById('sa-topbar-title');
    if (titleEl) titleEl.textContent = ({ dashboard: 'Sub Admin Dashboard', subjects: 'Create Subject', view: 'View Subjects', curriculum: 'Curriculum', skillup: 'Skill Up', urls: 'URL Approvals' })[section] || 'Sub Admin';
    routePush('/subadmin/' + saRouteFor(section));
    if (section === 'dashboard') return renderSubAdminDashboardProduction();
    if (section === 'urls') return renderApprovalLinksProduction('subadmin');
    return originalSwitchSASection?.(section);
  };

  window.adminNavigateBack = function adminNavigateBackProduction() {
    if (document.getElementById('admin-nav-dashboard')?.classList.contains('active')) return;
    switchAdminSection('dashboard');
  };
  window.subAdminNavigateBack = function subAdminNavigateBackProduction() {
    if (document.getElementById('sa-nav-dashboard')?.classList.contains('active')) return;
    switchSASection('dashboard');
  };
  window.subAdminBack = function subAdminLogoutOnlyFromButton() {
    APP.adminType = null;
    APP.subAdminData = null;
    showScreen('screen-landing');
  };

  function wrapAndRefresh(fnName) {
    const original = window[fnName] || (typeof globalThis[fnName] === 'function' ? globalThis[fnName] : null);
    if (typeof original !== 'function') return;
    window[fnName] = globalThis[fnName] = function wrappedProductionRefresh(...args) {
      const result = original.apply(this, args);
      Promise.resolve(result).finally(() => window.setTimeout(refreshActiveAdminSurfaces, 0));
      return result;
    };
  }
  [
    'v10SACreateSubject', 'v10AdminCreateSubject', 'v10AdminSaveEditSubject', 'v10AdminDeleteSubject',
    'v10AdminAddUnit', 'v10AdminEditUnit', 'v10AdminDeleteUnit', 'v10SaveUnitRoadmap',
    'v10UploadNote', 'v10UploadPYQ', 'v10UploadIQ', 'aimSaveCreatorCurriculumContent'
  ].forEach(wrapAndRefresh);

  window.addEventListener('storage', (event) => {
    if (/^(edusync_custom_subjects|edusync_units_|edusync_admin_|edusync_url_requests|edusync_subadmins|edusync_universities|edusync_deleted_universities|edusync_regulations|aimeasy_cached_regulations)/.test(event.key || '')) {
      refreshActiveAdminSurfaces();
    }
  });
})();

// Backward-compatible globals for inline legacy HTML handlers.
// Keep this outside feature code so UI clicks never fail with ReferenceError after refactors.
(function installLegacyInlineHandlerGlobals() {
  const expose = (name, fn) => {
    if (typeof fn !== 'function') return;
    window[name] = globalThis[name] = function legacyInlineHandlerBridge(...args) {
      return fn.apply(this, args);
    };
  };

  expose('selectRoleAndNavigate', typeof selectRoleAndNavigate === 'function' ? selectRoleAndNavigate : window.selectRoleAndNavigate);
  expose('selectRole', typeof selectRole === 'function' ? selectRole : window.selectRole);
  expose('proceedWithRole', typeof proceedWithRole === 'function' ? proceedWithRole : window.proceedWithRole);
  expose('toggleAdminDropdown', typeof toggleAdminDropdown === 'function' ? toggleAdminDropdown : window.toggleAdminDropdown);
  expose('openAdminLogin', typeof openAdminLogin === 'function' ? openAdminLogin : window.openAdminLogin);
  expose('closeAdminLogin', typeof closeAdminLogin === 'function' ? closeAdminLogin : window.closeAdminLogin);
  expose('submitAdminLogin', typeof submitAdminLogin === 'function' ? submitAdminLogin : window.submitAdminLogin);
  expose('toggleAdminSidebar', typeof toggleAdminSidebar === 'function' ? toggleAdminSidebar : window.toggleAdminSidebar);
  expose('closeAdminSidebar', typeof closeAdminSidebar === 'function' ? closeAdminSidebar : window.closeAdminSidebar);
  expose('switchAdminSection', typeof switchAdminSection === 'function' ? switchAdminSection : window.switchAdminSection);
  expose('renderAdminSection', typeof renderAdminSection === 'function' ? renderAdminSection : window.renderAdminSection);
  expose('launchAdminDashboard', typeof launchAdminDashboard === 'function' ? launchAdminDashboard : window.launchAdminDashboard);
  expose('adminLogout', typeof adminLogout === 'function' ? adminLogout : window.adminLogout);
  expose('toggleSASidebar', typeof toggleSASidebar === 'function' ? toggleSASidebar : window.toggleSASidebar);
  expose('closeSASidebar', typeof closeSASidebar === 'function' ? closeSASidebar : window.closeSASidebar);
  expose('switchSASection', typeof switchSASection === 'function' ? switchSASection : window.switchSASection);
  expose('subAdminBack', typeof subAdminBack === 'function' ? subAdminBack : window.subAdminBack);
  expose('launchSubAdmin', typeof launchSubAdmin === 'function' ? launchSubAdmin : window.launchSubAdmin);
  expose('showScreen', typeof showScreen === 'function' ? showScreen : window.showScreen);
  expose('showLoading', typeof showLoading === 'function' ? showLoading : window.showLoading);
  expose('hideLoading', typeof hideLoading === 'function' ? hideLoading : window.hideLoading);

  console.log('[LEGACY COMPAT] Inline handlers restored', {
    selectRoleAndNavigate: typeof window.selectRoleAndNavigate,
    switchAdminSection: typeof window.switchAdminSection,
    toggleAdminDropdown: typeof window.toggleAdminDropdown,
    toggleAdminSidebar: typeof window.toggleAdminSidebar,
    openAdminLogin: typeof window.openAdminLogin,
    submitAdminLogin: typeof window.submitAdminLogin,
  });

  // =========================================================================
  //  NOTIFICATIONS LOGIC
  // =========================================================================

  function getCurrentUserKey() {
    const user = window.APP?.user || JSON.parse(localStorage.getItem('edusync_session_user') || '{}');
    return user.id || user.email || 'guest';
  }

  window.sendAdminNotification = function () {
    const title = document.getElementById('notif-title')?.value.trim();
    const recipient = document.getElementById('notif-recipient')?.value;
    const message = document.getElementById('notif-message')?.value.trim();

    if (!title || !message) {
      showToast('Please fill in both the title and message fields.', 'red');
      return;
    }

    let notifications = JSON.parse(localStorage.getItem('edusync_admin_notifications') || '[]');
    const newNotif = {
      id: Date.now(),
      title: title,
      message: message,
      recipient: recipient,
      sentAt: new Date().toLocaleString(),
    };

    notifications.unshift(newNotif);

    // Maintain maximum of 5 notifications (oldest removed)
    if (notifications.length > 5) {
      notifications = notifications.slice(0, 5);
    }

    localStorage.setItem('edusync_admin_notifications', JSON.stringify(notifications));

    // Clear form inputs
    if (document.getElementById('notif-title')) document.getElementById('notif-title').value = '';
    if (document.getElementById('notif-message')) document.getElementById('notif-message').value = '';

    showToast('✅ Notification sent successfully!', 'green');
    renderAdminNotificationsUI();
  };

  window.deleteAdminNotification = function (id) {
    if (!confirm('Are you sure you want to delete this notification?')) return;
    let notifications = JSON.parse(localStorage.getItem('edusync_admin_notifications') || '[]');
    notifications = notifications.filter(n => n.id !== id);
    localStorage.setItem('edusync_admin_notifications', JSON.stringify(notifications));

    showToast('Notification deleted', 'red');
    renderAdminNotificationsUI();
  };

  window.renderAdminNotificationsUI = function () {
    const content = document.getElementById('admin-content');
    if (!content) return;

    const notifications = JSON.parse(localStorage.getItem('edusync_admin_notifications') || '[]');

    content.innerHTML = `
      <div style="padding:2rem; max-width:1200px; margin:0 auto; width:100%;">
        <div style="margin-bottom:1.6rem;">
          <h2 style="font-size:1.5rem; font-weight:800; letter-spacing:-0.02em; margin-bottom:4px;">🔔 Notifications Management</h2>
          <p style="font-size:0.85rem; color:var(--text3);">Compose and send notifications to Students or Content Creators</p>
        </div>

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:1.6rem; align-items:start;">
          <!-- Compose Notification Form -->
          <div class="card" style="padding: 1.5rem;">
            <h3 style="margin-bottom: 1.2rem; font-size:1.1rem; font-weight:700;">➕ Compose Notification</h3>
            <div class="input-group" style="margin-bottom: 1rem;">
              <label style="font-weight:600; margin-bottom: 4px; display:block;">Title</label>
              <input class="input" id="notif-title" placeholder="e.g. System Update or Important announcement" style="width:100%;">
            </div>
            
            <div class="input-group" style="margin-bottom: 1rem;">
              <label style="font-weight:600; margin-bottom: 4px; display:block;">Recipient Role</label>
              <select class="select" id="notif-recipient" style="width:100%;">
                <option value="student">Student</option>
                <option value="content_creator">Content Creator</option>
                <option value="both">Both (All)</option>
              </select>
            </div>
            
            <div class="input-group" style="margin-bottom: 1.5rem;">
              <label style="font-weight:600; margin-bottom: 4px; display:block;">Message</label>
              <textarea class="input" id="notif-message" rows="5" placeholder="Write notification message here..." style="width:100%; resize: vertical; min-height: 120px;"></textarea>
            </div>
            
            <button class="btn btn-primary" onclick="sendAdminNotification()" style="width:100%; font-weight:700; padding:10px;">
              🔔 Send Broadcast
            </button>
          </div>

          <!-- Sent Notifications History -->
          <div class="card" style="padding: 1.5rem;">
            <h3 style="margin-bottom: 1.2rem; font-size:1.1rem; font-weight:700;">📋 Broadcast History (Latest 5)</h3>
            <div style="display:flex; flex-direction:column; gap:10px;">
              ${!notifications.length ? `
                <div style="text-align:center; padding:3rem; color:var(--text3); border:1.5px dashed var(--border); border-radius:var(--radius-md);">
                  📬 No notifications sent yet.
                </div>
              ` : notifications.map(n => `
                <div style="padding: 12px; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface2); display:flex; justify-content:space-between; align-items:flex-start; gap:10px;">
                  <div style="flex:1; min-width:0;">
                    <div style="font-weight:700; font-size:0.9rem; color:var(--text1); display:flex; align-items:center; gap:8px;">
                      ${n.title}
                      <span class="badge ${n.recipient === 'student' ? 'badge-primary' : n.recipient === 'content_creator' ? 'badge-teal' : 'badge-lavender'}" style="font-size:0.65rem;">
                        ${n.recipient === 'student' ? 'Student' : n.recipient === 'content_creator' ? 'Creator' : 'All'}
                      </span>
                    </div>
                    <p style="font-size:0.82rem; color:var(--text2); margin-top:4px; line-height:1.4; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">
                      ${n.message}
                    </p>
                    <span style="font-size:0.7rem; color:var(--text3); display:block; margin-top:6px;">
                      🕒 Sent: ${n.sentAt}
                    </span>
                  </div>
                  <button class="btn btn-danger btn-sm" onclick="deleteAdminNotification(${n.id})" style="padding:4px 8px; font-size:0.75rem;">✕</button>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
  };

  window.openNotificationsModal = function () {
    const modal = document.getElementById('notifications-modal');
    if (!modal) return;

    // Reset views
    document.getElementById('notif-detail-container').style.display = 'none';
    document.getElementById('notif-list-container').style.display = 'flex';

    // Render notifications list
    renderNotificationsList();

    modal.classList.add('open');
  };

  window.closeNotificationsModal = function () {
    const modal = document.getElementById('notifications-modal');
    if (modal) modal.classList.remove('open');

    // Refresh dot status
    updateNotificationDots();
  };

  window.backToNotifList = function () {
    document.getElementById('notif-detail-container').style.display = 'none';
    document.getElementById('notif-list-container').style.display = 'flex';
    renderNotificationsList();
  };

  function renderNotificationsList() {
    const container = document.getElementById('notif-list-container');
    if (!container) return;

    const userRole = window.APP?.user?.role || window.APP?.role || 'student';
    const userKey = getCurrentUserKey();

    const notifications = JSON.parse(localStorage.getItem('edusync_admin_notifications') || '[]');
    const readList = JSON.parse(localStorage.getItem('edusync_read_notifications_' + userKey) || '[]');

    // Filter relevant notifications (matches user role or 'both')
    const relevant = notifications.filter(n => n.recipient === userRole || n.recipient === 'both');

    if (!relevant.length) {
      container.innerHTML = `
        <div style="text-align: center; padding: 2.5rem; color: var(--text3);">
          <div style="font-size: 2.5rem; margin-bottom: 8px;">📬</div>
          <div style="font-weight:600; font-size:0.88rem;">All caught up!</div>
          <div style="font-size:0.78rem; margin-top:2px;">No announcements from Admin.</div>
        </div>
      `;
      return;
    }

    container.innerHTML = relevant.map(n => {
      const isRead = readList.includes(n.id);
      return `
        <div onclick="openNotificationDetail(${n.id})" style="position: relative; padding: 12px; border: 1px solid var(--border); border-radius: var(--radius-md); background: ${isRead ? 'var(--surface)' : 'var(--primary-light)'}; cursor: pointer; transition: var(--transition); display: flex; gap: 10px; align-items: flex-start;">
          <div style="font-size: 1.3rem; margin-top: 2px;">📢</div>
          <div style="flex: 1; min-width: 0;">
            <div style="font-weight: 700; font-size: 0.9rem; color: var(--text1); display: flex; align-items: center; gap: 8px;">
              <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 80%;">${n.title}</span>
              ${!isRead ? '<span style="width: 8px; height: 8px; border-radius: 50%; background: var(--red); display: inline-block; flex-shrink: 0;" title="Unread"></span>' : ''}
            </div>
            <div style="font-size: 0.8rem; color: var(--text2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 4px;">
              ${n.message}
            </div>
            <div style="font-size: 0.7rem; color: var(--text3); margin-top: 6px;">
              🕒 ${n.sentAt}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  window.openNotificationDetail = function (id) {
    const notifications = JSON.parse(localStorage.getItem('edusync_admin_notifications') || '[]');
    const notif = notifications.find(n => n.id === id);
    if (!notif) return;

    // Mark as read
    const userKey = getCurrentUserKey();
    let readList = JSON.parse(localStorage.getItem('edusync_read_notifications_' + userKey) || '[]');
    if (!readList.includes(id)) {
      readList.push(id);
      localStorage.setItem('edusync_read_notifications_' + userKey, JSON.stringify(readList));
    }

    // Toggle views
    document.getElementById('notif-list-container').style.display = 'none';
    const detail = document.getElementById('notif-detail-container');
    detail.style.display = 'flex';

    document.getElementById('notif-detail-title').textContent = notif.title;
    document.getElementById('notif-detail-time').textContent = '🕒 Received: ' + notif.sentAt;
    document.getElementById('notif-detail-message').textContent = notif.message;
  };

  window.updateNotificationDots = function () {
    const userRole = window.APP?.user?.role || window.APP?.role;
    if (!userRole) return;

    const userKey = getCurrentUserKey();
    const notifications = JSON.parse(localStorage.getItem('edusync_admin_notifications') || '[]');
    const readList = JSON.parse(localStorage.getItem('edusync_read_notifications_' + userKey) || '[]');

    const relevant = notifications.filter(n => n.recipient === userRole || n.recipient === 'both');
    const hasUnread = relevant.some(n => !readList.includes(n.id));

    const studentDot = document.getElementById('student-notif-dot');
    const creatorDot = document.getElementById('creator-notif-dot');

    if (studentDot) studentDot.style.display = hasUnread ? 'block' : 'none';
    if (creatorDot) creatorDot.style.display = hasUnread ? 'block' : 'none';
  };

  // Run automatically to keep notification dots in sync
  setInterval(window.updateNotificationDots, 2000);
})();

/* Supabase-backed student dashboard/profile and live workshop patch. */
(function installStudentDashboardAndWorkshopPatch() {
  if (window.__aiiensStudentWorkshopPatchInstalled) return;
  window.__aiiensStudentWorkshopPatchInstalled = true;

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const js = (value) => String(value ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const sb = () => window.__AIMEASY_SUPABASE__;
  let liveWorkshopChannel = null;
  let liveWorkshopActivePage = 'dashboard';
  let liveWorkshopCarouselTimer = null;
  let liveWorkshopCarouselIndex = 0;
  let liveWorkshopRenderToken = 0;
  let liveWorkshopPendingRegistrationId = '';
  let studentWorkshopCarouselTimer = null;
  let studentWorkshopCarouselIndex = 0;
  let studentWorkshopRenderToken = 0;
  const todayKeyDb = (date = new Date()) => date.toISOString().slice(0, 10);
  const pctFromCgpa = (cgpa) => Math.max(0, Math.min(100, Number(cgpa || 0) * 9.5));

  async function authUser() {
    try {
      const { data } = await sb()?.auth?.getUser?.();
      return data?.user || null;
    } catch {
      return null;
    }
  }

  async function userId() {
    const user = await authUser();
    return user?.id || window.APP?.user?.id || window.APP?.user?.googleId || null;
  }

  function hasLiveWorkshopPortalAuth() {
    try {
      return sessionStorage.getItem('aimeasy_login_portal') === 'live_workshop'
        || localStorage.getItem('aimeasy_login_portal_backup') === 'live_workshop'
        || sessionStorage.getItem('aiiens_live_workshop_auth') === '1';
    } catch {
      return false;
    }
  }

  function markLiveWorkshopPortal() {
    try {
      sessionStorage.setItem('aimeasy_login_portal', 'live_workshop');
      localStorage.setItem('aimeasy_login_portal_backup', 'live_workshop');
      sessionStorage.setItem('aiiens_live_workshop_auth', '1');
    } catch {}
  }

  function clearLiveWorkshopPortal() {
    try {
      if (sessionStorage.getItem('aimeasy_login_portal') === 'live_workshop') {
        sessionStorage.removeItem('aimeasy_login_portal');
      }
      if (localStorage.getItem('aimeasy_login_portal_backup') === 'live_workshop') {
        localStorage.removeItem('aimeasy_login_portal_backup');
      }
      sessionStorage.removeItem('aiiens_live_workshop_auth');
    } catch {}
  }

  function openLiveWorkshopGoogleSignIn() {
    markLiveWorkshopPortal();
    window.APP = window.APP || {};
    window.APP.role = 'live_workshop';
    window.syncGoogleAuthScreen?.();
    window.showScreen?.('screen-google-auth');
    window.setTimeout(() => window.updateGoogleAuthTermsState?.(), 0);
  }

  window.handleStudentWorkshopBannerClick = async function handleStudentWorkshopBannerClick() {
    if (!hasLiveWorkshopPortalAuth()) {
      openLiveWorkshopGoogleSignIn();
      return;
    }
    await window.openLiveWorkshops?.();
  };

  window.logoutLiveWorkshop = async function logoutLiveWorkshop() {
    stopLiveWorkshopCarousel();
    clearLiveWorkshopPortal();
    liveWorkshopActivePage = 'dashboard';
    try {
      await sb()?.auth?.signOut?.();
    } catch (error) {
      console.warn('[LIVE WORKSHOP] Supabase sign out failed:', error?.message || error);
    }
    window.location.hash = '#/landing';
    window.showScreen?.('screen-landing');
    window.showToast?.('Logged out from Live Workshop', 'green');
  };

  function syncAppProfilePatch(patch) {
    window.APP = window.APP || {};
    window.APP.user = { ...(window.APP.user || {}), ...patch };
    window.updateSidebarProfile?.();
    window.updateDashGreeting?.();
  }

  async function saveProfileInstantly(reason = 'profile-edit') {
    const supabase = sb();
    const id = await userId();
    if (!supabase || !id) return;

    const previous = { ...(window.APP?.user || {}) };
    const universityName = document.getElementById('p-university')?.value?.trim() || null;
    const branchName = document.getElementById('p-branch')?.value?.trim() || null;

    // Resolve IDs locally from the preloaded catalog to avoid triggering catalog refreshes.
    let resolved = {
      university_id: previous.university_id || null,
      university_name: universityName,
      branch_id: previous.branch_id || null,
      branch_name: branchName,
    };

    try {
      const unis = window.__aiiensCatalogUniversities || [];
      const uniMatch = unis.find((u) => String(u?.name || '').trim() === String(universityName || '').trim());
      if (uniMatch) {
        resolved.university_id = uniMatch.id || resolved.university_id;
        resolved.university_name = uniMatch.name || resolved.university_name;
      }

      const branches = window.__aiiensCatalogBranches || [];
      const branchMatch = branches.find((b) => String(b?.name || '').trim() === String(branchName || '').trim());
      if (branchMatch) {
        resolved.branch_id = branchMatch.id || resolved.branch_id;
        resolved.branch_name = branchMatch.name || resolved.branch_name;
      }

      // If local resolution failed and a resolver exists, use it as a fallback (rare).
      if ((!resolved.university_id && universityName) || (!resolved.branch_id && branchName)) {
        if (window.aiiensResolveAcademicSelection) {
          const remote = await window.aiiensResolveAcademicSelection({
            universityName,
            branchName,
            universityId: previous.university_id || null,
            branchId: previous.branch_id || null,
          });
          resolved = { ...resolved, ...remote };
        }
      }
    } catch (e) {
      console.warn('[PROFILE] local resolve failed, falling back:', e?.message || e);
    }

    const patch = {
      id,
      email: previous.email || (await authUser())?.email || null,
      role: previous.role || window.APP?.role || 'student',
      full_name: document.getElementById('p-name')?.value?.trim() || null,
      name: document.getElementById('p-name')?.value?.trim() || null,
      phone: document.getElementById('p-phone')?.value?.trim() || null,
      phone_number: document.getElementById('p-phone')?.value?.trim() || null,
      college: document.getElementById('p-college')?.value?.trim() || null,
      university_id: resolved.university_id || null,
      university_name: resolved.university_name || universityName,
      regulation_code: document.getElementById('p-regulation')?.value?.trim() || null,
      branch_id: resolved.branch_id || null,
      branch_name: resolved.branch_name || branchName,
      year: document.getElementById('p-year')?.value?.trim() || null,
      semester: document.getElementById('p-semester')?.value?.trim() || null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from('profiles').upsert(patch, { onConflict: 'id' });
    if (error) {
      console.warn('[PROFILE] Instant save failed:', error.message || error);
      return;
    }

    syncAppProfilePatch({
      name: patch.name,
      full_name: patch.full_name,
      phone: patch.phone,
      phone_number: patch.phone_number,
      college: patch.college,
      university: patch.university_name,
      university_name: patch.university_name,
      university_id: patch.university_id,
      regulation: patch.regulation_code,
      regulation_code: patch.regulation_code,
      branch: patch.branch_name,
      branch_name: patch.branch_name,
      branch_id: patch.branch_id,
      year: patch.year,
      semester: patch.semester,
    });

    if (reason === 'academic-change') {
      window.buildSemSwitcher?.(patch.semester);
      await window.renderSubjects?.(patch.semester);
      await refreshLearningSummary();
      await loadDashboardSupabaseData();
      window.dispatchEvent(new CustomEvent('aiiens:academic-profile-changed'));
    }
  }

  function installProfileAutosave() {
    const screen = document.getElementById('screen-profile');
    if (!screen || screen.dataset.aiiensAutosaveInstalled) return;
    screen.dataset.aiiensAutosaveInstalled = 'true';

    const card = screen.querySelector('.profile-card');
    const back = screen.querySelector('.aimeasy-profile-back');
    if (back) {
      back.classList.add('profile-settings-back-top');
      back.textContent = 'Back';
    } else if (card) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-ghost btn-sm aimeasy-profile-back profile-settings-back-top';
      btn.textContent = 'Back';
      btn.addEventListener('click', () => window.aimeasySafeBack?.('/student/dashboard', () => window.navigateTo?.('dashboard')));
      card.insertBefore(btn, card.firstChild);
    }

    let timer = null;
    const submitBtn = screen.querySelector('button[onclick*="submitProfile"]');
    const updateSubmitButton = () => {
      if (!submitBtn) return;
      const uni = document.getElementById('p-university')?.value || '';
      const reg = document.getElementById('p-regulation')?.value || '';
      const branch = document.getElementById('p-branch')?.value || '';
      const year = document.getElementById('p-year')?.value || '';
      const sem = document.getElementById('p-semester')?.value || '';
      submitBtn.disabled = !(uni && reg && branch && year && sem);
    };
    const schedule = (reason) => {
      clearTimeout(timer);
      timer = setTimeout(() => saveProfileInstantly(reason), 450);
    };
    ['p-name', 'p-phone', 'p-college', 'p-university', 'p-regulation', 'p-branch'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', () => { schedule('profile-edit'); updateSubmitButton(); });
      el.addEventListener('change', () => { schedule('profile-edit'); updateSubmitButton(); });
    });
    ['p-year', 'p-semester'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('change', () => { schedule('academic-change'); updateSubmitButton(); });
    });
    // Initialize submit button state
    setTimeout(updateSubmitButton, 0);
  }

  const originalShowScreen = window.showScreen;
  window.showScreen = globalThis.showScreen = function showScreenStudentPatch(id, ...args) {
    const result = originalShowScreen?.call(this, id, ...args);
    if (id === 'screen-profile') setTimeout(installProfileAutosave, 0);
    if (id === 'screen-app') setTimeout(() => { touchStreak(); loadDashboardSupabaseData(); }, 0);
    if (id === 'screen-live-workshops') setTimeout(renderLiveWorkshopDashboard, 0);
    return result;
  };

  window.confirmLogout = globalThis.confirmLogout = async function confirmLogoutSessionOnly() {
    window.APP.session = false;
    window.APP.user = null;
    window.APP.calcSemesters = [];
    window.APP.currentSemId = '';
    window.closeLogoutModal?.();
    try {
      await sb()?.auth?.signOut?.();
    } catch (error) {
      console.warn('Supabase signOut failed:', error?.message || error);
    }
    window.showToast?.('Logged out successfully', 'blue');
    const fab = document.getElementById('chat-fab');
    if (fab) fab.style.display = 'none';
    document.getElementById('chat-window')?.classList.remove('open');
    setTimeout(() => window.showScreen?.('screen-landing'), 250);
  };

  async function saveRecentSubjectToDb(subject) {
    const supabase = sb();
    const id = await userId();
    if (!supabase || !id || !subject) return;
    const rawId = String(subject.rawId || subject.id || subject.name || '').replace(/^custom_/, '');
    if (!rawId) return;
    const row = {
      user_id: id,
      subject_id: rawId,
      subject_name: subject.name || 'Subject',
      subject_code: subject.code || null,
      subject_icon: subject.icon || null,
      branch: subject.branch || window.APP?.user?.branch || window.APP?.user?.branch_name || null,
      regulation: subject.reg || subject.regulation || window.APP?.user?.regulation || window.APP?.user?.regulation_code || null,
      semester: subject.sem || subject.semester || window.APP?.user?.semester || null,
      last_opened_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('student_recent_subjects').upsert(row, { onConflict: 'user_id,subject_id' });
    if (error) console.warn('[DASHBOARD] Recent subject save failed:', error.message || error);
    else window.dispatchEvent(new CustomEvent('aiiens:student-dashboard-changed'));
  }
  window.aiiensTrackRecentSubject = saveRecentSubjectToDb;

  const originalAddRecent = window.addToRecentlyOpened || globalThis.addToRecentlyOpened;
  window.addToRecentlyOpened = globalThis.addToRecentlyOpened = function addRecentSupabase(name, code, icon, id) {
    saveRecentSubjectToDb({ id, rawId: id, name, code, icon });
    return originalAddRecent?.apply(this, arguments);
  };

  const originalOpenSubject = window.openSubject || globalThis.openSubject;
  if (typeof originalOpenSubject === 'function') {
    window.openSubject = globalThis.openSubject = async function openSubjectSupabaseTracked(id) {
      const result = await originalOpenSubject.apply(this, arguments);
      if (window.APP?.currentSubject) await saveRecentSubjectToDb(window.APP.currentSubject);
      await touchStreak();
      return result;
    };
  }

  async function saveCgpaFromCalculator() {
    const supabase = sb();
    const id = await userId();
    if (!supabase || !id) return;
    const cgpa = Number(document.getElementById('cgpa-result')?.textContent || document.getElementById('sgpa-result')?.textContent || 0);
    const sgpa = Number(document.getElementById('sgpa-result')?.textContent || 0);
    if (!Number.isFinite(cgpa) || cgpa <= 0) return;
    const { error } = await supabase.from('student_cgpa_results').insert({
      user_id: id,
      semester_key: window.APP?.currentSemId || null,
      sgpa: Number.isFinite(sgpa) ? sgpa : null,
      cgpa,
      percentage: Number(pctFromCgpa(cgpa).toFixed(2)),
      payload: { currentSemId: window.APP?.currentSemId || null, semesters: window.APP?.calcSemesters || [] },
    });
    if (error) console.warn('[DASHBOARD] CGPA save failed:', error.message || error);
    await loadDashboardSupabaseData();
  }

  const originalCalculateGPA = window.calculateGPA || globalThis.calculateGPA;
  if (typeof originalCalculateGPA === 'function') {
    window.calculateGPA = globalThis.calculateGPA = function calculateGpaSupabase() {
      const result = originalCalculateGPA.apply(this, arguments);
      setTimeout(saveCgpaFromCalculator, 0);
      return result;
    };
  }

  async function refreshLearningSummary() {
    const supabase = sb();
    const id = await userId();
    if (!supabase || !id) return null;
    let completedRows = [];
    let completedTopics = 0;
    let totalTopics = 0;
    let unitsCompleted = 0;
    try {
      const { data, error } = await supabase
        .from('student_topic_progress')
        .select('id, subject_key, unit_key, topic_index, topic_id, updated_at')
        .eq('user_id', id)
        .eq('status', 'completed');
      if (error) throw error;
      completedRows = data || [];
      completedTopics = completedRows.length;
    } catch (error) {
      console.warn('[DASHBOARD] Progress count failed:', error?.message || error);
    }
    try {
      let subjectIds = [];
      if (window.aimeasyFetchSubjects) {
        const user = window.APP?.user || {};
        const { data } = await window.aimeasyFetchSubjects({
          semester: user.semester,
          university_name: user.university_name || user.university,
          branch: user.branch_name || user.branch,
          regulation_code: user.regulation_code || user.regulation,
        });
        subjectIds = (data || []).map(row => row.id).filter(Boolean);
      }
      if (subjectIds.length) {
        const { count } = await supabase.from('topics').select('id', { count: 'exact', head: true }).in('subject_id', subjectIds);
        totalTopics = count || 0;
      }
    } catch (error) {
      console.warn('[DASHBOARD] Topic total failed:', error?.message || error);
    }
    try {
      unitsCompleted = await countCompletedUnitsFromProgress(supabase, completedRows);
    } catch (error) {
      console.warn('[DASHBOARD] Completed unit count failed:', error?.message || error);
    }
    totalTopics = Math.max(totalTopics, completedTopics);
    const learningPercentage = totalTopics ? Math.round((completedTopics / totalTopics) * 100) : 0;
    const weekStart = startOfWeek();
    const weeklyRows = completedRows.filter(progress => progress.updated_at && new Date(progress.updated_at) >= weekStart);
    const activeSubjects = new Set(weeklyRows.map(progress => progress.subject_key).filter(Boolean)).size;
    const learningSessions = new Set(weeklyRows.map(progress => {
      const date = new Date(progress.updated_at);
      return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
    }).filter(Boolean)).size;
    const weeklyCompletion = totalTopics ? Math.min(100, Math.round((weeklyRows.length / totalTopics) * 100)) : 0;
    const row = {
      user_id: id,
      total_topics: totalTopics,
      completed_topics: completedTopics,
      completed_videos: completedTopics,
      learning_percentage: learningPercentage,
      updated_at: new Date().toISOString(),
      units_completed: unitsCompleted,
      weekly_completion: weeklyCompletion,
      active_subjects: activeSubjects,
      learning_sessions: learningSessions,
    };
    const { units_completed, ...summaryRow } = row;
    const { error } = await supabase.from('student_learning_summaries').upsert(summaryRow, { onConflict: 'user_id' });
    if (error) console.warn('[DASHBOARD] Learning summary save failed:', error.message || error);
    return row;
  }

  async function countCompletedUnitsFromProgress(supabase, completedRows = []) {
    const topicIds = [...new Set((completedRows || []).map(row => row.topic_id).filter(Boolean))];
    if (!topicIds.length) {
      return new Set((completedRows || []).map(row => `${row.subject_key}:${row.unit_key}`).filter(Boolean)).size;
    }
    const { data: completedTopics, error: completedError } = await supabase
      .from('topics')
      .select('id, unit_id')
      .in('id', topicIds);
    if (completedError) throw completedError;
    const completedByUnit = new Map();
    (completedTopics || []).forEach((topic) => {
      const unitId = topic.unit_id;
      if (!unitId) return;
      if (!completedByUnit.has(unitId)) completedByUnit.set(unitId, new Set());
      completedByUnit.get(unitId).add(topic.id);
    });
    const unitIds = [...completedByUnit.keys()];
    if (!unitIds.length) return 0;
    const { data: unitTopics, error: totalError } = await supabase
      .from('topics')
      .select('id, unit_id')
      .in('unit_id', unitIds);
    if (totalError) throw totalError;
    const totalByUnit = new Map();
    (unitTopics || []).forEach((topic) => {
      if (!topic.unit_id) return;
      totalByUnit.set(topic.unit_id, (totalByUnit.get(topic.unit_id) || 0) + 1);
    });
    return unitIds.filter((unitId) => {
      const total = totalByUnit.get(unitId) || 0;
      const completed = completedByUnit.get(unitId)?.size || 0;
      return total > 0 && completed >= total;
    }).length;
  }

  const originalMarkTopicCompleted = window.markTopicCompleted || globalThis.markTopicCompleted;
  if (typeof originalMarkTopicCompleted === 'function') {
    window.markTopicCompleted = globalThis.markTopicCompleted = function markTopicCompletedSupabase() {
      const result = originalMarkTopicCompleted.apply(this, arguments);
      setTimeout(() => { refreshLearningSummary(); touchStreak(); loadDashboardSupabaseData(); }, 0);
      return result;
    };
  }

  async function touchStreak() {
    const supabase = sb();
    const id = await userId();
    if (!supabase || !id) return null;
    const today = todayKeyDb();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = todayKeyDb(yesterday);
    const { data } = await supabase.from('student_streaks').select('*').eq('user_id', id).maybeSingle();
    let current = Number(data?.current_streak || 0);
    let missed = false;
    if (data?.last_active_date === today) {
      missed = false;
    } else if (data?.last_active_date === yesterdayKey) {
      current += 1;
    } else {
      missed = Boolean(data?.last_active_date);
      current = 1;
    }
    const best = Math.max(current, Number(data?.best_streak || 0));
    const row = { user_id: id, current_streak: current, best_streak: best, last_active_date: today, missed_yesterday: missed, updated_at: new Date().toISOString() };
    const { error } = await supabase.from('student_streaks').upsert(row, { onConflict: 'user_id' });
    if (error) console.warn('[DASHBOARD] Streak save failed:', error.message || error);
    renderStreak(row);
    return row;
  }

  function renderStreak(row) {
    const card = document.querySelector('#page-dashboard .streak-card');
    const metric = document.querySelector('#page-dashboard .metric-card.lavender .metric-val');
    const trend = document.querySelector('#page-dashboard .metric-card.lavender .metric-trend');
    if (metric) metric.textContent = String(row?.current_streak || 0);
    if (trend) trend.textContent = row?.missed_yesterday ? 'You missed your streak yesterday.' : `Current Streak = ${row?.current_streak || 0} Days`;
    if (!card || !row) return;
    card.innerHTML = `
      <div class="compact-streak-card">
        <div>
          <div class="compact-kicker">Current Streak</div>
          <div class="compact-streak-value">Day ${esc(row.current_streak || 0)}</div>
        </div>
        <div class="compact-streak-meta">
          <span>Current Streak = <strong>${esc(row.current_streak || 0)} Days</strong></span>
          <span>Best: <strong>${esc(row.best_streak || 0)} Days</strong></span>
          ${row.missed_yesterday ? '<span class="streak-missed">You missed your streak yesterday.</span>' : ''}
        </div>
      </div>`;
  }

  function normalizeWorkshopBanners(rows = []) {
    const seen = new Set();
    return (rows || []).filter((banner) => {
      const image = banner?.banner_image || banner?.image_url || banner?.banner_url || '';
      const title = banner?.banner_title || banner?.title || '';
      const key = banner?.id || `${image}:${title}`;
      if (!image || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async function loadActiveWorkshopBanners() {
    const supabase = sb();
    if (!supabase) return [];
    try {
      const { data, error } = await supabase
        .from('live_workshop_banners')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      if (error) {
        console.warn('[DASHBOARD] Live workshop banners load failed:', error.message || error);
        return [];
      }
      return normalizeWorkshopBanners(data || []);
    } catch (error) {
      console.warn('[DASHBOARD] Live workshop banners load crashed:', error?.message || error);
      return [];
    }
  }

  function studentWorkshopBannerSlide(banner, index) {
    const image = banner?.banner_image || banner?.image_url || banner?.banner_url || '';
    const title = banner?.banner_title || banner?.title || 'Live Workshop';
    const subtitle = banner?.banner_subtitle || banner?.subtitle || 'Join expert-led live sessions';
    return `
      <button class="student-workshop-carousel-slide ${index === 0 ? 'active' : ''}" type="button" data-student-banner-index="${index}" onclick="handleStudentWorkshopBannerClick()" ${image ? `style="background-image:url('${esc(image)}')"` : ''}>
        <span>${esc(title)}</span>
        <strong>${esc(subtitle)}</strong>
      </button>`;
  }

  function updateStudentWorkshopCarousel() {
    const slides = Array.from(document.querySelectorAll('.student-workshop-carousel-slide'));
    if (!slides.length) return;
    studentWorkshopCarouselIndex = ((studentWorkshopCarouselIndex % slides.length) + slides.length) % slides.length;
    slides.forEach((slide, index) => {
      slide.classList.toggle('active', index === studentWorkshopCarouselIndex);
      slide.style.transform = `translateX(${(index - studentWorkshopCarouselIndex) * 100}%)`;
    });
  }

  function stopStudentWorkshopCarousel() {
    if (studentWorkshopCarouselTimer) {
      window.clearInterval(studentWorkshopCarouselTimer);
      studentWorkshopCarouselTimer = null;
    }
  }

  function startStudentWorkshopCarousel(count) {
    stopStudentWorkshopCarousel();
    studentWorkshopCarouselIndex = 0;
    updateStudentWorkshopCarousel();
    if (count > 1) {
      studentWorkshopCarouselTimer = window.setInterval(() => {
        window.moveStudentWorkshopCarousel(1);
      }, 3000);
    }
  }

  window.moveStudentWorkshopCarousel = function moveStudentWorkshopCarousel(delta) {
    const slides = document.querySelectorAll('.student-workshop-carousel-slide');
    if (!slides.length) return;
    studentWorkshopCarouselIndex = (studentWorkshopCarouselIndex + Number(delta || 0) + slides.length) % slides.length;
    updateStudentWorkshopCarousel();
  };

  async function renderStudentDashboardWorkshopCarousel() {
    const root = document.getElementById('student-workshop-carousel');
    const track = document.getElementById('student-workshop-carousel-track');
    if (!root || !track) return;
    const renderToken = ++studentWorkshopRenderToken;
    stopStudentWorkshopCarousel();
    const banners = await loadActiveWorkshopBanners();
    if (renderToken !== studentWorkshopRenderToken) return;
    if (!banners.length) {
      track.innerHTML = '<div class="student-workshop-carousel-empty">Live workshop banners will appear here.</div>';
      root.querySelectorAll('.student-carousel-arrow').forEach((button) => button.remove());
      return;
    }
    track.innerHTML = banners.map((banner, index) => studentWorkshopBannerSlide(banner, index)).join('');
    root.querySelectorAll('.student-carousel-arrow').forEach((button) => button.remove());
    if (banners.length > 1) {
      root.insertAdjacentHTML('beforeend', `
        <button class="student-carousel-arrow left" type="button" onclick="moveStudentWorkshopCarousel(-1)" aria-label="Previous banner">‹</button>
        <button class="student-carousel-arrow right" type="button" onclick="moveStudentWorkshopCarousel(1)" aria-label="Next banner">›</button>
      `);
    }
    startStudentWorkshopCarousel(banners.length);
  }

  async function loadDashboardSupabaseData() {
    if (document.getElementById('page-dashboard')?.style.display === 'none') return;
    const supabase = sb();
    const id = await userId();
    if (!supabase || !id) return;
    if (!window.__aiiensStudentProgressChannel) {
      window.__aiiensStudentProgressChannel = supabase.channel(`student-dashboard-progress-${id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'student_topic_progress', filter: `user_id=eq.${id}` }, () => {
          if (document.getElementById('page-dashboard')?.style.display !== 'none') loadDashboardSupabaseData();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'student_recent_subjects', filter: `user_id=eq.${id}` }, () => {
          if (document.getElementById('page-dashboard')?.style.display !== 'none') loadDashboardSupabaseData();
        })
        .subscribe?.();
    }
    let summary = null;
    let recentSubjects = [];
    let streak = null;
    subscribeLiveWorkshopUpdates();
    renderStudentDashboardWorkshopCarousel();
    try {
      const { data } = await supabase.from('student_cgpa_results').select('*').eq('user_id', id).order('calculated_at', { ascending: false }).limit(1);
      const latest = data?.[0];
      const cgpaEl = document.querySelector('#page-dashboard .metric-card.blue .metric-val');
      const cgpaTrend = document.querySelector('#page-dashboard .metric-card.blue .metric-trend');
      if (latest && cgpaEl) cgpaEl.textContent = Number(latest.cgpa).toFixed(2);
      if (latest && cgpaTrend) cgpaTrend.textContent = `${Number(latest.percentage).toFixed(2)}% latest percentage`;
    } catch (error) {
      console.warn('[DASHBOARD] CGPA load failed:', error?.message || error);
    }
    try {
      summary = await refreshLearningSummary();
      const progressEl = document.querySelector('#page-dashboard .metric-card.teal .metric-val');
      const progressTrend = document.querySelector('#page-dashboard .metric-card.teal .metric-trend');
      if (summary && progressEl) progressEl.textContent = `${summary.learning_percentage}%`;
      if (summary && progressTrend) progressTrend.textContent = `${summary.completed_topics} topics, ${summary.completed_videos} videos completed`;
      const tracker = document.querySelector('#page-dashboard .progress-tracker');
      if (summary && tracker) {
        tracker.innerHTML = `
          <div class="section-heading">Learning Progress</div>
          <div class="weekly-summary compact-weekly-summary">
            <div><strong>${esc(summary.weekly_completion || 0)}%</strong><span>Weekly Completion</span></div>
            <div><strong>${esc(summary.units_completed || 0)}</strong><span>Units Completed</span></div>
            <div><strong>${esc(summary.active_subjects || 0)}</strong><span>Active Subjects</span></div>
            <div><strong>${esc(summary.learning_sessions || 0)}</strong><span>Learning Sessions</span></div>
          </div>
          <div class="weekly-mini-progress" role="progressbar" aria-label="Overall learning completion" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${esc(summary.learning_percentage)}"><span style="width:${Math.max(0, Math.min(100, Number(summary.learning_percentage) || 0))}%"></span></div>`;
      }
    } catch (error) {
      console.warn('[DASHBOARD] Learning summary load failed:', error?.message || error);
    }
    try {
      const { data } = await supabase.from('student_recent_subjects').select('*').eq('user_id', id).order('last_opened_at', { ascending: false }).limit(5);
      recentSubjects = data || [];
      const listEl = document.getElementById('recently-opened-list') || document.querySelector('#page-dashboard .dash-row-3 .card');
      if (listEl) {
        listEl.innerHTML = `<div class="section-heading">Recently Opened</div>` + (recentSubjects.length ? recentSubjects.map(item => `
          <div class="recent-item">
            <div class="recent-info">
              <div class="recent-title">${esc(item.subject_name)}</div>
              <div class="recent-sub">${esc([item.subject_code || 'Subject', item.branch].filter(Boolean).join(' · '))} · ${esc(formatRecentTime(item.last_opened_at))}</div>
            </div>
            <button class="btn btn-primary btn-sm" onclick="openSubjectFromRecent('${js(String(item.subject_id).includes('-') ? 'custom_' + item.subject_id : item.subject_id)}')">Continue Learning</button>
          </div>`).join('') : '<div class="empty-state-card">No subjects opened yet.</div>');
      }
    } catch (error) {
      console.warn('[DASHBOARD] Recent subjects load failed:', error?.message || error);
    }
    try {
      const { data } = await supabase.from('student_streaks').select('*').eq('user_id', id).maybeSingle();
      streak = data || null;
      if (streak) renderStreak(streak);
    } catch (error) {
      console.warn('[DASHBOARD] Streak load failed:', error?.message || error);
    }
    renderSupabaseAchievements({ summary, recentSubjects, streak });
  }

  function renderSupabaseAchievements({ summary, recentSubjects, streak }) {
    const achievementsEl = document.getElementById('achievements-list');
    if (!achievementsEl) return;
    const unitsCompleted = Number(summary?.units_completed || 0);
    const videosCompleted = Number(summary?.completed_videos || 0);
    const streakDays = Math.max(Number(streak?.current_streak || 0), Number(streak?.best_streak || 0));
    const items = [
      { label: 'First Subject Opened', icon: '📖', earned: (recentSubjects || []).length >= 1 },
      { label: 'First Unit Completed', icon: '✓', earned: unitsCompleted >= 1 },
      { label: '5 Units Completed', icon: '⚡', earned: unitsCompleted >= 5 },
      { label: '10 Units Completed', icon: '★', earned: unitsCompleted >= 10 },
      { label: '7-Day Streak', icon: '🔥', earned: streakDays >= 7 },
      { label: '30-Day Streak', icon: '♛', earned: streakDays >= 30 },
      { label: '100 Videos Watched', icon: '▶', earned: videosCompleted >= 100 },
    ];
    achievementsEl.innerHTML = items.map(item => `
      <div class="achievement-card ${item.earned ? 'earned' : 'locked'}">
        <div class="achievement-icon">${esc(item.earned ? item.icon : 'Lock')}</div>
        <div>${esc(item.label)}</div>
        <div class="achievement-progress"><span style="width:${item.earned ? 100 : 25}%"></span></div>
      </div>
    `).join('');
  }

  window.aiiensLoadStudentDashboard = loadDashboardSupabaseData;
  window.addEventListener('aiiens:student-progress-changed', () => {
    if (document.getElementById('page-dashboard')?.style.display !== 'none') loadDashboardSupabaseData();
  });
  window.addEventListener('aiiens:student-dashboard-changed', () => {
    if (document.getElementById('page-dashboard')?.style.display !== 'none') loadDashboardSupabaseData();
  });

  const originalNavigateTo = window.navigateTo || globalThis.navigateTo;
  if (typeof originalNavigateTo === 'function') {
    window.navigateTo = globalThis.navigateTo = function navigateToSupabase(page) {
      const result = originalNavigateTo.apply(this, arguments);
      if (page === 'dashboard') setTimeout(() => { touchStreak(); loadDashboardSupabaseData(); }, 0);
      else stopStudentWorkshopCarousel();
      return result;
    };
  }

  function ensureLiveWorkshopSurfaces() {
    const appShell = document.querySelector('.aimeasy-app');
    const footer = appShell?.querySelector('.site-footer');
    const leakedScreen = document.body.querySelector(':scope > #screen-live-workshops');
    if (appShell && leakedScreen) {
      appShell.insertBefore(leakedScreen, footer || null);
    }
    const roleCards = document.querySelector('.role-cards');
    if (roleCards && !document.getElementById('role-live-workshops')) {
      roleCards.insertAdjacentHTML('beforeend', `
        <div class="role-card live-workshops" id="role-live-workshops" onclick="openLiveWorkshops()">
          <div class="role-icon">Live</div>
          <div class="role-label">Live Workshops</div>
          <div class="role-desc">Join expert-led live sessions</div>
        </div>`);
    }
    const statsRow = document.querySelector('#screen-landing .stats-row');
    if (statsRow && !document.getElementById('stat-workshop-participants')) {
      statsRow.insertAdjacentHTML('beforeend', `
        <div class="stat-item">
          <div class="stat-num" id="stat-workshop-participants">0</div>
          <div class="stat-label">Total Workshop Participants</div>
        </div>`);
      window.updateLandingStats?.();
    }
    if (!document.getElementById('screen-live-workshops')) {
      const host = appShell || document.body;
      const position = appShell && footer ? 'beforebegin' : 'beforeend';
      const html = `
        <div class="screen live-workshop-screen" id="screen-live-workshops">
          ${false ? `<div class="sidebar-backdrop" id="live-workshop-sidebar-backdrop" onclick="closeLiveWorkshopSidebar()"></div>
          <aside class="sidebar live-workshop-sidebar" id="live-workshop-sidebar">
            <div class="sidebar-header">
              <div class="sidebar-logo">
                <div class="logo-icon" style="width:32px;height:32px;">A</div>
                <span class="sidebar-logo-text">AIIENS <span>Live</span></span>
              </div>
              <button class="sidebar-close-btn" onclick="closeLiveWorkshopSidebar()" aria-label="Close menu">×</button>
            </div>
            <nav class="sidebar-nav">
              <div class="nav-section-label">Live Workshop</div>
              <div class="nav-item active" id="live-nav-dashboard" onclick="switchLiveWorkshopPage('dashboard');closeLiveWorkshopSidebar()">
                <span class="nav-icon">🏠</span><span class="nav-label">Dashboard</span>
              </div>
              <div class="nav-item" id="live-nav-skillup" onclick="switchLiveWorkshopPage('skillup');closeLiveWorkshopSidebar()">
                <span class="nav-icon">🎓</span><span class="nav-label">SkillUp Courses</span>
              </div>
            </nav>
            <div class="sidebar-footer">
              <div class="nav-item" onclick="logoutLiveWorkshop()" style="color:var(--red);">
                <span class="nav-icon">ðŸšª</span><span class="nav-label">Logout</span>
              </div>
            </div>
          </aside>` : ''}
          <main class="main live-workshop-main">
            <header class="topbar live-workshop-topbar">
              <div class="topbar-left">
                ${false ? `<button class="hamburger-btn" onclick="toggleLiveWorkshopSidebar()" aria-label="Open menu">
                  <span></span><span></span><span></span>
                </button>` : ''}
                <div class="live-workshop-brand" aria-label="AIIENS EDU"><span>A</span><strong>AIIENS EDU</strong></div>
                <div>
                  <div class="page-title" id="live-workshop-title">Dashboard</div>
                  <div class="breadcrumb">Live Workshops / <span id="live-workshop-breadcrumb">Dashboard</span></div>
                </div>
              </div>
              <div class="live-workshop-topbar-actions">
                <button class="btn btn-ghost active" id="live-topnav-dashboard" onclick="switchLiveWorkshopPage('dashboard')">Workshops</button>
                <button class="btn btn-ghost" id="live-topnav-skillup" onclick="switchLiveWorkshopPage('skillup')">Courses</button>
                <button class="btn btn-ghost" onclick="logoutLiveWorkshop()">Logout</button>
              </div>
            </header>
            <div class="page-content live-workshop-content-wrap">
              <div id="live-workshop-content"></div>
            </div>
          </main>
        </div>`;
      if (appShell && footer) footer.insertAdjacentHTML(position, html);
      else host.insertAdjacentHTML(position, html);
    }
    const adminNav = document.querySelector('#screen-admin nav');
    if (adminNav && !document.getElementById('admin-nav-liveworkshops')) {
      adminNav.insertAdjacentHTML('beforeend', `
        <div class="admin-nav-item" id="admin-nav-liveworkshops" onclick="switchAdminSection('liveworkshops')">
          <span>Live</span> Live Workshops
        </div>`);
    }
  }

  window.toggleLiveWorkshopSidebar = function toggleLiveWorkshopSidebar() {
    document.getElementById('live-workshop-sidebar')?.classList.toggle('open');
    document.getElementById('live-workshop-sidebar-backdrop')?.classList.toggle('open');
  };

  window.closeLiveWorkshopSidebar = function closeLiveWorkshopSidebar() {
    document.getElementById('live-workshop-sidebar')?.classList.remove('open');
    document.getElementById('live-workshop-sidebar-backdrop')?.classList.remove('open');
  };

  window.switchLiveWorkshopPage = async function switchLiveWorkshopPage(page = 'dashboard') {
    liveWorkshopActivePage = page === 'skillup' ? 'skillup' : 'dashboard';
    document.getElementById('live-nav-dashboard')?.classList.toggle('active', liveWorkshopActivePage === 'dashboard');
    document.getElementById('live-nav-skillup')?.classList.toggle('active', liveWorkshopActivePage === 'skillup');
    document.getElementById('live-topnav-dashboard')?.classList.toggle('active', liveWorkshopActivePage === 'dashboard');
    document.getElementById('live-topnav-skillup')?.classList.toggle('active', liveWorkshopActivePage === 'skillup');
    const label = liveWorkshopActivePage === 'skillup' ? 'SkillUp Courses' : 'Dashboard';
    const title = document.getElementById('live-workshop-title');
    const breadcrumb = document.getElementById('live-workshop-breadcrumb');
    if (title) title.textContent = label;
    if (breadcrumb) breadcrumb.textContent = label;
    await renderLiveWorkshopDashboard();
  };

  window.openLiveWorkshops = async function openLiveWorkshops() {
    ensureLiveWorkshopSurfaces();
    const user = await authUser();
    if (!user) {
      if (!sb()) {
        window.showToast?.('Google login is not configured.', 'red');
        return;
      }
      openLiveWorkshopGoogleSignIn();
      return;
    }
    try {
      markLiveWorkshopPortal();
      window.APP = window.APP || {};
      window.APP.role = 'live_workshop';
    } catch {}
    window.showScreen?.('screen-live-workshops');
    await renderLiveWorkshopDashboard();
  };

  async function loadWorkshopRegistration() {
    const supabase = sb();
    const user = await authUser();
    const id = user?.id || await userId();
    if (!supabase || !id) return null;
    const { data, error } = await supabase
      .from('live_workshop_registrations')
      .select('*')
      .eq('user_id', id)
      .is('workshop_id', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) console.warn('[LIVE WORKSHOP] Registration load failed:', error.message || error);
    return data || null;
  }

  function subscribeLiveWorkshopUpdates() {
    const supabase = sb();
    if (!supabase || liveWorkshopChannel) return;
    liveWorkshopChannel = supabase.channel('live-workshop-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_workshops' }, () => {
        if (document.getElementById('screen-live-workshops')?.classList.contains('active')) renderLiveWorkshopDashboard();
        if (document.getElementById('admin-nav-liveworkshops')?.classList.contains('active')) loadAdminLiveWorkshopList();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_workshop_banners' }, () => {
        if (document.getElementById('page-dashboard')?.style.display !== 'none') renderStudentDashboardWorkshopCarousel();
        if (document.getElementById('screen-live-workshops')?.classList.contains('active')) renderLiveWorkshopDashboard();
        if (document.getElementById('admin-nav-liveworkshops')?.classList.contains('active')) loadAdminLiveBannerList();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_workshop_registrations' }, () => {
        window.updateLandingStats?.();
        if (document.getElementById('screen-live-workshops')?.classList.contains('active')) renderLiveWorkshopDashboard();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'content_items' }, () => {
        if (document.getElementById('screen-live-workshops')?.classList.contains('active') && liveWorkshopActivePage === 'skillup') {
          renderLiveWorkshopDashboard();
        }
      })
      .subscribe?.();
  }

  async function renderLiveWorkshopDashboard() {
    ensureLiveWorkshopSurfaces();
    const root = document.getElementById('live-workshop-content');
    if (!root) return;
    const user = await authUser();
    if (!user) {
      root.innerHTML = `
        <section class="live-workshop-form">
          <h2>Continue with Google</h2>
          <p class="live-section-copy">Select your Google account to continue to the Live Workshop dashboard.</p>
          <button class="btn btn-primary" type="button" onclick="openLiveWorkshops()">Continue with Google</button>
        </section>`;
      return;
    }
    subscribeLiveWorkshopUpdates();
    if (liveWorkshopActivePage === 'skillup') {
      await renderLiveWorkshopSkillUp(root);
    } else {
      await renderPublishedWorkshops(root);
    }
  }

  window.submitLiveWorkshopProfile = async function submitLiveWorkshopProfile() {
    const supabase = sb();
    const id = await userId();
    if (!supabase || !id) return;
    const nameVal = document.getElementById('lw-name')?.value?.trim() || '';
    const mobileVal = document.getElementById('lw-mobile')?.value?.trim() || '';
    const role = document.getElementById('lw-role')?.value || 'student';
    const collegeVal = document.getElementById('lw-college')?.value?.trim() || '';

    if (!nameVal) {
      window.showToast?.('Name is required', 'red');
      return;
    }
    if (!/^[0-9]{10}$/.test(mobileVal)) {
      window.showToast?.('Enter a valid 10-digit mobile number', 'red');
      return;
    }
    if (role === 'student' && !collegeVal) {
      window.showToast?.('College name is required for student role', 'red');
      return;
    }

    const row = {
      user_id: id,
      name: nameVal,
      mobile_number: mobileVal,
      role_type: role,
      college_name: role === 'student' ? collegeVal : null,
      created_at: new Date().toISOString(),
    };

    const existing = await supabase
      .from('live_workshop_registrations')
      .select('id')
      .eq('user_id', id)
      .is('workshop_id', null)
      .limit(1)
      .maybeSingle();
    if (existing.error) {
      console.warn('[LIVE WORKSHOP] Existing registration check failed:', existing.error.message || existing.error);
      window.showToast?.('Could not verify workshop registration. Please try again.', 'red');
      return;
    }
    const request = existing.data?.id
      ? supabase.from('live_workshop_registrations').update(row).eq('id', existing.data.id)
      : supabase.from('live_workshop_registrations').insert(row);
    const { error } = await request;
    if (error) {
      window.showToast?.('Could not save workshop profile: ' + error.message, 'red');
      return;
    }
    try {
      sessionStorage.setItem('aiiens_live_workshop_auth', '1');
      sessionStorage.setItem('aimeasy_login_portal', 'live_workshop');
    } catch {}
    window.showToast?.('Workshop profile saved', 'green');
    window.updateLandingStats?.();
    await renderLiveWorkshopDashboard();
  };

  function liveWorkshopBannerSlide(banner, index) {
    const image = banner?.banner_image || banner?.image_url || banner?.banner_url || '';
    const title = banner?.banner_title || banner?.title || 'Live Workshops';
    const subtitle = banner?.banner_subtitle || banner?.subtitle || 'Upcoming expert sessions';
    return `
      <article class="live-workshop-carousel-slide ${index === 0 ? 'active' : ''}" data-live-banner-index="${index}" ${image ? `style="background-image:url('${esc(image)}')"` : ''}>
        <div class="live-workshop-carousel-copy">
          <span>${esc(title)}</span>
          <h1>${esc(subtitle)}</h1>
        </div>
      </article>`;
  }

  function updateLiveWorkshopCarousel() {
    const slides = Array.from(document.querySelectorAll('.live-workshop-carousel-slide'));
    if (!slides.length) return;
    liveWorkshopCarouselIndex = ((liveWorkshopCarouselIndex % slides.length) + slides.length) % slides.length;
    slides.forEach((slide, index) => {
      slide.classList.toggle('active', index === liveWorkshopCarouselIndex);
      slide.style.transform = `translateX(${(index - liveWorkshopCarouselIndex) * 100}%)`;
    });
  }

  function stopLiveWorkshopCarousel() {
    if (liveWorkshopCarouselTimer) {
      window.clearInterval(liveWorkshopCarouselTimer);
      liveWorkshopCarouselTimer = null;
    }
  }

  function startLiveWorkshopCarousel(count) {
    stopLiveWorkshopCarousel();
    liveWorkshopCarouselIndex = 0;
    updateLiveWorkshopCarousel();
    if (count > 1) {
      liveWorkshopCarouselTimer = window.setInterval(() => {
        window.moveLiveWorkshopCarousel(1);
      }, 3000);
    }
  }

  window.moveLiveWorkshopCarousel = function moveLiveWorkshopCarousel(delta) {
    const slides = document.querySelectorAll('.live-workshop-carousel-slide');
    if (!slides.length) return;
    liveWorkshopCarouselIndex = (liveWorkshopCarouselIndex + Number(delta || 0) + slides.length) % slides.length;
    updateLiveWorkshopCarousel();
  };

  async function loadLiveWorkshopSkillUpItems() {
    const supabase = sb();
    let contentItems = [];
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('content_items')
          .select('*')
          .order('created_at', { ascending: false });
        if (!error) contentItems = data || [];
      } catch (error) {
        console.warn('[LIVE WORKSHOP] SkillUp content load failed:', error?.message || error);
      }
    }
    return { contentItems };
  }

  async function renderLiveWorkshopSkillUp(root) {
    const supabase = sb();
    const renderToken = ++liveWorkshopRenderToken;
    stopLiveWorkshopCarousel();
    const { contentItems } = await loadLiveWorkshopSkillUpItems();
    const skills = [];
    const skillVideos = [];
    const skillNotes = [];
    let banners = await loadActiveWorkshopBanners();
    let workshops = [];
    let registrations = [];
    if (supabase) {
      const { data: workshopRows, error: workshopError } = await supabase
        .from('live_workshops')
        .select('*')
        .eq('status', 'published')
        .order('workshop_date', { ascending: true });
      if (workshopError) console.warn('[LIVE WORKSHOP] SkillUp workshop load failed:', workshopError.message || workshopError);
      workshops = workshopRows || [];
      const user = await authUser();
      if (user?.id) {
        const { data: regRows, error: regError } = await supabase
          .from('live_workshop_registrations')
          .select('*')
          .eq('user_id', user.id);
        if (regError) console.warn('[LIVE WORKSHOP] SkillUp registration load failed:', regError.message || regError);
        registrations = regRows || [];
      }
    }
    if (renderToken !== liveWorkshopRenderToken) return;
    const registeredIds = new Set((registrations || []).map(row => row.workshop_id).filter(Boolean));
    const registeredWorkshops = workshops.filter(row => registeredIds.has(row.id));
    const upcomingWorkshops = workshops.filter(row => !registeredIds.has(row.id));
    if (!banners.length) {
      const fallback = workshops.find(row => row.banner_image);
      banners = [{
        id: 'skillup-fallback-banner',
        banner_image: fallback?.banner_image || '',
        banner_title: 'SkillUp Workshops',
        banner_subtitle: 'Build practical skills with published sessions and courses',
      }];
    }
    const contentByCourse = new Map();
    (contentItems || []).filter(isSkillUpContentItem).forEach((item) => {
      let meta = item.metadata || {};
      if (typeof meta === 'string') {
        try { meta = JSON.parse(meta); } catch { meta = {}; }
      }
      const key = meta.courseId || meta.course_id || meta.skillId || meta.skill_id || meta.course || meta.skill || item.subject_id || item.created_by || item.id;
      if (!contentByCourse.has(key)) contentByCourse.set(key, []);
      contentByCourse.get(key).push({ ...item, metadata: meta });
    });
    const contentCards = Array.from(contentByCourse.entries()).map(([key, items], index) => {
      const first = items[0] || {};
      const videos = items.filter((item) => item.content_type === 'video');
      const notes = items.filter((item) => ['note', 'pdf'].includes(item.content_type));
      return {
        id: `content-${key}`,
        name: first.metadata?.course || first.metadata?.skill || first.title || 'SkillUp Content',
        description: first.body || first.description || '',
        category: first.metadata?.category || 'SkillUp',
        level: first.metadata?.level || 'Self-paced',
        icon: '📚',
        duration: first.metadata?.duration || 'Self-paced',
        videos: videos.length,
        notes: notes.length,
        createdBy: first.created_by || 'Admin/Sub Admin',
        index,
      };
    });
    const localCards = (skills || []).map((skill, index) => ({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      category: skill.category || 'SkillUp',
      level: skill.level || 'Beginner',
      icon: skill.icon || '⚡',
      duration: skill.duration || 'Self-paced',
      videos: skillVideos.filter(v => v.skillId == skill.id).length,
      notes: skillNotes.filter(n => n.skillId == skill.id).length,
      index,
    }));
    const cards = contentCards;
    root.innerHTML = `
      <div class="live-skillup-page">
        <section class="live-workshop-carousel live-skillup-banner" aria-label="SkillUp workshop banners">
          <div class="live-workshop-carousel-track" id="live-workshop-carousel-track">
            ${banners.map((banner, index) => liveWorkshopBannerSlide(banner, index)).join('')}
          </div>
          ${banners.length > 1 ? `
            <button class="live-carousel-arrow left" type="button" onclick="moveLiveWorkshopCarousel(-1)" aria-label="Previous banner">‹</button>
            <button class="live-carousel-arrow right" type="button" onclick="moveLiveWorkshopCarousel(1)" aria-label="Next banner">›</button>
          ` : ''}
        </section>
        <section class="live-workshop-section">
          <div class="section-heading">Registered Workshops</div>
          <div class="live-workshop-scroll-row" aria-label="Registered workshops">
            ${registeredWorkshops.length ? registeredWorkshops.map((row) => workshopCard(row, 'registered')).join('') : '<div class="empty-state-card live-scroll-empty">No registered workshops yet.</div>'}
          </div>
        </section>
        <section class="live-workshop-section">
          <div class="section-heading">Upcoming Workshops</div>
          <div class="live-workshop-scroll-row" aria-label="Upcoming workshops">
            ${upcomingWorkshops.length ? upcomingWorkshops.map((row) => workshopCard(row, 'upcoming')).join('') : '<div class="empty-state-card live-scroll-empty">Upcoming workshops available soon.</div>'}
          </div>
        </section>
      <section class="live-workshop-section">
        <div class="section-heading">📚 SkillUp Courses</div>
        <div class="live-skillup-grid">
          ${cards.length ? cards.map(skillUpCard).join('') : '<div class="empty-state-card">SkillUp courses will appear here as soon as Admin or SubAdmin publishes content.</div>'}
        </div>
      </section>
      </div>`;
    enableSkillUpHorizontalScrolling(root);
    startLiveWorkshopCarousel(banners.length);
  }

  function skillUpCard(card) {
    return `
      <article class="subject-card live-skillup-card" style="animation-delay:${(card.index || 0) * 0.06}s">
        <div class="subject-card-header">
          <div class="subject-icon">${esc(card.icon || '📚')}</div>
          <div class="subject-name">${esc(card.name)}</div>
          <div class="subject-code">${esc(card.category)} · ${esc(card.level)}</div>
        </div>
        <div class="subject-card-body">
          <div class="subject-meta">
            <span class="badge badge-teal">${Number(card.videos || 0)} Videos</span>
            <span class="badge badge-lavender">${Number(card.notes || 0)} PDFs/Notes</span>
            <span class="badge badge-primary">${esc(card.duration)}</span>
          </div>
          <p style="font-size:0.78rem;color:var(--text2);margin:8px 0;">${esc(card.description || '')}</p>
          <p style="font-size:0.72rem;color:var(--text3);margin:0;">Published by ${esc(card.createdBy || 'Admin/Sub Admin')}</p>
          <div class="progress-bar" style="margin-top:8px;"><div class="progress-fill" style="width:0%;"></div></div>
        </div>
      </article>`;
  }

  async function renderPublishedWorkshops(root) {
    const supabase = sb();
    const renderToken = ++liveWorkshopRenderToken;
    stopLiveWorkshopCarousel();
    let banners = await loadActiveWorkshopBanners();
    let { data, error } = await supabase.from('live_workshops').select('*').eq('status', 'published').order('workshop_date', { ascending: true });
    if (error) {
      root.innerHTML = `<div class="empty-state-card">Could not load workshops: ${esc(error.message)}</div>`;
      return;
    }
    if (renderToken !== liveWorkshopRenderToken) return;
    const user = await authUser();
    let registrations = [];
    try {
      const { data: regData, error: regError } = await supabase
        .from('live_workshop_registrations')
        .select('*')
        .eq('user_id', user?.id || '');
      if (!regError) registrations = regData || [];
    } catch (regError) {
      console.warn('[LIVE WORKSHOP] Registered workshop load failed:', regError?.message || regError);
    }
    const registeredIds = new Set(
      (registrations || [])
        .map((row) => row.workshop_id)
        .filter(Boolean),
    );
    const allWorkshops = data || [];
    const registeredWorkshops = allWorkshops.filter((row) => registeredIds.has(row.id));
    const upcomingWorkshops = allWorkshops.filter((row) => !registeredIds.has(row.id));
    const { contentItems } = await loadLiveWorkshopSkillUpItems();
    const courseGroups = new Map();
    (contentItems || []).filter(isSkillUpContentItem).forEach((item) => {
      let meta = item.metadata || {};
      if (typeof meta === 'string') {
        try { meta = JSON.parse(meta); } catch { meta = {}; }
      }
      const key = meta.courseId || meta.course_id || meta.skillId || meta.skill_id || meta.course || meta.skill || item.id;
      if (!courseGroups.has(key)) courseGroups.set(key, []);
      courseGroups.get(key).push({ ...item, metadata: meta });
    });
    const courseCards = Array.from(courseGroups.entries()).map(([key, items], index) => {
      const first = items[0] || {};
      return {
        id: key,
        name: first.metadata?.course || first.metadata?.skill || first.title || 'SkillUp Course',
        description: first.body || first.description || '',
        category: first.metadata?.category || 'SkillUp',
        level: first.metadata?.level || 'Self-paced',
        duration: first.metadata?.duration || 'Self-paced',
        videos: items.filter(item => item.content_type === 'video').length,
        notes: items.filter(item => ['note', 'pdf'].includes(item.content_type)).length,
        createdBy: first.created_by || 'Admin/Sub Admin',
        index,
      };
    });
    if (!banners.length) {
      const fallback = allWorkshops.find(row => row.banner_image);
      banners = [{
        id: 'fallback-live-workshop-banner',
        banner_image: fallback?.banner_image || '',
        banner_title: 'Live Workshops',
        banner_subtitle: 'Upcoming expert sessions',
      }];
    }
    root.innerHTML = `
      <section class="live-workshop-carousel" aria-label="Live workshop banners">
        <div class="live-workshop-carousel-track" id="live-workshop-carousel-track">
          ${banners.map((banner, index) => liveWorkshopBannerSlide(banner, index)).join('')}
        </div>
        ${banners.length > 1 ? `
          <button class="live-carousel-arrow left" type="button" onclick="moveLiveWorkshopCarousel(-1)" aria-label="Previous banner">‹</button>
          <button class="live-carousel-arrow right" type="button" onclick="moveLiveWorkshopCarousel(1)" aria-label="Next banner">›</button>
        ` : ''}
      </section>
      <section class="live-workshop-section">
        <div class="section-heading">Registered Workshops</div>
        <div class="live-workshop-scroll-row">
          ${registeredWorkshops.length ? registeredWorkshops.map((row) => workshopCard(row, 'registered')).join('') : '<div class="empty-state-card">registered workshops fast.</div>'}
        </div>
      </section>
      <section class="live-workshop-section">
        <div class="section-heading">Upcoming Workshops</div>
        <div class="live-workshop-scroll-row">
          ${upcomingWorkshops.length ? upcomingWorkshops.map((row) => workshopCard(row, 'upcoming')).join('') : '<div class="empty-state-card">upcoming workshops available soon.</div>'}
        </div>
      </section>
      <section class="live-workshop-section live-courses-highlight">
        <div class="section-heading">Courses</div>
        <div class="live-skillup-grid">
          ${courseCards.length ? courseCards.map(skillUpCard).join('') : '<div class="empty-state-card live-scroll-empty">SkillUp courses will appear here when published.</div>'}
        </div>
      </section>
    `;
    enableSkillUpHorizontalScrolling(root);
    startLiveWorkshopCarousel(banners.length);
  }

  function workshopCard(row, state = 'upcoming') {
    const action = state === 'registered'
      ? `<a class="btn btn-primary" href="${esc(row.join_link)}" target="_blank" rel="noreferrer">Join</a>`
      : `<button class="btn btn-primary" type="button" onclick="openLiveWorkshopRegisterModal('${js(row.id)}')">Register</button>`;
    return `
      <article class="live-workshop-card ${skillUpTheme(row.id)}">
        ${row.banner_image ? `<img class="live-workshop-card-img" src="${esc(row.banner_image)}" alt="${esc(row.workshop_name)} banner" loading="lazy">` : ''}
        <h3>${esc(row.workshop_name)}</h3>
        <div class="live-workshop-info-pills">
          <span>${esc(row.speaker_name || 'Speaker TBA')}</span>
          <span>${esc(row.workshop_date)}</span>
          <span>${esc(row.workshop_time)}</span>
        </div>
        <p class="live-workshop-description">${esc(row.description || '')}</p>
        <div class="live-workshop-card-action">${action}</div>
      </article>`;
  }

  window.openLiveWorkshopRegisterModal = async function openLiveWorkshopRegisterModal(workshopId) {
    const user = await authUser();
    if (!user) {
      openLiveWorkshopGoogleSignIn();
      return;
    }
    liveWorkshopPendingRegistrationId = String(workshopId || '');
    if (!liveWorkshopPendingRegistrationId) return;
    document.getElementById('live-workshop-register-modal')?.remove();
    (document.querySelector('.screen.active') || document.body).insertAdjacentHTML('beforeend', `
      <div class="modal-overlay live-workshop-register-overlay open" id="live-workshop-register-modal">
        <div class="modal live-workshop-register-modal" role="dialog" aria-modal="true" aria-labelledby="lw-register-title">
          <h2 id="lw-register-title">Register Workshop</h2>
          <div class="input-group"><label>Full Name</label><input class="input" id="lw-register-name" value="${esc(user.user_metadata?.full_name || user.email || '')}"></div>
          <div class="input-group"><label>Phone Number</label><input class="input" id="lw-register-phone" inputmode="tel" autocomplete="tel"></div>
          <div class="input-group"><label>Category</label><select class="select" id="lw-register-category"><option value="student">Student</option><option value="job_holder">Job Holder</option><option value="other">Other</option></select></div>
          <div class="live-workshop-register-actions">
            <button class="btn btn-ghost" type="button" onclick="closeLiveWorkshopRegisterModal()">Cancel</button>
            <button class="btn btn-primary" type="button" onclick="submitLiveWorkshopRegistration()">Register</button>
          </div>
        </div>
      </div>`);
  };

  window.closeLiveWorkshopRegisterModal = function closeLiveWorkshopRegisterModal() {
    liveWorkshopPendingRegistrationId = '';
    document.getElementById('live-workshop-register-modal')?.remove();
  };

  window.submitLiveWorkshopRegistration = async function submitLiveWorkshopRegistration() {
    const supabase = sb();
    const id = await userId();
    const workshopId = liveWorkshopPendingRegistrationId;
    if (!supabase || !id || !workshopId) return;
    const nameVal = document.getElementById('lw-register-name')?.value?.trim() || '';
    const phoneVal = document.getElementById('lw-register-phone')?.value?.trim() || '';
    const category = document.getElementById('lw-register-category')?.value || '';

    if (!nameVal) {
      window.showToast?.('Full name is required', 'red');
      return;
    }
    if (!/^[0-9+\-\s()]{7,20}$/.test(phoneVal)) {
      window.showToast?.('Enter a valid phone number', 'red');
      return;
    }
    if (!['student', 'job_holder', 'other'].includes(category)) {
      window.showToast?.('Please select a category', 'red');
      return;
    }

    const row = {
      user_id: id,
      workshop_id: workshopId,
      name: nameVal,
      mobile_number: phoneVal,
      role_type: category,
      college_name: null,
      created_at: new Date().toISOString(),
    };

    const existing = await supabase
      .from('live_workshop_registrations')
      .select('id')
      .eq('user_id', id)
      .eq('workshop_id', workshopId)
      .limit(1)
      .maybeSingle();
    if (existing.error) {
      console.warn('[LIVE WORKSHOP] Registration check failed:', existing.error.message || existing.error);
      window.showToast?.('Could not verify registration. Please try again.', 'red');
      return;
    }
    const request = existing.data?.id
      ? supabase.from('live_workshop_registrations').update(row).eq('id', existing.data.id)
      : supabase.from('live_workshop_registrations').insert(row);
    const { error } = await request;
    if (error) {
      window.showToast?.('Registration failed: ' + error.message, 'red');
      return;
    }
    window.closeLiveWorkshopRegisterModal();
    window.showToast?.('Workshop registered', 'green');
    window.updateLandingStats?.();
    await renderLiveWorkshopDashboard();
    if (document.getElementById('page-skills')?.style.display !== 'none') {
      await renderStudentSkillUpPage();
    }
  };

  async function renderAdminLiveWorkshops() {
    ensureLiveWorkshopSurfaces();
    subscribeLiveWorkshopUpdates();
    const content = document.getElementById('admin-content');
    if (!content) return;
    content.innerHTML = `
      <div class="admin-section-head"><div><h2>Live Workshops</h2><p>Create, publish, edit, and delete live workshop sessions.</p></div></div>
      <div class="card live-admin-form">
        <div class="admin-section-head" style="margin-bottom:1rem;"><div><h2 style="font-size:1.1rem;">➕ Add Banner</h2><p>Upload multiple dashboard carousel banners using image URLs.</p></div></div>
        <input class="input" id="admin-lwb-id" type="hidden">
        <div class="form-row"><div class="input-group"><label>Image</label><input class="input" id="admin-lwb-image" type="url" placeholder="https://..."></div><div class="input-group"><label>Title</label><input class="input" id="admin-lwb-title" placeholder="Live Workshops"></div></div>
        <div class="form-row"><div class="input-group"><label>Subtitle</label><input class="input" id="admin-lwb-subtitle" placeholder="Upcoming expert sessions"></div><div class="input-group"><label>Status</label><select class="select" id="admin-lwb-status"><option value="true">Active</option><option value="false">Inactive</option></select></div></div>
        <button class="btn btn-primary" onclick="saveAdminLiveBanner()">Save Banner</button>
      </div>
      <div id="admin-live-banner-list" class="live-workshop-grid" style="margin-bottom:1.5rem;"></div>
      <div class="card live-admin-form">
        <input class="input" id="admin-lw-id" type="hidden">
        <div class="form-row"><div class="input-group"><label>Workshop Name</label><input class="input" id="admin-lw-name"></div><div class="input-group"><label>Speaker Name</label><input class="input" id="admin-lw-speaker"></div></div>
        <div class="form-row"><div class="input-group"><label>Date</label><input class="input" id="admin-lw-date" type="date"></div><div class="input-group"><label>Time</label><input class="input" id="admin-lw-time" type="time"></div></div>
        <div class="input-group"><label>Description</label><textarea class="input" id="admin-lw-desc" rows="3"></textarea></div>
        <div class="form-row"><div class="input-group"><label>Join Link</label><input class="input" id="admin-lw-link" type="url"></div><div class="input-group"><label>Banner Image URL</label><input class="input" id="admin-lw-banner" type="url"></div></div>
        <button class="btn btn-primary" onclick="saveAdminLiveWorkshop()">Save Workshop</button>
      </div>
      <div id="admin-live-workshop-list" class="live-workshop-grid"></div>`;
    await loadAdminLiveBannerList();
    await loadAdminLiveWorkshopList();
  }

  async function loadAdminLiveBannerList() {
    const supabase = sb();
    const list = document.getElementById('admin-live-banner-list');
    if (!supabase || !list) return;
    const { data, error } = await supabase.from('live_workshop_banners').select('*').order('created_at', { ascending: false });
    if (error) {
      list.innerHTML = `<div class="empty-state-card">Could not load banners: ${esc(error.message)}</div>`;
      return;
    }
    list.innerHTML = (data || []).length ? data.map(row => `
      <article class="live-workshop-card">
        ${row.banner_image ? `<img class="live-workshop-card-img" src="${esc(row.banner_image)}" alt="${esc(row.banner_title)} banner" loading="lazy">` : ''}
        <h3>${esc(row.banner_title)}</h3>
        <p>${esc(row.banner_subtitle || '')}</p>
        <p><strong>Status:</strong> ${row.is_active ? 'Active' : 'Inactive'}</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-ghost btn-sm" onclick='editAdminLiveBanner(${JSON.stringify(row).replace(/'/g, '&#39;')})'>Edit</button>
          <button class="btn btn-primary btn-sm" onclick="toggleAdminLiveBanner('${js(row.id)}', ${row.is_active ? 'false' : 'true'})">${row.is_active ? 'Deactivate' : 'Activate'}</button>
          <button class="btn btn-danger btn-sm" onclick="deleteAdminLiveBanner('${js(row.id)}')">Delete</button>
        </div>
      </article>`).join('') : '<div class="empty-state-card">No banners created yet.</div>';
  }

  async function loadAdminLiveWorkshopList() {
    const supabase = sb();
    const list = document.getElementById('admin-live-workshop-list');
    if (!supabase || !list) return;
    const { data, error } = await supabase.from('live_workshops').select('*').order('created_at', { ascending: false });
    if (error) {
      list.innerHTML = `<div class="empty-state-card">Could not load workshops: ${esc(error.message)}</div>`;
      return;
    }
    list.innerHTML = (data || []).length ? data.map(row => `
      <article class="live-workshop-card">
        <h3>${esc(row.workshop_name)}</h3>
        <p>${esc(row.speaker_name)} - ${esc(row.workshop_date)} ${esc(row.workshop_time)}</p>
        <p>${esc(row.description || '')}</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-ghost btn-sm" onclick='editAdminLiveWorkshop(${JSON.stringify(row).replace(/'/g, '&#39;')})'>Edit</button>
          <button class="btn btn-primary btn-sm" onclick="toggleAdminLiveWorkshop('${js(row.id)}', ${((row.status || '').toLowerCase() === 'published') ? 'false' : 'true'})">${((row.status || '').toLowerCase() === 'published') ? 'Unpublish' : 'Publish'}</button>
          <button class="btn btn-danger btn-sm" onclick="deleteAdminLiveWorkshop('${js(row.id)}')">Delete</button>
        </div>
      </article>`).join('') : '<div class="empty-state-card">No workshops created yet.</div>';
  }

  window.saveAdminLiveBanner = async function saveAdminLiveBanner() {
    const supabase = sb();
    if (!supabase) return;
    const auth = await authUser();
    const row = {
      banner_image: document.getElementById('admin-lwb-image')?.value?.trim(),
      banner_title: document.getElementById('admin-lwb-title')?.value?.trim(),
      banner_subtitle: document.getElementById('admin-lwb-subtitle')?.value?.trim() || null,
      is_active: document.getElementById('admin-lwb-status')?.value === 'true',
      created_by: auth?.id || null,
      updated_at: new Date().toISOString(),
    };
    if (!row.banner_image || !row.banner_title) {
      window.showToast?.('Please add banner image and title', 'red');
      return;
    }
    const editId = document.getElementById('admin-lwb-id')?.value;
    const request = editId ? supabase.from('live_workshop_banners').update(row).eq('id', editId) : supabase.from('live_workshop_banners').insert(row);
    const { error } = await request;
    if (error) {
      window.showToast?.('Banner save failed: ' + error.message, 'red');
      return;
    }
    window.showToast?.('Banner saved', 'green');
    document.getElementById('admin-lwb-id').value = '';
    document.getElementById('admin-lwb-image').value = '';
    document.getElementById('admin-lwb-title').value = '';
    document.getElementById('admin-lwb-subtitle').value = '';
    document.getElementById('admin-lwb-status').value = 'true';
    await loadAdminLiveBannerList();
  };

  window.editAdminLiveBanner = function editAdminLiveBanner(row) {
    document.getElementById('admin-lwb-id').value = row.id || '';
    document.getElementById('admin-lwb-image').value = row.banner_image || row.image_url || row.banner_url || '';
    document.getElementById('admin-lwb-title').value = row.banner_title || row.title || '';
    document.getElementById('admin-lwb-subtitle').value = row.banner_subtitle || row.subtitle || '';
    document.getElementById('admin-lwb-status').value = row.is_active ? 'true' : 'false';
  };

  window.toggleAdminLiveBanner = async function toggleAdminLiveBanner(id, next) {
    const { error } = await sb().from('live_workshop_banners').update({ is_active: Boolean(next), updated_at: new Date().toISOString() }).eq('id', id);
    if (error) window.showToast?.('Banner status update failed: ' + error.message, 'red');
    else await loadAdminLiveBannerList();
  };

  window.deleteAdminLiveBanner = async function deleteAdminLiveBanner(id) {
    const { error } = await sb().from('live_workshop_banners').delete().eq('id', id);
    if (error) window.showToast?.('Banner delete failed: ' + error.message, 'red');
    else await loadAdminLiveBannerList();
  };

  window.saveAdminLiveWorkshop = async function saveAdminLiveWorkshop() {
    const supabase = sb();
    if (!supabase) return;
    const auth = await authUser();
    const row = {
      workshop_name: document.getElementById('admin-lw-name')?.value?.trim(),
      speaker_name: document.getElementById('admin-lw-speaker')?.value?.trim(),
      workshop_date: document.getElementById('admin-lw-date')?.value,
      workshop_time: document.getElementById('admin-lw-time')?.value,
      description: document.getElementById('admin-lw-desc')?.value?.trim() || null,
      join_link: document.getElementById('admin-lw-link')?.value?.trim(),
      banner_image: document.getElementById('admin-lw-banner')?.value?.trim() || null,
      status: 'unpublished',
      created_by: auth?.id || null,
      updated_at: new Date().toISOString(),
    };
    if (!row.workshop_name || !row.speaker_name || !row.workshop_date || !row.workshop_time || !row.join_link) {
      window.showToast?.('Please fill all required workshop fields', 'red');
      return;
    }
    const editId = document.getElementById('admin-lw-id')?.value;
    if (editId) {
      delete row.status;
    }
    const request = editId ? supabase.from('live_workshops').update(row).eq('id', editId) : supabase.from('live_workshops').insert(row);
    const { error } = await request;
    if (error) {
      window.showToast?.('Workshop save failed: ' + error.message, 'red');
      return;
    }
    window.showToast?.('Workshop saved', 'green');
    await renderAdminLiveWorkshops();
  };

  window.editAdminLiveWorkshop = function editAdminLiveWorkshop(row) {
    document.getElementById('admin-lw-id').value = row.id || '';
    document.getElementById('admin-lw-name').value = row.workshop_name || '';
    document.getElementById('admin-lw-speaker').value = row.speaker_name || '';
    document.getElementById('admin-lw-date').value = row.workshop_date || '';
    document.getElementById('admin-lw-time').value = row.workshop_time || '';
    document.getElementById('admin-lw-desc').value = row.description || '';
    document.getElementById('admin-lw-link').value = row.join_link || '';
    document.getElementById('admin-lw-banner').value = row.banner_image || '';
  };

  window.toggleAdminLiveWorkshop = async function toggleAdminLiveWorkshop(id, next) {
    const published = Boolean(next);
    const { error } = await sb().from('live_workshops').update({ status: published ? 'published' : 'unpublished', updated_at: new Date().toISOString() }).eq('id', id);
    if (error) window.showToast?.('Publish update failed: ' + error.message, 'red');
    else await loadAdminLiveWorkshopList();
  };

  window.deleteAdminLiveWorkshop = async function deleteAdminLiveWorkshop(id) {
    const { error } = await sb().from('live_workshops').delete().eq('id', id);
    if (error) window.showToast?.('Delete failed: ' + error.message, 'red');
    else await loadAdminLiveWorkshopList();
  };

  const originalSwitchAdmin = window.switchAdminSection;
  window.switchAdminSection = globalThis.switchAdminSection = function switchAdminWithLiveWorkshops(section) {
    ensureLiveWorkshopSurfaces();
    if (section === 'liveworkshops') {
      document.querySelectorAll('[id^="admin-nav-"]').forEach(el => el.classList.remove('active'));
      document.getElementById('admin-nav-liveworkshops')?.classList.add('active');
      const title = document.getElementById('admin-topbar-title');
      if (title) title.textContent = 'Live Workshops';
      return renderAdminLiveWorkshops();
    }
    return originalSwitchAdmin?.apply(this, arguments);
  };

  window.addEventListener('hashchange', () => {
    if (window.location.hash.includes('live-workshops')) window.openLiveWorkshops();
  });

  setTimeout(() => {
    ensureLiveWorkshopSurfaces();
    installProfileAutosave();
    if (window.location.hash.includes('live-workshops')) window.openLiveWorkshops();
  }, 300);
})();
