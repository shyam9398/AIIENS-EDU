/**
 * Workspace isolation: Supabase-only reads, created_by ownership, realtime refresh.
 */
import {
  getPortalActorId,
  getPortalActorUsername,
  getSubAdminWorkspace,
  getWorkspaceQueryFilters,
  isRecordOwner,
  isWorkspaceAssigned,
  subjectCreateMeta,
  subjectMatchesWorkspace,
  clearSubAdminWorkspaceCaches,
} from '../services/auth/portalUserContext.js';
import { refreshSubAdminAssignment } from '../services/auth/portalAuthService.js';
import {
  branchOptionsHtml,
  fetchActiveBranches,
} from '../repositories/branchRepository.js';
import { fetchActiveUniversities, universityOptionsHtml } from '../repositories/universityRepository.js';
import { loadRegulations } from '../services/academic/academicCatalog.js';

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function refreshSubAdminCreateBranchSelect() {
  const branchSelect = document.getElementById('v10-sa-branch');
  if (!branchSelect) return [];

  const sa = window.APP?.subAdminData || {};
  const ws = getSubAdminWorkspace() || {};
  const activeUni = ws.university && ws.university !== '-' ? ws.university : sa.university;
  const activeBranch = ws.branch && ws.branch !== '-' ? ws.branch : (branchSelect.value || sa.branch || '');

  branchSelect.disabled = true;
  branchSelect.innerHTML = '<option value="">Loading branches...</option>';

  try {
    const rows = await fetchActiveBranches({
      universityName: activeUni || null,
      includeGlobalBranches: true,
    });
    branchSelect.disabled = false;
    branchSelect.innerHTML = branchOptionsHtml(rows, {
      selectedValue: activeBranch || '',
      emptyLabel: 'No branches available',
    });
    return rows;
  } catch (error) {
    console.warn('[SUBADMIN] Failed to load complete branch list:', error?.message || error);
    branchSelect.disabled = true;
    branchSelect.innerHTML = '<option value="">Unable to load branches</option>';
    return [];
  }
}

window.v10SAOpenCreateSubjectForm = async function v10SAOpenCreateSubjectForm() {
  const form = document.getElementById('v10-sa-create-form');
  if (!form) return;
  form.style.display = 'block';
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  await refreshSubAdminCreateBranchSelect();
};

function activeSaSection() {
  return document.querySelector('[id^="sa-nav-"].active')?.id?.replace('sa-nav-', '') || '';
}

function pushSubAdminRoute(path) {
  if (window.__aimeasyApplyingRoute) return;
  const normalized = path.startsWith('#') ? path.slice(1) : path;
  const hash = `#${normalized}`;
  if (window.location.hash === hash) return;
  const nextIndex = (window.history.state?.aimeasyIndex ?? 0) + 1;
  window.__aimeasyRouterWritingHistory = true;
  try {
    window.history.pushState({ aimeasyPath: normalized, aimeasyIndex: nextIndex }, '', hash);
  } finally {
    window.__aimeasyRouterWritingHistory = false;
  }
}

function refreshActiveSaWorkspace() {
  // Stay on unit detail / roadmap pages after saves — do not replace deep navigation.
  if (window._v10SAUnitId && window._v10SASubj && typeof window.v10SAUnitDetail === 'function') {
    window.v10SAUnitDetail(window._v10SASubj.id, window._v10SAUnitId);
    return;
  }
  if (window._v10SASubj && typeof window.v10SAUnitsPage === 'function') {
    window.v10SAUnitsPage(window._v10SASubj);
    return;
  }
  const section = activeSaSection();
  if (section === 'subjects') window.v10SASubjects?.();
  if (section === 'view') window.v10SAViewContent?.();
  if (section === 'dashboard') window.renderSubAdminDashboardLive?.();
}

/** Subject-level gate: non-owners get read-only for the entire hierarchy. */
function canModifySubjectWorkspace() {
  return !window._v10SASubj?.isReadOnly;
}

/** Entity-level gate: owner of subject AND creator of the record. */
function canModifyRecordWorkspace(record) {
  if (!canModifySubjectWorkspace()) return false;
  return isRecordOwner(record);
}

