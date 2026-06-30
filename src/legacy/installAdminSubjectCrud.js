

import {
  getPortalActorId,
  getPortalActorUsername,
  isRecordOwner,
  subjectCreateMeta,
} from '../services/auth/portalUserContext.js';
import { loadUniversities, loadRegulations } from '../services/academic/academicCatalog.js';
import {
  branchOptionsHtml,
  bindBranchCascade,
  fetchActiveBranches,
} from '../repositories/branchRepository.js';

const SELECT_OPTIONS = {
  years: ['1', '2', '3', '4'],
  semesters: ['1-1', '1-2', '2-1', '2-2', '3-1', '3-2', '4-1', '4-2'],
  credits: ['1', '2', '3', '4', '5'],
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function optionList(options, selected) {
  return options
    .map((option) => {
      const safeOption = escapeHtml(option);
      return `<option value="${safeOption}" ${String(selected || '') === option ? 'selected' : ''}>${safeOption}</option>`;
    })
    .join('');
}

function getFormValue(id) {
  return document.getElementById(id)?.value?.trim() || '';
}

function showToast(message, type = 'blue') {
  if (typeof window.showToast === 'function') {
    window.showToast(message, type);
  }
}

function renderSubjectForm(editingSubject, catalog = {}) {
  const isEdit = Boolean(editingSubject);
  const title = isEdit ? 'Edit Subject' : 'Add New Subject';
  const universities = catalog.universities || [];
  const regulations = (catalog.regulations || []).map((r) => r.regulation_code || r.regulation_name).filter(Boolean);
  const branchHtml = catalog.branchHtml || '<option value="">Select Branch</option>';

  return `
    <div class="card" style="margin-bottom:1rem;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:1rem;">
        <div>
          <h3 style="margin-bottom:4px;">${title}</h3>
          <p style="font-size:0.82rem;color:var(--text2);margin-bottom:1rem;">Subjects created here are available to students and saved directly to Supabase.</p>
        </div>
        ${isEdit ? '<button class="btn btn-ghost btn-sm" onclick="adminSubjectCancelEdit()">Cancel Edit</button>' : ''}
      </div>

      <input type="hidden" id="admin-subject-id" value="${escapeHtml(editingSubject?.id || '')}">

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;">
        <div class="input-group">
          <label>Subject Name</label>
          <input class="input" id="admin-subject-name" value="${escapeHtml(editingSubject?.name || '')}" placeholder="e.g. Operating Systems">
        </div>
        <div class="input-group">
          <label>Subject Code</label>
          <input class="input" id="admin-subject-code" value="${escapeHtml(editingSubject?.code || '')}" placeholder="e.g. CS305">
        </div>
        <div class="input-group">
          <label>University</label>
          <select class="select" id="admin-subject-uni">
            ${optionList(universities.map((u) => u.name || u), editingSubject?.uni)}
          </select>
        </div>
        <div class="input-group">
          <label>Regulation</label>
          <select class="select" id="admin-subject-reg">
            ${optionList(regulations, editingSubject?.reg)}
          </select>
        </div>
        <div class="input-group">
          <label>Branch</label>
          <select class="select" id="admin-subject-branch">
            ${branchHtml}
          </select>
        </div>
        <div class="input-group">
          <label>Year</label>
          <select class="select" id="admin-subject-year">
            ${optionList(SELECT_OPTIONS.years, editingSubject?.year)}
          </select>
        </div>
        <div class="input-group">
          <label>Semester</label>
          <select class="select" id="admin-subject-sem">
            ${optionList(SELECT_OPTIONS.semesters, editingSubject?.sem)}
          </select>
        </div>
        <div class="input-group">
          <label>Credits</label>
          <select class="select" id="admin-subject-credits">
            ${optionList(SELECT_OPTIONS.credits, String(editingSubject?.credits || '3'))}
          </select>
        </div>
      </div>

      <div style="display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap;">
        <button class="btn btn-primary" onclick="${isEdit ? 'adminSubjectUpdate()' : 'adminSubjectCreate()'}">
          ${isEdit ? 'Save Changes' : '+ Add Subject'}
        </button>
      </div>
    </div>
  `;
}

function renderSubjectCard(subject) {
  const safeId = escapeHtml(subject.id);
  const safeName = escapeHtml(subject.name);
  const openPayload = encodeURIComponent(JSON.stringify(subject));
  const editable = isRecordOwner(subject);
  const readOnlyBadge = editable ? '' : '<span class="badge badge-teal" style="margin-left:6px;">Read Only</span>';

  return `
    <div class="card" style="padding:1.1rem;">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:10px;">
        <div>
          <div style="font-weight:800;font-size:0.98rem;margin-bottom:4px;">${safeName}${readOnlyBadge}</div>
          <div style="font-size:0.76rem;color:var(--text3);">${escapeHtml(subject.code || '-')} · ${escapeHtml(subject.credits || 3)} credits</div>
        </div>
        <span class="badge badge-amber">Database</span>
      </div>

      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;">
        <span class="badge badge-primary">${escapeHtml(subject.sem)}</span>
        <span class="badge badge-teal">${escapeHtml(subject.uni)}</span>
        <span class="badge badge-lavender">${escapeHtml(subject.reg)}</span>
        <span class="badge badge-green">${escapeHtml(subject.branch)}</span>
      </div>

      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn btn-primary btn-sm" onclick="adminSubjectOpen('${openPayload}')">Open</button>
        ${editable ? `
        <button class="btn btn-ghost btn-sm" onclick="adminSubjectEdit('${safeId}')">Edit</button>
        <button class="btn btn-danger btn-sm" onclick="adminSubjectDelete('${safeId}')">Delete</button>
        ` : ''}
      </div>
    </div>
  `;
}

async function renderAdminSubjectCrud(editingSubject = null) {
  const content = document.getElementById('admin-content');
  if (!content) return;

  content.innerHTML = `
    <div style="padding:2rem;max-width:1200px;margin:0 auto;width:100%;text-align:center;">
      <div class="loading-spinner" style="margin: 3rem auto 1rem;"></div>
      <p style="color:var(--text3);">Fetching subjects from Supabase...</p>
    </div>
  `;

  const { data: dbSubjects, error } = await window.aimeasyFetchSubjects();

  if (error) {
    showToast('Failed to load subjects: ' + error.message, 'red');
    content.innerHTML = `
      <div style="padding:2rem;max-width:1200px;margin:0 auto;width:100%;text-align:center;">
        <p style="color:var(--red);">Error loading curriculum subjects.</p>
        <button class="btn btn-primary btn-sm" style="margin-top:1rem;" onclick="adminSubjectRefresh()">Retry</button>
      </div>
    `;
    return;
  }

  const normalizedSubjects = (dbSubjects || []).map(s => ({
    id: s.id,
    name: s.name,
    code: s.code || '',
    uni: s.university_name || '',
    reg: s.regulation_code || '',
    branch: s.branch || '',
    semester: s.semester || '',
    sem: s.semester || '',
    year: s.semester ? String(s.semester).charAt(0) : '1',
    credits: s.credits || 3,
    created_by: s.created_by || '',
    created_by_role: s.created_by_role || '',
  }));

  const universities = await loadUniversities();
  const regulations = await loadRegulations();
  const selectedUni = editingSubject?.uni || universities[0]?.name || '';
  const branchRows = await fetchActiveBranches({ universityName: selectedUni || null });
  const branchHtml = branchOptionsHtml(branchRows, { selectedValue: editingSubject?.branch || '' });

  content.innerHTML = `
    <div style="padding:2rem;max-width:1200px;margin:0 auto;width:100%;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:1.3rem;">
        <div>
          <h2 style="font-size:1.4rem;font-weight:800;letter-spacing:-0.02em;margin-bottom:4px;">All Subjects</h2>
          <p style="font-size:0.82rem;color:var(--text3);">All subjects from Supabase. You can edit only subjects you created.</p>
        </div>
        <span class="badge badge-primary">${normalizedSubjects.length} subject${normalizedSubjects.length === 1 ? '' : 's'}</span>
      </div>

      ${renderSubjectForm(editingSubject, { universities, branchHtml, regulations })}

      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin:1.2rem 0 0.8rem;">
        <h3>Database Subjects</h3>
        <button class="btn btn-ghost btn-sm" onclick="adminSubjectRefresh()">Refresh</button>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:1rem;">
        ${normalizedSubjects.length ? normalizedSubjects.map(renderSubjectCard).join('') : `
          <div class="card" style="grid-column:1/-1;text-align:center;color:var(--text3);padding:2rem;">
            No subjects found in database. Add your first subject above.
          </div>
        `}
      </div>
    </div>
  `;

  await bindBranchCascade('admin-subject-uni', 'admin-subject-branch');
}

function collectSubjectPayload() {
  const name = getFormValue('admin-subject-name');
  const code = getFormValue('admin-subject-code');
  const uni = getFormValue('admin-subject-uni');
  const reg = getFormValue('admin-subject-reg');
  const branch = getFormValue('admin-subject-branch');
  const year = getFormValue('admin-subject-year');
  const sem = getFormValue('admin-subject-sem');
  const credits = getFormValue('admin-subject-credits');

  if (!name || !code || !uni || !reg || !branch || !year || !sem || !credits) {
    showToast('Fill all subject fields', 'red');
    return null;
  }

  return {
    name,
    code,
    uni,
    reg,
    branch,
    year,
    sem,
    credits,
  };
}

export function installAdminSubjectCrud() {
  if (window.__aimeasyAdminSubjectCrudInstalled) return;

  window.adminSubjectCreate = async function adminSubjectCreate() {
    const payload = collectSubjectPayload();
    if (!payload) return;

    const meta = subjectCreateMeta();
    const dbPayload = {
      name: payload.name,
      code: payload.code,
      university_name: payload.uni,
      regulation_code: payload.reg,
      branch: payload.branch,
      semester: payload.sem,
      year: payload.year,
      credits: Number(payload.credits),
      status: 'active',
      createdBy: meta.created_by,
      created_by: meta.created_by,
      created_by_role: meta.created_by_role,
    };

    showToast('Saving to database...', 'blue');
    const { error } = await window.aimeasyCreateSubject(dbPayload);
    if (error) {
      showToast('Failed to create subject: ' + error.message, 'red');
      return;
    }

    showToast('Subject added successfully', 'green');
    await renderAdminSubjectCrud();
    window.aiiensRefreshActiveAdminSurfaces?.();
  };

  window.adminSubjectEdit = async function adminSubjectEdit(id) {
    showToast('Fetching subject details...', 'blue');
    const { data, error } = await window.supabase
      .from('subjects')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error || !data) {
      showToast('Subject not found in database', 'red');
      return;
    }

    if (!isRecordOwner(data)) {
      showToast('You can only edit subjects you created', 'red');
      return;
    }

    const normalized = {
      id: data.id,
      name: data.name,
      code: data.code || '',
      uni: data.university_name || '',
      reg: data.regulation_code || '',
      branch: data.branch || '',
      sem: data.semester || '',
      year: data.semester ? String(data.semester).charAt(0) : '1',
      credits: data.credits || 3
    };

    renderAdminSubjectCrud(normalized);
  };

  window.adminSubjectUpdate = async function adminSubjectUpdate() {
    const id = getFormValue('admin-subject-id');
    const payload = collectSubjectPayload();
    if (!payload || !id) return;

    const { data: existing } = await window.supabase.from('subjects').select('*').eq('id', id).maybeSingle();
    if (existing && !isRecordOwner(existing)) {
      showToast('You can only update subjects you created', 'red');
      return;
    }

    const meta = subjectCreateMeta();
    const dbPayload = {
      name: payload.name,
      code: payload.code,
      university_name: payload.uni,
      regulation_code: payload.reg,
      branch: payload.branch,
      semester: payload.sem,
      year: payload.year,
      credits: Number(payload.credits),
      status: 'active',
      createdBy: meta.created_by,
      created_by: meta.created_by,
      created_by_role: meta.created_by_role,
    };

    showToast('Saving changes...', 'blue');
    const { error } = await window.aimeasyUpdateSubject(id, dbPayload);
    if (error) {
      showToast('Failed to update subject: ' + error.message, 'red');
      return;
    }

    showToast('Subject updated successfully', 'green');
    await renderAdminSubjectCrud();
    window.aiiensRefreshActiveAdminSurfaces?.();
  };

  window.adminSubjectDelete = async function adminSubjectDelete(id) {
    if (!id) return;
    if (!confirm('Are you sure you want to delete this subject and its units?')) return;

    const { data: row } = await window.supabase.from('subjects').select('*').eq('id', id).maybeSingle();
    if (row && !isRecordOwner(row)) {
      showToast('You can only delete subjects you created', 'red');
      return;
    }

    showToast('Deleting from database...', 'blue');
    const ownerKey = getPortalActorId() || getPortalActorUsername();
    const { error } = await window.aimeasyDeleteSubject(id, ownerKey);
    if (error) {
      showToast('Failed to delete subject: ' + error.message, 'red');
      return;
    }

    showToast('Subject deleted', 'red');
    await renderAdminSubjectCrud();
    window.aiiensRefreshActiveAdminSurfaces?.();
  };

  window.adminSubjectOpen = function adminSubjectOpen(encodedSubject) {
    let subject;
    try {
      subject = JSON.parse(decodeURIComponent(encodedSubject));
    } catch {
      showToast('Could not open subject', 'red');
      return;
    }

    if (typeof window.v10AdminOpenSubjectObj === 'function') {
      window.v10AdminOpenSubjectObj(subject);
      return;
    }

    if (typeof window.adminOpenSubject === 'function') {
      window.adminOpenSubject(subject);
      return;
    }

    showToast('Subject opened, but unit manager is not ready yet', 'amber');
  };

  window.adminSubjectRefresh = function adminSubjectRefresh() {
    renderAdminSubjectCrud();
  };

  window.adminSubjectCancelEdit = function adminSubjectCancelEdit() {
    renderAdminSubjectCrud();
  };

  const originalSwitchAdminSection = window.switchAdminSection;
  if (typeof originalSwitchAdminSection === 'function') {
    window.switchAdminSection = function switchAdminSectionWithCrud(section) {
      if (section === 'subjects') {
        document.querySelectorAll('[id^="admin-nav-"]').forEach((el) => el.classList.remove('active'));
        document.getElementById('admin-nav-subjects')?.classList.add('active');
        const titleEl = document.getElementById('admin-topbar-title');
        if (titleEl) titleEl.textContent = 'Subject CRUD';
        renderAdminSubjectCrud();
        if (window.location.hash !== '#/admin/subjects') {
          window.location.hash = '#/admin/subjects';
        }
        return;
      }

      originalSwitchAdminSection.call(this, section);
    };
  }

  window.v10AdminSubjects = renderAdminSubjectCrud;
  window.renderAdminSubjectCrud = renderAdminSubjectCrud;
  window.__aimeasyAdminSubjectCrudInstalled = true;
}