async function fetchAllSubjectsFromDb(extraFilters = {}) {
  if (!window.aimeasyFetchSubjects) {
    return { data: [], error: new Error('Supabase fetch not ready') };
  }
  return window.aimeasyFetchSubjects(extraFilters);
}

async function ensureSubAdminAssignmentFresh() {
  if (window.APP?.role !== 'subadmin') return;
  await refreshSubAdminAssignment(window.__AIMEASY_SUPABASE__);
}

async function fetchWorkspaceSubjectsFromDb({ ownOnly = false } = {}) {
  const workspaceFilters = getWorkspaceQueryFilters();
  if (!workspaceFilters) {
    return { data: [], error: null };
  }

  if (!ownOnly) {
    return fetchAllSubjectsFromDb(workspaceFilters);
  }

  const actorId = getPortalActorId();
  const actorUsername = getPortalActorUsername();
  if (actorId) {
    const byId = await fetchAllSubjectsFromDb({ ...workspaceFilters, created_by: actorId });
    if (!byId.error && (byId.data || []).length) return byId;
  }
  if (actorUsername) {
    return fetchAllSubjectsFromDb({ ...workspaceFilters, created_by: actorUsername });
  }
  return { data: [], error: null };
}

async function fetchOwnSubjectsFromDb() {
  return fetchWorkspaceSubjectsFromDb({ ownOnly: true });
}

function renderSubjectCardHtml(s, { editable, onOpen }) {
  const safeId = esc(s.id);
  const safeName = esc(s.name);
  const openFn = onOpen || `v10SAOpenUnits('${safeId}')`;
  const readOnlyBadge = editable
    ? ''
    : '<span class="badge badge-teal" style="font-size:0.68rem;">Read Only</span>';
  const dotMenu = editable
    ? `<div class="v10-dot-wrap" onclick="event.stopPropagation()">
        <button class="v10-dot-btn" onclick="v10SaDotMenu(this,'${safeId}','${safeName.replace(/'/g, "\\'")}')">⋯</button>
      </div>`
    : '';
  const cardStyle = editable
    ? ''
    : 'border:1.5px dashed var(--border); background:var(--surface2);';

  return `
    <div class="v10-subj-card" onclick="${openFn}" style="${cardStyle}">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:6px;">
        <div class="v10-subj-icon"${editable ? '' : ' style="opacity:0.7;"'}>📖</div>
        ${readOnlyBadge}
        ${dotMenu}
      </div>
      <div class="v10-subj-name"${editable ? '' : ' style="color:var(--text2);"'}>${safeName}</div>
      <div class="v10-subj-meta">${esc(s.code || '—')} · ${esc(s.credits || 3)} Cr · ${esc(s.branch || 'CSE')}</div>
      <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:4px;">
        <span class="badge badge-primary">${esc(s.semester || '—')}</span>
        <span class="badge badge-teal">${esc(s.university_name || 'JNTUK')}</span>
        <span class="badge badge-lavender">${esc(s.regulation_code || 'R23')}</span>
        <span class="badge" style="background:var(--surface3);color:var(--text3);">By: ${esc(s.created_by_role || s.created_by || '—')}</span>
      </div>
      <div class="v10-arrow">${editable ? '📋 Click to manage units →' : '📋 View units (read-only) →'}</div>
    </div>`;
}

/** Sub Admin — Create Subject: own subjects only within current workspace */
async function v10SASubjectsWorkspace() {
  const content = document.getElementById('sa-content');
  if (!content) return;

  await ensureSubAdminAssignmentFresh();

  if (!isWorkspaceAssigned()) {
    content.innerHTML = `
      <div style="padding:2rem;text-align:center;color:var(--text2);">
        <p>Your workspace is not fully assigned yet. Ask an Admin to set University, Branch, and Regulation.</p>
      </div>`;
    return;
  }

  content.innerHTML = `
    <div style="padding:2rem;max-width:1100px;margin:0 auto;width:100%;text-align:center;">
      <div class="loading-spinner" style="margin:3rem auto 1rem;"></div>
      <p style="color:var(--text3);">Loading your subjects from Supabase...</p>
    </div>`;

  const { data, error } = await fetchOwnSubjectsFromDb();
  if (error) {
    content.innerHTML = `
      <div style="padding:2rem;text-align:center;">
        <p style="color:var(--red);">Failed to load subjects: ${esc(error.message)}</p>
        <button class="btn btn-primary btn-sm" style="margin-top:1rem;" onclick="v10SASubjects()">Retry</button>
      </div>`;
    return;
  }

  const mySubs = data || [];
  const sa = window.APP?.subAdminData || {};
  const ws = getSubAdminWorkspace() || {};
  const allSems = ['1-1', '1-2', '2-1', '2-2', '3-1', '3-2', '4-1', '4-2'];
  const [universities, regulations] = await Promise.all([fetchActiveUniversities(), loadRegulations()]);
  const activeUni = ws.university && ws.university !== '-' ? ws.university : sa.university;
  const activeBranch = ws.branch && ws.branch !== '-' ? ws.branch : sa.branch;
  const activeReg = ws.regulation && ws.regulation !== '-' ? ws.regulation : sa.regulation;
  const branchRows = await fetchActiveBranches({ universityName: activeUni || null, includeGlobalBranches: true });
  const branchSelectHtml = branchOptionsHtml(branchRows, { selectedValue: activeBranch || '' });
  const uniSelectHtml = universityOptionsHtml(universities, {
    selectedValue: activeUni || '',
    placeholder: 'Select University',
  });
  const regSelectHtml =
    `<option value="">Select Regulation</option>` +
    regulations
      .map((r) => {
        const code = r.regulation_code || r.regulation_name;
        return `<option value="${esc(code)}"${activeReg === code ? ' selected' : ''}>${esc(code)}</option>`;
      })
      .join('');

  const createForm = `
  <div class="v10-create-form" id="v10-sa-create-form" style="display:none;">
    <h3 style="margin-bottom:1rem;font-size:1rem;">📚 Create New Subject</h3>
    <div class="v10-2col">
      <div class="input-group"><label>Branch</label>
        <select class="select" id="v10-sa-branch">
          ${branchSelectHtml}
        </select></div>
      <div class="input-group"><label>Year</label>
        <select class="select" id="v10-sa-year">
          <option value="">Select Year</option>
          ${['1', '2', '3', '4'].map((y) => `<option value="${y}">${y}</option>`).join('')}
        </select></div>
    </div>
    <div class="v10-2col">
      <div class="input-group"><label>Semester</label>
        <select class="select" id="v10-sa-sem">
          <option value="">Select Semester</option>
          ${allSems.map((s) => `<option value="${s}">${s}</option>`).join('')}
        </select></div>
      <div class="input-group"><label>Regulation</label>
        <select class="select" id="v10-sa-reg">
          ${regSelectHtml}
        </select></div>
    </div>
    <div class="v10-2col">
      <div class="input-group"><label>University</label>
        <select class="select" id="v10-sa-uni">
          ${uniSelectHtml}
        </select></div>
      <div class="input-group"><label>Credits</label>
        <select class="select" id="v10-sa-credits">
          <option value="">Select Credits</option>
          ${['1', '2', '3', '4', '5', '6'].map((c) => `<option value="${c}">${c}</option>`).join('')}
        </select></div>
    </div>
    <div class="v10-2col">
      <div class="input-group"><label>Subject Name</label>
        <input class="input" id="v10-sa-name" placeholder="e.g. Machine Learning"></div>
      <div class="input-group"><label>Subject Code</label>
        <input class="input" id="v10-sa-code" placeholder="e.g. ML101"></div>
    </div>
    <div style="display:flex;gap:10px;margin-top:.5rem;">
      <button class="btn btn-primary" id="v10-sa-create-btn" onclick="v10SACreateSubject()" style="flex:1;">✅ Create Subject</button>
      <button class="btn btn-ghost" onclick="document.getElementById('v10-sa-create-form').style.display='none'">Cancel</button>
    </div>
  </div>`;

  const cards = mySubs.map((s) => renderSubjectCardHtml(s, { editable: true })).join('');

  content.innerHTML = `
  <div style="padding:2rem;max-width:1100px;margin:0 auto;width:100%;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.2rem;flex-wrap:wrap;gap:10px;">
      <div>
        <h2 style="font-size:1.4rem;font-weight:800;">📚 My Subjects (${mySubs.length})</h2>
        <p style="font-size:0.78rem;color:var(--text3);margin-top:4px;">Workspace: ${esc(activeUni || '—')} · ${esc(activeBranch || '—')} · ${esc(activeReg || '—')}</p>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-ghost btn-sm" onclick="v10SASubjects()">🔄 Refresh</button>
        <button class="btn btn-primary" onclick="v10SAOpenCreateSubjectForm()">+ Add Subject</button>
      </div>
    </div>
    ${createForm}
    ${mySubs.length
      ? `<div class="v10-subj-grid">${cards}</div>`
      : `<div style="text-align:center;padding:4rem;color:var(--text3);">
          <div style="font-size:3rem;margin-bottom:1rem;">📚</div>
          <div style="font-weight:600;">No subjects in your workspace yet</div>
        </div>`}
  </div>`;

  window.aiiensBindBranchCascade?.('v10-sa-uni', 'v10-sa-branch', { includeGlobalBranches: true });
}

/** Sub Admin — View Content: current workspace only, edit only own */
async function v10SAViewContentWorkspace() {
  const content = document.getElementById('sa-content');
  if (!content) return;

  await ensureSubAdminAssignmentFresh();

  if (!isWorkspaceAssigned()) {
    content.innerHTML = `
      <div style="padding:2rem;text-align:center;color:var(--text2);">
        <p>Your workspace is not fully assigned yet. Ask an Admin to set University, Branch, and Regulation.</p>
      </div>`;
    return;
  }

  content.innerHTML = `
    <div style="padding:2rem;max-width:1100px;margin:0 auto;text-align:center;">
      <div class="loading-spinner" style="margin:3rem auto 1rem;"></div>
      <p style="color:var(--text3);">Loading all subjects from Supabase...</p>
    </div>`;

  const savedFilter = window._saViewFilter || {};
  const { data, error } = await fetchWorkspaceSubjectsFromDb({ ownOnly: false });
  if (error) {
    content.innerHTML = `<div style="padding:2rem;text-align:center;color:var(--red);">Failed to load: ${esc(error.message)}</div>`;
    return;
  }

  let filtered = (data || []).filter(subjectMatchesWorkspace);
  if (savedFilter.sem) filtered = filtered.filter((s) => s.semester === savedFilter.sem);

  const ws = getSubAdminWorkspace() || {};
  const allSems = ['1-1', '1-2', '2-1', '2-2', '3-1', '3-2', '4-1', '4-2'];
  const cards = filtered
    .map((s) => renderSubjectCardHtml(s, { editable: isRecordOwner(s) }))
    .join('');

  content.innerHTML = `
  <div style="padding:2rem;max-width:1100px;margin:0 auto;width:100%;">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:1.5rem;">
      <div>
        <h2 style="font-size:1.4rem;font-weight:800;">👁️ View Content</h2>
        <p style="font-size:0.78rem;color:var(--text3);margin-top:4px;">Workspace: ${esc(ws.university || '—')} · ${esc(ws.branch || '—')} · ${esc(ws.regulation || '—')}</p>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn btn-ghost btn-sm" onclick="v10SAViewContent()">🔄 Refresh</button>
        <select class="select" style="width:110px;" onchange="window._saViewFilter=Object.assign(window._saViewFilter||{},{sem:this.value});v10SAViewContent()">
          <option value="">All Semesters</option>
          ${allSems.map((s) => `<option value="${s}"${savedFilter.sem === s ? ' selected' : ''}>${s}</option>`).join('')}
        </select>
      </div>
    </div>
    <div style="font-size:0.82rem;color:var(--text3);margin-bottom:1rem;">Showing ${filtered.length} subjects in your workspace · You can edit only subjects you created</div>
    ${filtered.length
      ? `<div class="v10-subj-grid">${cards}</div>`
      : '<div style="text-align:center;padding:3rem;color:var(--text3);">No subjects match the selected filters.</div>'}
  </div>`;
}

async function renderSubAdminDashboardScoped() {
  const activeSaTab = document.querySelector('[id^="sa-nav-"].active')?.id?.replace('sa-nav-', '');
  if (activeSaTab && activeSaTab !== 'dashboard') return;
  const content = document.getElementById('sa-content');
  if (!content) return;

  await ensureSubAdminAssignmentFresh();

  const ownerId = getPortalActorId() || getPortalActorUsername();
  if (!ownerId) {
    content.innerHTML = '<p style="padding:1rem;color:var(--text2);">Sign in to view your workspace dashboard.</p>';
    return;
  }

  const { data: workspaceSubjects, error: subjectErr } = await fetchOwnSubjectsFromDb();
  if (subjectErr) {
    content.innerHTML = '<p style="padding:1rem;color:var(--text2);">Could not load dashboard metrics.</p>';
    return;
  }

  const subjectIds = (workspaceSubjects || []).map((s) => s.id);
  const ws = getSubAdminWorkspace() || {};
  let data = {
    subjects: subjectIds.length,
    units: 0,
    topics: 0,
    videos: 0,
    notes: 0,
    pyqs: 0,
    iqs: 0,
    roadmapTopics: 0,
  };

  if (subjectIds.length) {
    const supabase = window.__AIMEASY_SUPABASE__;
    if (supabase) {
      const owner = String(ownerId);
      const [units, topics, roadmapVideos, contentVideos, notes, pyqs, iqs] = await Promise.all([
        supabase.from('units').select('*', { count: 'exact', head: true }).in('subject_id', subjectIds),
        supabase.from('topics').select('*', { count: 'exact', head: true }).in('subject_id', subjectIds),
        supabase.from('topic_videos').select('*', { count: 'exact', head: true }).in('subject_id', subjectIds),
        supabase.from('content_items').select('*', { count: 'exact', head: true }).eq('content_type', 'video').eq('created_by', owner),
        supabase.from('content_items').select('*', { count: 'exact', head: true }).eq('content_type', 'note').eq('created_by', owner),
        supabase.from('content_items').select('*', { count: 'exact', head: true }).eq('content_type', 'pyq').eq('created_by', owner),
        supabase.from('content_items').select('*', { count: 'exact', head: true }).eq('content_type', 'iq').eq('created_by', owner),
      ]);
      data = {
        subjects: subjectIds.length,
        units: units.count || 0,
        topics: topics.count || 0,
        videos: (roadmapVideos.count || 0) + (contentVideos.count || 0),
        notes: notes.count || 0,
        pyqs: pyqs.count || 0,
        iqs: iqs.count || 0,
        roadmapTopics: topics.count || 0,
      };
    }
  }

  const cards = [
    ['My Subjects', data.subjects, 'var(--primary)'],
    ['My Units', data.units, 'var(--teal)'],
    ['My Topics', data.topics, 'var(--lavender)'],
    ['My Videos', data.videos, 'var(--blue)'],
    ['My Notes', data.notes, 'var(--amber)'],
    ['My PYQs', data.pyqs, 'var(--green)'],
    ['My IQs', data.iqs, 'var(--red)'],
    ['My Roadmap Topics', data.roadmapTopics, 'var(--primary)'],
  ];

  content.innerHTML = `
    <div style="padding:2rem;max-width:1100px;margin:0 auto;width:100%;">
      <div style="margin-bottom:1.6rem;">
        <h2 style="font-size:1.4rem;font-weight:800;margin-bottom:4px;">Sub Admin Dashboard</h2>
        <p style="font-size:0.82rem;color:var(--text3);">Workspace: ${esc(ws.university || '—')} · ${esc(ws.branch || '—')} · ${esc(ws.regulation || '—')}</p>
        <p style="font-size:0.82rem;color:var(--text3);">Counts include only your content in the current workspace.</p>
      </div>
      <div class="admin-grid">
        ${cards.map(([label, value, color]) => `
          <div class="admin-stat-card">
            <div class="admin-stat-accent" style="background:${color};"></div>
            <div style="font-size:2.1rem;font-weight:800;color:${color};">${value}</div>
            <div style="font-size:0.84rem;font-weight:600;margin-top:4px;">${label}</div>
          </div>`).join('')}
      </div>
    </div>`;
}

function wrapSubjectMutations() {
  const wrap = (name, fn) => {
    const original = window[name];
    if (typeof original !== 'function') return;
    window[name] = async function wrappedSubjectMutation(...args) {
      const meta = subjectCreateMeta();
      if (name === 'aimeasyCreateSubject' && args[0] && typeof args[0] === 'object') {
        args[0] = { ...args[0], createdBy: meta.created_by, created_by: meta.created_by, created_by_role: meta.created_by_role };
      }
      if (name === 'aimeasyUpdateSubject' && args[1] && typeof args[1] === 'object') {
        const owner = args[1].created_by || args[1].createdBy || meta.created_by;
        args[1] = { ...args[1], createdBy: owner, created_by: owner };
      }
      if (name === 'aimeasyDeleteSubject' && args.length === 1) {
        args.push(meta.created_by);
      }
      const result = await original.apply(this, args);
      if (!result?.error) {
        refreshActiveSaWorkspace();
      }
      return result;
    };
  };
  wrap('aimeasyCreateSubject');
  wrap('aimeasyUpdateSubject');
  wrap('aimeasyDeleteSubject');
}

export function installWorkspaceIsolation() {
  if (window.__aiiensWorkspaceIsolationInstalled) return;
  window.__aiiensWorkspaceIsolationInstalled = true;

  window.aiiensIsRecordOwner = isRecordOwner;
  window.aiiensPortalActorId = getPortalActorId;
  window.aiiensSubjectCreateMeta = subjectCreateMeta;
  window.aiiensCanModifySubject = canModifySubjectWorkspace;
  window.aiiensCanModifyRecord = canModifyRecordWorkspace;
  window.v10SAViewContent = v10SAViewContentWorkspace;
  window.v10SASubjects = v10SASubjectsWorkspace;
  window.renderSubAdminDashboardLive = renderSubAdminDashboardScoped;

  const origSwitchSASection = window.switchSASection;
  if (typeof origSwitchSASection === 'function' && !origSwitchSASection.__workspacePatched) {
    window.switchSASection = function switchSASectionWorkspace(section) {
      if (section === 'subjects') {
        window.closeSASidebar?.();
        document.querySelectorAll('[id^="sa-nav-"]').forEach((el) => el.classList.remove('active'));
        document.getElementById('sa-nav-subjects')?.classList.add('active');
        const titleEl = document.getElementById('sa-topbar-title');
        if (titleEl) titleEl.textContent = 'Create Subject';
        window.v10SASubjects();
        pushSubAdminRoute('/subadmin/create-subject');
        return;
      }
      if (section === 'view') {
        window.closeSASidebar?.();
        document.querySelectorAll('[id^="sa-nav-"]').forEach((el) => el.classList.remove('active'));
        document.getElementById('sa-nav-view')?.classList.add('active');
        const titleEl = document.getElementById('sa-topbar-title');
        if (titleEl) titleEl.textContent = 'View Content';
        window.v10SAViewContent();
        return;
      }
      return origSwitchSASection.apply(this, arguments);
    };
    window.switchSASection.__workspacePatched = true;
  }

  wrapSubjectMutations();

  window.addEventListener('aimeasy:data-changed', () => {
    refreshActiveSaWorkspace();
  });

  window.addEventListener('aimeasy:subadmin-workspace-changed', () => {
    clearSubAdminWorkspaceCaches();
    window._v10SAUnitId = null;
    window._v10SASubj = null;
    refreshActiveSaWorkspace();
    window.showToast?.('Your workspace assignment was updated.', 'blue');
  });

  window.aiiensRefreshActiveSaWorkspace = refreshActiveSaWorkspace;

  const origCreateSubject = window.v10SACreateSubject;
  if (typeof origCreateSubject === 'function' && !origCreateSubject.__workspacePatched) {
    window.v10SACreateSubject = async function v10SACreateSubjectWorkspaceGuard(...args) {
      const ws = getSubAdminWorkspace();
      if (ws?.branch && ws.branch !== '-') {
        const branch = document.getElementById('v10-sa-branch')?.value;
        const uni = document.getElementById('v10-sa-uni')?.value;
        const reg = document.getElementById('v10-sa-reg')?.value;
        if (branch !== ws.branch || uni !== ws.university || reg !== ws.regulation) {
          window.showToast?.('Subjects must be created within your assigned workspace.', 'red');
          return;
        }
      }
      clearSubAdminWorkspaceCaches();
      return origCreateSubject.apply(this, args);
    };
    window.v10SACreateSubject.__workspacePatched = true;
  }

  const origOpenUnits = window.v10SAOpenUnits;
  if (typeof origOpenUnits === 'function' && !origOpenUnits.__workspacePatched) {
    window.v10SAOpenUnits = async function v10SAOpenUnitsWorkspace(subjId) {
      await ensureSubAdminAssignmentFresh();
      if (!window.aimeasyFetchSubjects) {
        return origOpenUnits(subjId);
      }
      const workspaceFilters = getWorkspaceQueryFilters();
      if (!workspaceFilters) {
        window.showToast?.('Your workspace is not fully assigned yet.', 'red');
        return;
      }
      const { data: allSubjects, error } = await fetchAllSubjectsFromDb(workspaceFilters);
      if (error) return origOpenUnits(subjId);
      const subj = (allSubjects || []).find((s) => String(s.id) === String(subjId));
      if (!subj || !subjectMatchesWorkspace(subj)) {
        window.showToast?.('This subject is outside your current workspace.', 'red');
        return;
      }
      if (subj) {
        window._v10SASubj = {
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
          isReadOnly: !isRecordOwner(subj),
        };
        if (typeof window.v10SAUnitsPage === 'function') {
          const result = await window.v10SAUnitsPage(window._v10SASubj);
          pushSubAdminRoute(`/subadmin/units/${encodeURIComponent(String(subj.id))}`);
          return result;
        }
      }
      const result = await origOpenUnits(subjId);
      pushSubAdminRoute(`/subadmin/units/${encodeURIComponent(String(subjId))}`);
      return result;
    };
    window.v10SAOpenUnits.__workspacePatched = true;
  }

  const origUnitsPage = window.v10SAUnitsPage;
  if (typeof origUnitsPage === 'function' && !origUnitsPage.__workspacePatched) {
    window.v10SAUnitsPage = async function v10SAUnitsPageWorkspaceRoute(subj, ...args) {
      const result = await origUnitsPage.call(this, subj, ...args);
      if (subj?.id) {
        window._v10SAUnitId = null;
        pushSubAdminRoute(`/subadmin/units/${encodeURIComponent(String(subj.id))}`);
      }
      return result;
    };
    window.v10SAUnitsPage.__workspacePatched = true;
  }

  const origUnitDetail = window.v10SAUnitDetail;
  if (typeof origUnitDetail === 'function' && !origUnitDetail.__workspacePatched) {
    window.v10SAUnitDetail = async function v10SAUnitDetailWorkspaceRoute(subjId, unitId, ...args) {
      const result = await origUnitDetail.call(this, subjId, unitId, ...args);
      if (subjId && unitId) {
        pushSubAdminRoute(`/subadmin/topics/${encodeURIComponent(String(subjId))}/${encodeURIComponent(String(unitId))}`);
      }
      return result;
    };
    window.v10SAUnitDetail.__workspacePatched = true;
  }

  const origAddUnit = window.v10SAAddUnit;
  if (typeof origAddUnit === 'function' && !origAddUnit.__workspacePatched) {
    window.v10SAAddUnit = async function v10SAAddUnitStayOnUnits(subjId, ...args) {
      const subjectBefore = window._v10SASubj;
      const result = await origAddUnit.call(this, subjId, ...args);
      const activeSubject = window._v10SASubj || subjectBefore;
      window._v10SAUnitId = null;
      if (activeSubject && typeof window.v10SAUnitsPage === 'function') {
        await window.v10SAUnitsPage(activeSubject);
        pushSubAdminRoute(`/subadmin/units/${encodeURIComponent(String(activeSubject.id || subjId))}`);
      }
      return result;
    };
    window.v10SAAddUnit.__workspacePatched = true;
  }
}
