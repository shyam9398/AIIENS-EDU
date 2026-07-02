// AIIENS Edu targeted fixes: auth, regulations, counters, navigation, menus, and placeholders.
window.v10Esc = window.v10Esc || function(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};
(function installAIIENSEduFixes() {
  const REG_KEY = 'edusync_regulations'; // legacy key (no longer used for regulation CRUD)

  function read(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key) || '') ?? fallback;
    } catch (e) {
      return fallback;
    }
  }

  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }


  function esc(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function unitNumber(value, fallback = 1) {
    const source = typeof value === 'object'
      ? (value.sort_order || value.order || value.unit || value.id || value.name || value.title)
      : value;
    const text = String(source ?? '');
    const explicit = text.match(/unit\s*[-:]?\s*(\d+)/i);
    if (explicit) return Number(explicit[1]);
    const numeric = Number(text);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
    return Number(fallback) || 1;
  }

  function unitLabel(value, fallback = 1) {
    return `Unit - ${unitNumber(value, fallback)}`;
  }

  window.aimeasyUnitLabel = unitLabel;

  function findSubjectById(id) {
    if (typeof window.findSubjectById === 'function') return window.findSubjectById(id);
    const custom = JSON.parse(localStorage.getItem('edusync_custom_subjects') || '[]');
    return custom.find(s => String(s.id) === String(id));
  }

  function normalizeStatus(value) {
    return String(value || 'Active').trim().toLowerCase();
  }

  function uniqueByName(rows) {
    const seen = new Set();
    const deletedDefaults = new Set(read('edusync_deleted_universities', []).map((name) => String(name || '').toLowerCase()));
    return rows
      .map((row) => ({
        name: String(row?.name || row?.university_name || row?.university || row?.code || row || '').trim(),
        code: String(row?.code || row?.university_code || row?.name || row || '').trim(),
        state: String(row?.state || '').trim(),
        status: String(row?.status || 'Active').trim() || 'Active',
        id: row?.id,
      }))
      .filter((row) => {
        const key = row.name.toLowerCase();
        return row.name && normalizeStatus(row.status) !== 'inactive' && normalizeStatus(row.status) !== 'deleted' && !deletedDefaults.has(key);
      })
      .filter((row) => {
        const key = row.name.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  let cachedRegulations = [];

  function regIconActionBtn(onclick, type, label) {
    const danger = type === 'delete' ? ' danger' : '';
    const icon = type === 'edit' ? '✎' : '×';
    return `<button class="icon-action-btn${danger}" onclick="${onclick}" title="${esc(label)}" aria-label="${esc(label)}"><span aria-hidden="true">${icon}</span></button>`;
  }

  function setRegulationSubmitMode(isEdit) {
    if (typeof window.aiiensSetCrudSubmitButton === 'function') {
      window.aiiensSetCrudSubmitButton('aimeasy-reg-submit', isEdit);
    } else {
      const btn = document.getElementById('aimeasy-reg-submit');
      if (btn) btn.textContent = isEdit ? 'Save Changes' : 'Create';
    }
    const btn = document.getElementById('aimeasy-reg-submit');
    const cancelId = 'aimeasy-reg-cancel';
    let cancelBtn = document.getElementById(cancelId);
    if (isEdit) {
      if (!cancelBtn && btn) {
        btn.insertAdjacentHTML('afterend', ` <button class="btn btn-ghost btn-sm" id="${cancelId}" onclick="aimeasyCancelRegulationEdit()">Cancel</button>`);
      }
    } else {
      if (cancelBtn) cancelBtn.remove();
    }
  }

  async function fetchRegulationRows() {
    if (typeof window.aiiensFetchRegulationsCatalog === 'function') {
      window.__aiiensRegulationRows = await window.aiiensFetchRegulationsCatalog();
      return window.__aiiensRegulationRows;
    }
    const supabase = window.__AIMEASY_SUPABASE__;
    if (!supabase) return window.__aiiensRegulationRows || [];
    try {
      const { data, error } = await supabase
        .from('regulations')
        .select('id, regulation_name, regulation_code, status')
        .order('regulation_code', { ascending: true });
      if (error) throw error;
      window.__aiiensRegulationRows = (data || []).filter(
        (row) => String(row.status || 'active').toLowerCase() === 'active',
      );
      cachedRegulations = window.__aiiensRegulationRows
        .map((r) => String(r.regulation_code || r.regulation_name || '').trim().toUpperCase())
        .filter(Boolean);
      return window.__aiiensRegulationRows;
    } catch (e) {
      console.warn('Failed to fetch regulations from Supabase:', e);
      return window.__aiiensRegulationRows || [];
    }
  }

  async function regulations() {
    const rows = await fetchRegulationRows();
    return rows
      .map((r) => String(r.regulation_code || r.regulation_name || '').trim().toUpperCase())
      .filter(Boolean);
  }

  async function universities() {
    if (typeof window.getUniversities === 'function') return window.getUniversities();
    if (typeof window.aiiensFetchActiveUniversities === 'function') return window.aiiensFetchActiveUniversities();
    const supabase = window.__AIMEASY_SUPABASE__;
    if (!supabase) return [];
    try {
      const { data, error } = await supabase
        .from('universities')
        .select('id, name, code, state, status')
        .order('name', { ascending: true });
      if (error) throw error;
      return uniqueByName((data || []).filter((row) => String(row.status || 'active').toLowerCase() === 'active'));
    } catch (e) {
      console.warn('Failed to fetch universities from Supabase:', e);
      return [];
    }
  }

  async function refreshRegulationUI() {
    if (window.aiiensIsAdminEditing && window.aiiensIsAdminEditing()) {
      console.log('[Aiiens Admin] Skipping refreshRegulationUI because Admin is editing.');
      return;
    }
    try {
      if (window.APP?.adminType) {
        installRegulationManager?.();
      }
      await renderRegulationList?.();
      await window.aiiensRefreshAllCatalogDropdowns?.(document);
    } catch (e) {
      // ignore
    }
  }
  window.aimeasyRefreshRegulationUI = refreshRegulationUI;



  async function updateRegulationDropdowns(root = document) {
    const regs = await regulations();
    root.querySelectorAll('select').forEach((select) => {

      const id = (select.id || '').toLowerCase();
      const label = (select.closest('.input-group')?.querySelector('label,.v10-label')?.textContent || '').toLowerCase();
      const onchange = select.getAttribute('onchange') || '';
      if (!id.includes('reg') && !label.includes('regulation') && !onchange.includes('reg')) return;
      const current = select.value;
      const first = onchange.includes('Filter') || onchange.includes('filter') ? 'All Regulations' : 'Select Regulation';
      select.innerHTML = `<option value="">${first}</option>` + regs.map((reg) => `<option value="${esc(reg)}"${current === reg ? ' selected' : ''}>${esc(reg)}</option>`).join('');
    });
  }
  window.aimeasyUpdateRegulationDropdowns = updateRegulationDropdowns;

  async function updateUniversityDropdowns(root = document) {
    if (typeof window.aiiensHydrateAllUniversityDropdowns === 'function') {
      await window.aiiensHydrateAllUniversityDropdowns(root);
      return;
    }
    const rows = await universities();
    root.querySelectorAll('select').forEach((select) => {
      const id = (select.id || '').toLowerCase();
      const label = (select.closest('.input-group')?.querySelector('label,.v10-label')?.textContent || '').toLowerCase();
      const onchange = select.getAttribute('onchange') || '';
      if (!id.includes('uni') && !label.includes('university') && !onchange.toLowerCase().includes('uni')) return;
      const current = select.value;
      const first = onchange.includes('Filter') || onchange.includes('filter') ? 'All Universities' : 'Select University';
      select.innerHTML = `<option value="">${first}</option>` + rows.map((row) => {
        const value = row.name || row.code;
        return `<option value="${esc(value)}"${current === value ? ' selected' : ''}>${esc(row.name || row.code)}</option>`;
      }).join('');
    });
    if (root === document && document.getElementById('university-list')) {
      window.aiiensRenderUniversities?.();
    }
  }
  window.aiiensUpdateUniversityDropdowns = updateUniversityDropdowns;

  async function installRegulationManager() {
    const content = document.getElementById('admin-content');
    if (!content || document.getElementById('aimeasy-regulation-manager')) return;
    const grid = content.querySelector('.admin-manage-grid') || content.querySelector('div[style*="grid-template-columns"]');
    if (!grid) return;
    const regs = await regulations();
    grid.insertAdjacentHTML('beforeend', `

      <div class="card" id="aimeasy-regulation-manager">
        <h3 style="margin-bottom:1rem;">Regulation Management</h3>
        <p style="font-size:0.82rem;color:var(--text2);margin-bottom:1rem;">Created regulations are the only options shown to Sub Admin, Creator, and Student filters.</p>
        <div class="input-group">
          <label>New Regulation</label>
          <div style="display:flex;gap:8px;">
            <input class="input" id="aimeasy-reg-name" placeholder="e.g. R24">
            <button class="btn btn-primary btn-sm" id="aimeasy-reg-submit" onclick="aimeasyAddRegulation()">Create</button>
          </div>
        </div>
        <div style="margin-top:0.8rem;">
          ${regs.length ? regs.map((reg, index) => `
            <div style="display:flex;align-items:center;gap:8px;padding:9px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:5px;font-size:0.85rem;">
              <span style="flex:1;font-weight:600;">${esc(reg)}</span>
              <span class="badge badge-green">Live</span>
              <button class="btn btn-ghost btn-sm" onclick="aimeasyEditRegulation(${index})">Edit</button>
              <button class="btn btn-danger btn-sm" onclick="aimeasyDeleteRegulation(${index})">Delete</button>
            </div>`).join('') : '<div style="font-size:0.82rem;color:var(--text3);padding:8px 0;">No regulations created yet.</div>'}
        </div>
      </div>`);
    await renderRegulationList();
  }

  async function renderRegulationList() {
    if (window.aiiensIsAdminEditing && window.aiiensIsAdminEditing()) {
      console.log('[Aiiens Admin] Skipping renderRegulationList because Admin is editing.');
      return;
    }
    const list = document.getElementById('aimeasy-regulation-list');
    if (!list) return;
    const rows = await fetchRegulationRows();
    list.innerHTML = rows.length ? rows.map((row, index) => {
      const label = String(row.regulation_code || row.regulation_name || '').trim().toUpperCase();
      return `
      <div class="v10-item regulation-row">
        <div class="v10-item-body"><div class="v10-item-title">${esc(label)}</div></div>
        <span class="badge badge-green">Live</span>
        ${regIconActionBtn(`aimeasyEditRegulation(${index})`, 'edit', `Edit ${label}`)}
        ${regIconActionBtn(`aimeasyDeleteRegulation(${index})`, 'delete', `Delete ${label}`)}
      </div>`;
    }).join('') : '<div class="empty-state-card">No regulations created yet.</div>';
  }

  window.aimeasyAddRegulation = async function aimeasyAddRegulation() {
    const input = document.getElementById('aimeasy-reg-name');
    const reg = input?.value.trim().toUpperCase();
    const editId = input?.dataset.editId;
    if (!reg) {
      showToast('Enter regulation', 'red');
      return;
    }

    const supabase = window.__AIMEASY_SUPABASE__;
    if (!supabase) {
      showToast('Supabase not configured', 'red');
      return;
    }

    if (editId) {
      const { error: upErr } = await supabase
        .from('regulations')
        .update({
          regulation_name: reg,
          regulation_code: reg,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editId);
      if (upErr) {
        showToast(upErr.message || 'Failed to update regulation', 'red');
        return;
      }
      if (input) {
        input.value = '';
        delete input.dataset.editId;
      }
      setRegulationSubmitMode(false);
      showToast('Regulation updated (Supabase).', 'green');
      await refreshRegulationUI();
      return;
    }

    const { data: existing } = await supabase
      .from('regulations')
      .select('id, regulation_name, regulation_code')
      .or(`regulation_code.eq.${reg},regulation_name.eq.${reg}`);

    if (existing?.length) {
      showToast('Regulation already exists', 'amber');
      return;
    }

    let authUser = null;
    try {
      authUser = supabase.auth?.getUser ? (await supabase.auth.getUser())?.data?.user : null;
    } catch (e) {
      authUser = null;
    }
    const appUser = window.APP?.user || {};
    const createdBy = String(authUser?.id || authUser?.email || appUser.email || appUser.name || 'admin').trim() || 'admin';
    const regulationPayload = {
      regulation_name: reg,
      regulation_code: reg,
      university: appUser.university || appUser.university_name || null,
      status: 'active',
      created_by: createdBy,
    };
    const { error: insErr } = await supabase.from('regulations').insert([regulationPayload]);

    if (insErr) {
      showToast(insErr.message || 'Failed to create regulation', 'red');
      return;
    }

    if (input) input.value = '';
    showToast('Regulation saved to Supabase.', 'green');
    await refreshRegulationUI();
  };



  window.aimeasyEditRegulation = async function aimeasyEditRegulation(index) {
    const rows = window.__aiiensRegulationRows || (await fetchRegulationRows());
    const row = rows[index];
    if (!row) return;
    const input = document.getElementById('aimeasy-reg-name');
    if (!input) return;
    input.value = String(row.regulation_code || row.regulation_name || '').trim().toUpperCase();
    input.dataset.editId = row.id;
    setRegulationSubmitMode(true);
    input.focus();
  };

  window.aimeasyCancelRegulationEdit = function aimeasyCancelRegulationEdit() {
    const input = document.getElementById('aimeasy-reg-name');
    if (input) {
      input.value = '';
      delete input.dataset.editId;
    }
    setRegulationSubmitMode(false);
    window.aimeasyRefreshRegulationUI?.();
  };



  window.aimeasyDeleteRegulation = async function aimeasyDeleteRegulation(index) {
    const rows = window.__aiiensRegulationRows || (await fetchRegulationRows());
    const row = rows[index];
    const label = String(row?.regulation_code || row?.regulation_name || '').trim().toUpperCase();
    if (!row || !confirm(`Delete "${label}"?`)) return;

    const supabase = window.__AIMEASY_SUPABASE__;
    if (!supabase) {
      showToast('Supabase not configured', 'red');
      return;
    }

    const { error: delErr } = await supabase.from('regulations').delete().eq('id', row.id);
    if (delErr) {
      showToast(delErr.message || 'Failed to delete regulation', 'red');
      return;
    }

    showToast('Regulation deleted (Supabase).', 'red');
    await refreshRegulationUI();
  };



  async function statsLiveFromSupabase() {
    const supabase = window.__AIMEASY_SUPABASE__;
    if (!supabase) return {
      students: 0,
      users: 0,
      subjects: 0,
      branches: 0,
      semesters: 0,
      units: 0,
      topics: 0,
      videos: 0,
      notes: 0,
      pyqs: 0,
      iqs: 0,
      totalRegulations: 0,
      recentRegulations: []
    };

    const { data: dashboardCounts, error: dashboardCountsError } = await supabase.rpc('get_dashboard_counts');
    if (dashboardCountsError) {
      console.warn('get_dashboard_counts failed:', dashboardCountsError.message);
    }
    const counts = Array.isArray(dashboardCounts) ? dashboardCounts[0] || {} : dashboardCounts || {};
    const countTable = async (table, apply) => {
      try {
        let query = supabase.from(table).select('*', { count: 'exact', head: true });
        if (typeof apply === 'function') query = apply(query);
        const { count, error } = await query;
        if (error) {
          console.warn(`${table} count failed:`, error.message);
          return 0;
        }
        return Number(count || 0);
      } catch (e) {
        console.warn(`${table} count failed:`, e?.message || e);
        return 0;
      }
    };
    const distinctSubjectCount = async (column) => {
      try {
        const { data, error } = await supabase.from('subjects').select(column);
        if (error) return 0;
        return new Set((data || []).map(row => row?.[column]).filter(Boolean)).size;
      } catch (e) {
        return 0;
      }
    };

    // Regulations from public.regulations
    const { count: regsCount } = await supabase
      .from('regulations')
      .select('*', { count: 'exact', head: true });

    const { data: recentRegRows } = await supabase
      .from('regulations')
      .select('id, regulation_name, regulation_code, created_at')
      .order('created_at', { ascending: false })
      .limit(5);
    const [
      profileCount,
      roleProfileCount,
      subjectCount,
      branchCount,
      branchNameCount,
      semesterCount,
      unitCount,
      topicCount,
      topicVideoCount,
      contentVideoCount,
      noteCount,
      pyqCount,
      iqCount
    ] = await Promise.all([
      countTable('profiles'),
      countTable('role_profiles'),
      countTable('subjects'),
      countTable('branches'),
      distinctSubjectCount('branch'),
      distinctSubjectCount('semester'),
      countTable('units'),
      countTable('topics'),
      countTable('topic_videos'),
      countTable('content_items', q => q.eq('content_type', 'video')),
      countTable('content_items', q => q.eq('content_type', 'note')),
      countTable('content_items', q => q.eq('content_type', 'pyq')),
      countTable('content_items', q => q.eq('content_type', 'iq'))
    ]);
    const students = Number(counts.students || 0);
    const creators = Number(counts.creators || 0);
    const users = Number(counts.users || roleProfileCount || profileCount || students + creators || 0);

    return {
      students,
      users,
      creators,
      subjects: Number(counts.subjects || subjectCount || 0),
      branches: Number(counts.branches || branchCount || branchNameCount || 0),
      semesters: Number(counts.semesters || semesterCount || 0),
      units: unitCount,
      topics: topicCount,
      totalRegulations: Number(counts.regulations || regsCount || 0),
      recentRegulations: (recentRegRows || []).map(r => String(r.regulation_name || '').trim() || String(r.regulation_code || '').trim()).filter(Boolean),
      videos: topicVideoCount + contentVideoCount,
      notes: noteCount,
      pyqs: pyqCount,
      iqs: iqCount
    };
  }


  function statCards(items) {
    return items.map(([label, value, color]) => `
      <div class="admin-stat-card">
        <div class="admin-stat-accent" style="background:${color};"></div>
        <div style="font-size:2.3rem;font-weight:800;color:${color};">${value}</div>
        <div style="font-size:0.88rem;font-weight:600;margin-top:4px;">${label}</div>
        <div style="font-size:0.75rem;color:var(--text3);margin-top:4px;">Real records only</div>
      </div>`).join('');
  }

  async function renderAdminDashboardLive() {
    const content = document.getElementById('admin-content');
    if (!content) return;

    content.innerHTML = `
      <div style="padding:2rem;max-width:1100px;margin:0 auto;width:100%;">
        <div style="margin-bottom:1.6rem;">
          <h2 style="font-size:1.5rem;font-weight:800;letter-spacing:-0.02em;margin-bottom:4px;">Admin Dashboard</h2>
          <p style="font-size:0.84rem;color:var(--text3);">Loading live metrics from Supabase...</p>
        </div>
      </div>`;

    const s = await statsLiveFromSupabase();

    content.innerHTML = `
      <div style="padding:2rem;max-width:1100px;margin:0 auto;width:100%;">
        <div style="margin-bottom:1.6rem;">
          <h2 style="font-size:1.5rem;font-weight:800;letter-spacing:-0.02em;margin-bottom:4px;">Admin Dashboard</h2>
          <p style="font-size:0.84rem;color:var(--text3);">Supabase is the only source of truth.</p>
        </div>
        <div class="admin-grid" style="margin-bottom:2rem;">
          ${statCards([
            ['Total Students', s.students, 'var(--primary)'],
            ['Total Users', s.users, 'var(--green)'],
            ['Total Content Creators', s.creators, 'var(--teal)'],
            ['Total Subjects', s.subjects, 'var(--lavender)'],
            ['Total Branches', s.branches, 'var(--blue)'],
            ['Total Semesters', s.semesters, 'var(--red)'],
            ['Total Units', s.units, 'var(--teal)'],
            ['Total Topics', s.topics, 'var(--primary)'],
            ['Total Videos', s.videos, 'var(--blue)'],
            ['Total Notes', s.notes, 'var(--amber)'],
            ['Total PYQs', s.pyqs, 'var(--green)'],
            ['Total Regulations', s.totalRegulations, 'var(--amber)'],
          ])}
        </div>
      </div>`;
  }


  async function renderSubAdminDashboardLive() {
    const content = document.getElementById('sa-content');
    if (!content) return;
    const sa = APP.subAdminData || {};
    const s = await statsLiveFromSupabase();
    content.innerHTML = `
      <div style="padding:2rem;max-width:1100px;margin:0 auto;width:100%;">
        <div style="margin-bottom:1.6rem;">
          <h2 style="font-size:1.4rem;font-weight:800;letter-spacing:-0.02em;margin-bottom:4px;">Sub Admin Dashboard</h2>
          <p style="font-size:0.82rem;color:var(--text3);">${esc(sa.branch || 'Content Management')}</p>
        </div>
        <div class="admin-grid" style="margin-bottom:1.6rem;">
          ${statCards([
            ['Total Subjects', s.subjects, 'var(--primary)'],
            ['Total Units', s.units, 'var(--teal)'],
            ['Total Topics', s.topics, 'var(--lavender)'],
            ['Total Videos', s.videos, 'var(--blue)'],
            ['Total Notes', s.notes, 'var(--amber)'],
            ['Total PYQs', s.pyqs, 'var(--green)']
          ])}
        </div>
      </div>`;
  }

  function skillUpComingSoon() {
    const content = document.getElementById('sa-content');
    if (!content) return;
    content.innerHTML = `
      <div style="padding:2rem;max-width:720px;margin:0 auto;width:100%;">
        <div class="card" style="text-align:center;padding:2.2rem;">
          <div style="width:46px;height:46px;border-radius:12px;background:var(--primary-light);color:var(--primary);display:inline-flex;align-items:center;justify-content:center;font-weight:800;margin-bottom:1rem;">SU</div>
          <h2 style="font-size:1.25rem;font-weight:800;margin-bottom:6px;">Skill Up</h2>
          <p style="font-size:0.9rem;color:var(--text2);">Coming Soon</p>
        </div>
      </div>`;
  }

  function pushOwnedHashRoute(path) {
    const hash = `#${path}`;
    if (window.location.hash === hash) return;
    window.__aimeasyRouterWritingHistory = true;
    try {
      window.history.pushState(
        { aimeasyPath: path, aimeasyIndex: (window.history.state?.aimeasyIndex ?? 0) + 1 },
        '',
        hash,
      );
    } finally {
      window.__aimeasyRouterWritingHistory = false;
    }
  }

  window.adminNavigateBack = function adminNavigateBack() {
    const isDashboardActive = document.getElementById('admin-nav-dashboard')?.classList.contains('active');
    if (isDashboardActive) {
      if (typeof adminLogout === 'function') {
        adminLogout();
      } else {
        window.aimeasySafeBack('/landing');
      }
    } else {
      switchAdminSection('dashboard');
    }
  };

  window.subAdminNavigateBack = function subAdminNavigateBack() {
    if (window._v10SASubjId && window._v10SASubj && typeof v10SAUnitsPage === 'function') {
      window._v10SASubjId = null;
      window._v10SAUnitId = null;
      v10SAUnitsPage(window._v10SASubj);
      return;
    }
    if (window._v10SASubj && typeof v10SASubjects === 'function') {
      window._v10SASubj = null;
      v10SASubjects();
      return;
    }
    const isDashboardActive = document.getElementById('sa-nav-dashboard')?.classList.contains('active');
    if (isDashboardActive) {
      if (typeof subAdminBack === 'function') {
        subAdminBack();
      } else {
        window.aimeasySafeBack('/landing');
      }
    } else {
      switchSASection('dashboard');
    }
  };

  window.creatorNavigateBack = function creatorNavigateBack() {
    if (window._crSelectedUnit && typeof renderCRAddContent === 'function') {
      window._crSelectedUnit = null;
      renderCRAddContent();
      return;
    }
    if (window._crSelectedSubj && typeof renderCRAddContent === 'function') {
      window._crSelectedSubj = null;
      renderCRAddContent();
      return;
    }
    const isDashboardActive = document.getElementById('cr-nav-dashboard')?.classList.contains('active');
    if (isDashboardActive) {
      if (typeof creatorLogout === 'function') {
        creatorLogout();
      } else {
        window.aimeasySafeBack('/landing');
      }
    } else {
      switchCRSection('dashboard');
    }
  };

  function addMenuIcons() {
    const paths = {
      dashboard: 'M3 13h8V3H3v10zm10 8h8V3h-8v18zM3 21h8v-6H3v6z',
      create: 'M12 5v14M5 12h14',
      subjects: 'M4 19.5V5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-1.5z',
      approvals: 'M20 6 9 17l-5-5',
      creatorview: 'M12 3v18M3 12h18',
      skillup: 'M13 2 3 14h8l-1 8 11-14h-8l1-6z',
      choosing: 'M12 2l7 19-7-4-7 4 7-19z',
      addcontent: 'M12 5v14M5 12h14',
      view: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z'
    };
    document.querySelectorAll('.admin-nav-item[id]').forEach((item) => {
      const span = item.querySelector('span:first-child');
      if (!span || span.querySelector('svg')) return;
      const key = item.id.replace(/^(admin|sa|cr)-nav-/, '');
      span.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[key] || 'M4 6h16M4 12h16M4 18h16'}"></path></svg>`;
      span.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;width:20px;';
    });
  }

  function replaceUnitButtons() {
    document.querySelectorAll('.v10-unit-card,.adm-unit-card').forEach((card) => {
      if (card.querySelector('.aimeasy-unit-dots')) return;
      const buttons = Array.from(card.querySelectorAll('button')).filter((button) => /edit|delete|del|✏|🗑/i.test((button.textContent || '') + (button.title || '')));
      if (buttons.length < 2) return;
      const edit = buttons.find((button) => /edit|✏/i.test((button.textContent || '') + (button.title || '')));
      const del = buttons.find((button) => /delete|del|🗑/i.test((button.textContent || '') + (button.title || '')));
      if (!edit || !del) return;
      const editCall = edit.getAttribute('onclick') || '';
      const delCall = del.getAttribute('onclick') || '';
      const parent = edit.parentElement;
      buttons.forEach((button) => button.remove());
      parent.insertAdjacentHTML('beforeend', `<button class="v10-dot-btn aimeasy-unit-dots" title="Options" onclick="aimeasyOpenUnitMenu(this,\`${editCall.replace(/`/g, '\\`')}\`,\`${delCall.replace(/`/g, '\\`')}\`)">⋮</button>`);
    });
  }

  window.aimeasyOpenUnitMenu = function aimeasyOpenUnitMenu(button, editCall, delCall) {
    window.event?.stopPropagation();
    document.querySelectorAll('.aimeasy-unit-menu').forEach((menu) => menu.remove());
    button.parentElement.insertAdjacentHTML('beforeend', `<div class="adm-popup aimeasy-unit-menu"><button class="adm-popup-item" onclick="${editCall}">Edit</button><button class="adm-popup-item red" onclick="${delCall}">Delete</button></div>`);
  };

  function saveUserProfile(user) {
    const users = read('aiiens_users', []);
    const key = user.id || user.googleId || user.email;
    const index = users.findIndex((item) => (item.id || item.googleId || item.email) === key);
    if (index >= 0) users[index] = { ...users[index], ...user };
    else users.push(user);
    write('aiiens_users', users);
    localStorage.setItem('aiiens_session_user', JSON.stringify(user));
    if (user.googleId || user.id) localStorage.setItem('aiiens_user_' + (user.googleId || user.id), JSON.stringify(user));
  }

  localStorage.removeItem('aimeasy_oauth_role');
  localStorage.removeItem('aimeasy_active_role');

  if (!window.submitAdminLogin?.isPatched) {
    const originalSubmitAdminLogin = window.submitAdminLogin;
    window.submitAdminLogin = function submitAdminLoginPersistent() {
      originalSubmitAdminLogin?.();
    };
    window.submitAdminLogin.isPatched = true;
  }


  if (!window.adminLogout?.isPatched) {
    const originalAdminLogout = window.adminLogout;
    window.adminLogout = async function adminLogoutFixed() {
      if (window.APP) {
        window.APP.adminType = null;
        window.APP.subAdminData = null;
        window.APP.portalAuth = false;
        window.APP.session = false;
        window.APP.user = null;
        window.APP.role = 'student';
      }
      window.__aimeasyPreserveRoleRoute = '';
      originalAdminLogout?.();
    };
    window.adminLogout.isPatched = true;
  }

  if (!window.subAdminBack?.isPatched) {
    const originalSubAdminBack = window.subAdminBack;
    window.subAdminBack = function subAdminBackPreserveSession() {
      // Back button must never clear session.
      console.log('[NAVIGATION] Back button pressed');
      console.log('[AUTH] Session preserved');
      originalSubAdminBack?.();
    };
    window.subAdminBack.isPatched = true;
  }

  if (!window.creatorLogout?.isPatched) {
    const originalCreatorLogout = window.creatorLogout;
    window.creatorLogout = async function creatorLogoutFixed() {
      if (window.APP) {
        window.APP.adminType = null;
        window.APP.subAdminData = null;
        window.APP.session = false;
        window.APP.user = null;
        window.APP.role = 'student';
      }
      window.__aimeasyPreserveRoleRoute = '';
      const supabase = window.__AIMEASY_SUPABASE__;
      if (supabase) {
        try {
          await supabase.auth.signOut();
        } catch (e) {
          console.warn('Supabase creator logout signout error:', e);
        }
      }
      originalCreatorLogout?.();
    };
    window.creatorLogout.isPatched = true;
  }

  let isSyncing = false;
  window.aimeasySyncAndRefresh = async function aimeasySyncAndRefresh(customRenderFn) {
    if (isSyncing) return;
    if (typeof window.hydrateLegacyState === 'function') {
      isSyncing = true;
      try {
        await window.hydrateLegacyState();
        if (typeof customRenderFn === 'function') {
          customRenderFn();
        } else {
          // Re-render active views
          const activeScreen = document.querySelector('.screen.active')?.id;
          if (activeScreen === 'screen-app') {
            const activePage = [...document.querySelectorAll('[id^="page-"]')].find(p => p.style.display !== 'none')?.id?.replace('page-', '');
            if (activePage === 'dashboard') {
              if (typeof updateStudentDashboardMetrics === 'function') updateStudentDashboardMetrics();
            } else if (activePage === 'subjects') {
              if (typeof renderSubjects === 'function') renderSubjects();
            } else if (activePage === 'units') {
              if (window.APP?.currentSubject && typeof renderUnits === 'function') renderUnits(window.APP.currentSubject);
            } else if (activePage === 'unit-content') {
              if (window.APP?.currentSubject && window.APP?.currentUnit) {
                const subjId = window.APP.currentSubject.id || window.APP.currentSubject.rawId || window.APP.currentSubject;
                const unitNum = window.APP.currentUnit;
                if (typeof renderVideoList === 'function') renderVideoList(subjId, unitNum);
                if (typeof renderNotes === 'function') renderNotes(subjId, unitNum);
                if (typeof renderPYQ === 'function') renderPYQ(null, subjId, unitNum);
                if (typeof renderIQ === 'function') renderIQ(subjId, unitNum);
              }
            }
          } else if (activeScreen === 'screen-admin') {
            const activeAdminTab = document.querySelector('.admin-nav-item.active')?.id?.replace('admin-nav-', '');
            if (typeof window.aiiensRefreshActiveAdminSurfaces === 'function') {
              window.aiiensRefreshActiveAdminSurfaces();
            } else if (activeAdminTab === 'dashboard') {
              if (typeof renderAdminDashboardLive === 'function') renderAdminDashboardLive();
            } else if (activeAdminTab === 'subjects') {
              if (typeof renderAdminSubjectCrud === 'function') renderAdminSubjectCrud();
            }
          } else if (activeScreen === 'screen-subadmin') {
            const activeSaTab = document.querySelector('.admin-nav-item.active')?.id?.replace('sa-nav-', '');
            if (typeof window.aiiensRefreshActiveAdminSurfaces === 'function') {
              window.aiiensRefreshActiveAdminSurfaces();
            } else if (activeSaTab === 'dashboard') {
              if (typeof renderSubAdminDashboardLive === 'function') renderSubAdminDashboardLive();
            } else if (activeSaTab === 'subjects' || activeSaTab === 'curriculum') {
              if (typeof v10SASubjects === 'function') v10SASubjects();
            }
          } else if (activeScreen === 'screen-creator') {
            const activeCrTab = document.querySelector('.admin-nav-item.active')?.id?.replace('cr-nav-', '');
            if (activeCrTab === 'dashboard') {
              if (typeof renderCRDashboard === 'function') renderCRDashboard();
            } else if (activeCrTab === 'choosing' || activeCrTab === 'addcontent') {
              if (typeof renderCRAddContent === 'function') renderCRAddContent();
            }
          }
        }
      } catch (e) {
        console.warn('[AIIENS Edu sync] Sync failed:', e);
      } finally {
        isSyncing = false;
      }
    }
  };

  if (!window.renderAdminSection?.isPatched) {
    const originalRenderAdminSection = window.renderAdminSection;
    window.renderAdminSection = function renderAdminSectionFixed(section) {
      if (section === 'dashboard') {
        renderAdminDashboardLive();
        return;
      }
      originalRenderAdminSection?.(section);
      if (section === 'create') installRegulationManager();
      updateRegulationDropdowns();
      updateUniversityDropdowns();
      addMenuIcons();
    };
    window.renderAdminSection.isPatched = true;
  }

  if (!window.switchSASection?.isPatched) {
    const originalSwitchSASection = window.switchSASection;
    window.switchSASection = function switchSASectionFixed(section) {
      const SA_ROUTE_TO_SECTION = {
        'create-subject': 'subjects',
        'content': 'view',
        'manage-content': 'view',
        'approvals': 'urls',
        'url-approvals': 'urls'
      };
      const mappedSection = SA_ROUTE_TO_SECTION[section] || section;
      if (mappedSection === 'dashboard') {
        closeSASidebar?.();
        document.querySelectorAll('[id^="sa-nav-"]').forEach((el) => el.classList.remove('active'));
        document.getElementById('sa-nav-dashboard')?.classList.add('active');
        const title = document.getElementById('sa-topbar-title');
        if (title) title.textContent = 'Sub Admin Dashboard';
        renderSubAdminDashboardLive();
        addMenuIcons();
        pushOwnedHashRoute('/subadmin/dashboard');
        return;
      }
      if (mappedSection === 'skillup') {
        closeSASidebar?.();
        skillUpComingSoon();
        addMenuIcons();
        pushOwnedHashRoute('/subadmin/skillup');
        return;
      }
      originalSwitchSASection?.(mappedSection);
      updateRegulationDropdowns();
      updateUniversityDropdowns();
      addMenuIcons();
      setTimeout(replaceUnitButtons, 0);
    };
    window.switchSASection.isPatched = true;
  }

  if (!window.switchAdminSection?.isPatched) {
    const originalSwitchAdminSection = window.switchAdminSection;
    window.switchAdminSection = function switchAdminSectionFixed(section) {
      const ADMIN_ROUTE_TO_SECTION = {
        'manage': 'create',
        'management': 'create',
        'create-management': 'create',
        'create-manage': 'create',
        'url-approvals': 'approvals',
        'urls': 'approvals'
      };
      const mappedSection = ADMIN_ROUTE_TO_SECTION[section] || section;
      if (originalSwitchAdminSection) {
        originalSwitchAdminSection(mappedSection);
      } else if (typeof switchAdminSection === 'function') {
        switchAdminSection(mappedSection);
      }
      updateRegulationDropdowns();
      updateUniversityDropdowns();
      addMenuIcons();
    };
    window.switchAdminSection.isPatched = true;
  }

  if (!window.switchCRSection?.isPatched) {
    const originalSwitchCRSection = window.switchCRSection;
    window.switchCRSection = function switchCRSectionFixed(section) {
      originalSwitchCRSection?.(section);
    };
    window.switchCRSection.isPatched = true;
  }

  ['v10SASubjects', 'v10SAUnitsPage', 'v10AdminSubjects', 'v10AdminOpenSubjectObj', 'v11AdminSubjectsPage', 'v11AdminUnitsPage', 'v11CreatorUnitsPage', 'renderCRChoosing', 'renderCRAddContent', 'renderSubjects'].forEach((name) => {
    const original = window[name];
    if (typeof original !== 'function' || original.isPatched) return;
    window[name] = function patchedRender(...args) {
      const result = original.apply(this, args);
      updateRegulationDropdowns();
      updateUniversityDropdowns();
      addMenuIcons();
      setTimeout(replaceUnitButtons, 0);
      return result;
    };
    window[name].isPatched = true;
  });

  if (!window.launchTeacherPortal?.isPatched) {
    const originalLaunchTeacherPortal = window.launchTeacherPortal;
    window.launchTeacherPortal = function launchTeacherPortalFixed(teacher) {
      if (teacher?.role === 'content_creator' || teacher?.role === 'creator' || teacher?.role === 'teacher' || APP.adminType === 'content_creator') {
        APP.adminType = 'content_creator';
        APP.subAdminData = {
          username: teacher?.name || 'Creator',
          branch: teacher?.branch || 'CSE',
          role: 'content_creator'
        };
        launchCreatorScreen?.();
        return;
      }
      originalLaunchTeacherPortal?.(teacher);
    };
    window.launchTeacherPortal.isPatched = true;
  }

  if (!window.showScreen?.isPatched) {
    const originalShowScreen = window.showScreen;
    window.showScreen = function showScreenFixed(id, role) {
      if (id === 'screen-google-auth' && typeof window.syncGoogleAuthScreen === 'function') {
        window.syncGoogleAuthScreen();
      }
      if (id === 'screen-profile' && typeof window.aimeasyHydrateProfileDropdowns === 'function') {
        window.setTimeout(() => window.aimeasyHydrateProfileDropdowns(), 0);
      }
      const result = originalShowScreen?.(id, role);
      if (id !== 'screen-profile') {
        updateRegulationDropdowns();
        updateUniversityDropdowns();
      }
      addMenuIcons();
      return result;
    };
    window.showScreen.isPatched = true;
  }

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.aimeasy-unit-dots,.aimeasy-unit-menu')) {
      document.querySelectorAll('.aimeasy-unit-menu').forEach((menu) => menu.remove());
    }
  });

  if (!window.openAdminLogin?.isPatched) {
    const originalOpenAdminLogin = window.openAdminLogin;
    window.openAdminLogin = function openAdminLoginPersistent(type) {
      if (window.APP) {
        window.APP.adminType = null;
        window.APP.subAdminData = null;
        window.APP.session = false;
        window.APP.user = null;
      }
      window.__aimeasyPreserveRoleRoute = '';
      return originalOpenAdminLogin?.(type);
    };
    window.openAdminLogin.isPatched = true;
  }

  window.subAdminLogout = async function subAdminLogout() {
    if (window.APP) {
      window.APP.adminType = null;
      window.APP.subAdminData = null;
      window.APP.session = false;
      window.APP.user = null;
      window.APP.role = 'student';
    }
    window.__aimeasyPreserveRoleRoute = '';
    const supabase = window.__AIMEASY_SUPABASE__;
    if (supabase) {
      try {
        await supabase.auth.signOut();
      } catch (e) {
        console.warn('Supabase subadmin logout signout error:', e);
      }
    }
    window.showScreen?.('screen-landing');
    window.history?.replaceState?.({ aimeasyPath: '/landing', aimeasyIndex: 0 }, '', '#/landing');
  };

  window.addEventListener('load', () => {
    document.title = 'AIIENS Edu - Smart AI Learning Ecosystem';
    // Ensure async dropdown population runs without breaking render flow

    // Get current hash route to preserve it on load/reload
    const currentRoute = (window.location.hash || '').replace(/^#/, '');
    const isLanding = !currentRoute || currentRoute === '/' || currentRoute === '/landing' || currentRoute === '/intro';

    if (currentRoute && /^\/(admin|subadmin|creator)(\/|$)/.test(currentRoute)) {
      window.__aimeasyPreserveRoleRoute = currentRoute;
    }
    updateRegulationDropdowns();
    updateUniversityDropdowns();
    addMenuIcons();
  });

  window.aimeasyEditNote = (id, subjectName, unitId) => window.v10OpenUnifiedEditModal?.({ contentType: 'note', itemId: id, subjectId: subjectName, unitId });
  window.aimeasyEditPYQ = (id, subjectName, unitId) => window.v10OpenUnifiedEditModal?.({ contentType: 'pyq', itemId: id, subjectId: subjectName, unitId });
  window.aimeasyEditIQ = (id, subjectName, unitId) => window.v10OpenUnifiedEditModal?.({ contentType: 'iq', itemId: id, subjectId: subjectName, unitId });

  // =========================================================================
  //  CENTRALIZED CRUD ENGINE HELPERS (CRITICAL REQUIREMENT 3)
  // =========================================================================
  window.createContent = async function(contentType, payload) {
    const meta = window.aiiensSubjectCreateMeta?.() || {};
    const row = {
      contentType,
      subjectId: payload.subjectId,
      unitId: payload.unitId,
      title: payload.title || '',
      body: payload.body || '',
      url: payload.url || '',
      metadata: payload.metadata || {},
      topicId: payload.metadata?.topicId || payload.topicId || null,
      createdBy: meta.created_by || payload.createdBy || 'subadmin',
    };
    if (typeof window.aimeasyPersistContent === 'function') {
      const data = await window.aimeasyPersistContent(row);
      if (!data) throw new Error('Content save failed');
      return data;
    }
    const supabase = window.__AIMEASY_SUPABASE__;
    if (!supabase) throw new Error('Supabase not configured');
    const insertRow = {
      subject_id: row.subjectId,
      unit_id: row.unitId,
      content_type: contentType,
      title: row.title,
      body: row.body,
      url: row.url,
      metadata: { ...row.metadata, topicId: row.topicId },
      created_by: row.createdBy,
    };
    const { data, error } = await supabase.from('content_items').insert(insertRow).select().single();
    if (error) throw error;
    return data;
  };

  window.updateContent = async function(id, patch) {
    if (typeof window.aimeasyUpdateContent === 'function') {
      const { data, error } = await window.aimeasyUpdateContent(id, patch);
      if (error) throw error;
      return data;
    }
    const supabase = window.__AIMEASY_SUPABASE__;
    if (!supabase) throw new Error('Supabase not configured');
    const { data, error } = await supabase.from('content_items').update(patch).eq('id', id).select().single();
    if (error) throw error;
    return data;
  };

  window.deleteContent = async function(id) {
    if (typeof window.aimeasyDeleteContent === 'function') {
      const { error } = await window.aimeasyDeleteContent(id);
      if (error) throw error;
      return true;
    }
    const supabase = window.__AIMEASY_SUPABASE__;
    if (!supabase) throw new Error('Supabase not configured');
    const { error } = await supabase.from('content_items').delete().eq('id', id);
    if (error) throw error;
    return true;
  };

  // =========================================================================
  //  IN-MEMORY SUPABASE CONTENT STORE (replaces localStorage for roadmap UI)
  // =========================================================================
  window.__v10SaContentStore = window.__v10SaContentStore || {};

  function v10ContentStoreKey(subjectName, unitId) {
    return `${String(subjectName)}::${String(unitId)}`;
  }

  function v10EnsureContentStore(subjectName, unitId) {
    const key = v10ContentStoreKey(subjectName, unitId);
    if (!window.__v10SaContentStore[key]) {
      window.__v10SaContentStore[key] = { notes: [], pyqs: [], iqs: [], videos: [] };
    }
    return window.__v10SaContentStore[key];
  }

  window.v10GetUnitContent = function (subjectName, unitId, type) {
    const store = window.__v10SaContentStore[v10ContentStoreKey(subjectName, unitId)] || {};
    const map = { notes: 'notes', note: 'notes', pyq: 'pyqs', pyqs: 'pyqs', iq: 'iqs', iqs: 'iqs', video: 'videos', videos: 'videos' };
    return store[map[type] || type] || [];
  };

  function v10MapDbNoteRow(row, subjectName, unitId, branch) {
    return {
      id: row.id,
      dbContentId: row.id,
      title: row.title || row.metadata?.topicTitle || 'Note',
      description: row.body || '',
      type: 'link',
      link: row.url || '',
      url: row.url || '',
      subject: subjectName,
      branch: row.branch || row.metadata?.branch || branch,
      unit: unitId,
      topicId: row.metadata?.topicLegacyId || row.metadata?.topicId || '',
      topicName: row.metadata?.topicTitle || row.metadata?.topicText || row.title || '',
      uploadedAt: row.created_at ? new Date(row.created_at).toLocaleDateString() : '',
      created_by: row.created_by || '',
    };
  }

  function v10MapDbPyqRow(row, subjectName, unitId, branch) {
    return {
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
      uploadedAt: row.created_at ? new Date(row.created_at).toLocaleString() : '',
      created_by: row.created_by || '',
    };
  }

  function v10MapDbIqRow(row, subjectName, unitId, branch) {
    return {
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
      created_by: row.created_by || '',
    };
  }

  window.v10SubjectForDb = function v10SubjectForDbSa(subjectName) {
    if (window._v10SASubj && (!subjectName || window._v10SASubj.name === subjectName)) {
      return {
        ...window._v10SASubj,
        dbSubjectId: window._v10SASubj.dbSubjectId || window._v10SASubj.id,
      };
    }
    return window._v10SASubj || { name: subjectName, id: window._v10SASubjId };
  };

  window.v10UnitForDb = function v10UnitForDbSa(unitId) {
    const subj = window.v10SubjectForDb('');
    return {
      id: unitId,
      dbUnitId: subj?.dbUnitIds?.[unitId] || unitId,
      name: typeof unitLabel === 'function' ? unitLabel(unitId) : `Unit ${unitId}`,
      sort_order: typeof unitNumber === 'function' ? unitNumber(unitId) : 1,
    };
  };

  window.v10GetDbContextForUnit = async function v10GetDbContextForUnitSa(subjectName, unitId) {
    const subj = window.v10SubjectForDb(subjectName);
    if (!window.aimeasyFetchUnitRoadmap || !subj) return null;
    const { data, error } = await window.aimeasyFetchUnitRoadmap({
      subject: { ...subj, dbSubjectId: subj.dbSubjectId || subj.id },
      unit: { id: unitId, dbUnitId: subj.dbUnitIds?.[unitId] || unitId, name: `Unit ${unitId}` },
    });
    if (error) {
      console.warn('[CONTENT] DB context failed:', error);
      return null;
    }
    return data;
  };

  window.v10ReloadUnitContentFromDb = async function v10ReloadUnitContentFromDbSa(subjectName, unitId) {
    if (!window.aimeasyListContent) return;
    const ctx = await window.v10GetDbContextForUnit(subjectName, unitId);
    if (!ctx?.subjectId || !ctx?.unitId) return;
    const [notesResult, pyqsResult, iqsResult, videosResult] = await Promise.all([
      window.aimeasyListContent({ subjectId: ctx.subjectId, unitId: ctx.unitId, contentType: 'note' }),
      window.aimeasyListContent({ subjectId: ctx.subjectId, unitId: ctx.unitId, contentType: 'pyq' }),
      window.aimeasyListContent({ subjectId: ctx.subjectId, unitId: ctx.unitId, contentType: 'iq' }),
      window.aimeasyListContent({ subjectId: ctx.subjectId, unitId: ctx.unitId, contentType: 'video' }),
    ]);
    if (notesResult?.error || pyqsResult?.error || iqsResult?.error || videosResult?.error) {
      console.warn('[CONTENT] DB reload failed:', notesResult?.error || pyqsResult?.error || iqsResult?.error || videosResult?.error);
      return;
    }
    window.v10MergeUnitContentRows(subjectName, unitId, notesResult.data || [], pyqsResult.data || [], iqsResult.data || [], videosResult.data || []);
  };

  window.v10StoreUnitTopics = function v10StoreUnitTopicsMemory(subjId, unitId, topics) {
    window.__v10UnitTopicsCache = window.__v10UnitTopicsCache || {};
    window.__v10UnitTopicsCache[`${subjId}:${unitId}`] = topics || [];
    return [{ id: unitId, topics: topics || [] }];
  };

  window.v10PersistSubjectDbIds = function v10PersistSubjectDbIdsMemory(subjId, unitId, data) {
    if (!data?.subjectId || !data?.unitId) return;
    if (window._v10SASubj && String(window._v10SASubj.id) === String(subjId)) {
      window._v10SASubj = {
        ...window._v10SASubj,
        dbSubjectId: data.subjectId,
        dbUnitIds: { ...(window._v10SASubj.dbUnitIds || {}), [unitId]: data.unitId },
      };
    }
  };

  // =========================================================================
  //  UUID-SAFE HELPER OVERRIDES (CRITICAL REQUIREMENT 2)
  // =========================================================================
  window.__v10UnitTopicsCache = window.__v10UnitTopicsCache || {};

  window.v10LoadUnitTopicsFromDb = async function (subjId, unitId) {
    const subj = window._v10SASubj
      || window._v11AdminSubj
      || window._v11CrSubj
      || findSubjectById?.(subjId)
      || {};
    const unit = window.v10UnitForDb?.(unitId) || {
      id: unitId,
      dbUnitId: subj?.dbUnitIds?.[unitId] || unitId,
      name: unitLabel?.(unitId) || `Unit ${unitId}`,
      sort_order: unitNumber?.(unitId) || 1,
    };
    const cacheKey = `${subjId}:${unitId}`;
    if (!window.aimeasyFetchUnitRoadmap) return window.__v10UnitTopicsCache[cacheKey] || [];
    const { data, error } = await window.aimeasyFetchUnitRoadmap({
      subject: { ...subj, dbSubjectId: subjId },
      unit,
    });
    if (error) {
      console.warn('[TOPICS] Supabase fetch failed:', error);
      return window.__v10UnitTopicsCache[cacheKey] || [];
    }
    const topics = data?.topics || [];
    window.__v10UnitTopicsCache[cacheKey] = topics;
    return topics;
  };

  window.v10UnitTopicsForNotesDropdown = function (unitId) {
    const subj = window._v10SASubj || {};
    const cacheKey = `${subj.id}:${unitId}`;
    return window.__v10UnitTopicsCache?.[cacheKey] || window.v10UnitTopics(unitId) || [];
  };

  window.v10UnitTopics = function (unitId) {
    const subj = window._v10SASubj || {};
    const cacheKey = `${subj.id}:${unitId}`;
    return window.__v10UnitTopicsCache?.[cacheKey] || [];
  };

  window.v10TopicSelect = function(subjectName, unitId, selected = '', target = '') {
    const topics = window.v10UnitTopicsForNotesDropdown(unitId);
    const selectId = target ? `v10-topic-select-${target}-${unitId}` : `v10-topic-select-${unitId}`;
    return `<select class="select v10-topic-select" id="${selectId}">
      <option value="">Select Topic (optional)</option>
      ${topics.map((t, i) => {
        const id = t.id || t.dbContentId || String(i + 1);
        const label = t.name || t.topicName || `Topic ${i + 1}`;
        return `<option value="${id}" data-title="${label.replace(/"/g, '&quot;')}"${String(selected) === String(id) ? ' selected' : ''}>${label}</option>`;
      }).join('')}
    </select>`.replace('<select ', `<select ${target ? `onchange="window.v10ApplyTopicSelection(this,'${target}','${unitId}')" ` : ''}`);
  };

  window.v10ApplyTopicSelection = function(select, target, unitId) {
    const selected = select?.options?.[select.selectedIndex];
    const title = selected?.dataset?.title || selected?.textContent || '';
    const input = document.getElementById(`v10-${target}-topic-text-${unitId}`);
    if (input && title && select.value) input.value = title.trim();
  };

  window.v10ReadTopicInput = function(unitId, target) {
    const slugMap = { notes: 'notes', pyq: 'pyqs', iq: 'important-questions' };
    const pane = document.getElementById(`v10-${target}-${unitId}`)
      || document.getElementById(`dyn-subadmin-${slugMap[target] || target}-${unitId}`);
    const select = pane?.querySelector('.v10-topic-select')
      || document.getElementById(`v10-topic-select-${target}-${unitId}`);
    const topicId = select?.value || '';
    const selectedTitle = topicId
      ? (select?.options?.[select.selectedIndex]?.dataset?.title || window.v10TopicNameById?.(unitId, topicId) || '')
      : '';
    const topicText = document.getElementById(`v10-${target}-topic-text-${unitId}`)?.value.trim() || selectedTitle.trim();
    return { topicId, topicName: topicText, selectedTitle };
  };

  window.v10RefreshTopicDropdownsInForms = function(subjectName, unitId) {
    const topics = window.v10UnitTopicsForNotesDropdown(unitId);
    ['notes', 'pyq', 'iq'].forEach((target) => {
      const slugMap = { notes: 'notes', pyq: 'pyqs', iq: 'important-questions' };
      const pane = document.getElementById(`v10-${target}-${unitId}`)
        || document.getElementById(`dyn-subadmin-${slugMap[target]}-${unitId}`);
      const select = pane?.querySelector('.v10-topic-select')
        || document.getElementById(`v10-topic-select-${target}-${unitId}`);
      if (!select) return;
      const current = select.value;
      const options = ['<option value="">Select Topic (optional)</option>'].concat(
        topics.map((t, i) => {
          const id = t.id || t.dbContentId || String(i + 1);
          const label = t.name || t.topicName || `Topic ${i + 1}`;
          const selected = String(current) === String(id) ? ' selected' : '';
          return `<option value="${id}" data-title="${String(label).replace(/"/g, '&quot;')}"${selected}>${label}</option>`;
        })
      );
      select.innerHTML = options.join('');
    });
  };

  window.v10RefreshRoadmapListInPlace = async function (subjId, unitId) {
    const subj = window._v10SASubj
      || window._v11AdminSubj
      || window._v11CrSubj
      || findSubjectById?.(subjId)
      || {};
    const dbUnitObj = window.v10UnitForDb?.(unitId) || {
      id: unitId,
      name: unitLabel?.(unitId) || `Unit ${unitId}`,
      sort_order: unitNumber?.(unitId) || 1,
      dbUnitId: subj?.dbUnitIds?.[unitId] || unitId,
    };
    await window.v10ReloadUnitRoadmapFromDb?.(subjId, unitId, { ...subj, dbSubjectId: subjId }, dbUnitObj);
    const topics = await window.v10LoadUnitTopicsFromDb(subjId, unitId);
    const savedEl = document.getElementById(`v10-saved-roadmap-${unitId}`);
    if (savedEl && typeof window.v10SavedRoadmapTree === 'function') {
      savedEl.innerHTML = window.v10SavedRoadmapTree(topics, subjId, unitId);
    }
    window.v10RefreshTopicDropdownsInForms?.(subj.name, unitId);
    return topics;
  };

  window.v10RefreshContentPane = async function (kind, subjectName, unitId) {
    await window.v10ReloadUnitContentFromDb?.(subjectName, unitId);
    const slugMap = { notes: 'notes', pyq: 'pyqs', iq: 'important-questions' };
    const pane = document.getElementById(`v10-${kind}-${unitId}`)
      || document.getElementById(`dyn-subadmin-${slugMap[kind]}-${unitId}`);
    if (!pane) {
      console.warn('[CONTENT] Refresh skipped: missing pane', { kind, unitId });
      return;
    }
    const renderers = { notes: window.v10NotesForm, pyq: window.v10PYQForm, iq: window.v10IQForm };
    const renderer = renderers[kind];
    if (typeof renderer === 'function') pane.innerHTML = renderer(subjectName, unitId);
  };

  function v10CanModifySubjectContent() {
    return !window._v10SASubj?.isReadOnly;
  }

  function v10CanModifyRecord(record) {
    if (window._v10SASubj?.isReadOnly) return false;
    if (v10CanModifySubjectContent()) return true;
    if (typeof window.aiiensCanModifyRecord === 'function') return window.aiiensCanModifyRecord(record);
    return window.aiiensIsRecordOwner?.(record);
  }

  function v10SaDotMenuHtml(kind, id, subjectName, unitId) {
    const attr = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    const subject = kind === 'roadmap' ? { id: subjectName } : v10ResolveSubject(subjectName);
    const subjectId = subject?.dbSubjectId || subject?.id || subjectName;
    return `<div class="v10-crud-actions" style="display:flex;align-items:center;gap:4px;flex-shrink:0;" onclick="event.stopPropagation()">
      <button type="button" class="v10-dot-btn v10-crud-action" data-action="edit" data-content-type="${attr(kind)}" data-item-id="${attr(id)}" data-subject-id="${attr(subjectId)}" data-unit-id="${attr(unitId)}" title="Edit" aria-label="Edit" style="font-size:.9rem;">&#9998;</button>
      <button type="button" class="v10-dot-btn v10-crud-action danger" data-action="delete" data-content-type="${attr(kind)}" data-item-id="${attr(id)}" data-subject-id="${attr(subjectId)}" data-unit-id="${attr(unitId)}" title="Delete" aria-label="Delete" style="font-size:.9rem;color:var(--red);">&#128465;</button>
    </div>`;
  }

  function v10CloseAllPopups() {
    document.querySelectorAll('.adm-popup,.v10-popup,.v10-actions-menu.open,#v10-actions-portal,.v11-confirm-modal').forEach((p) => {
      if (typeof p.remove === 'function') {
        p.remove();
      } else if (p.parentNode) {
        p.parentNode.removeChild(p);
      }
    });
  }
  window.v10CloseAllPopups = v10CloseAllPopups;
  window.v11CloseAllPopups = window.v11CloseAllPopups || v10CloseAllPopups;
  window.closeAllMenus = window.closeAllMenus || v10CloseAllPopups;

  window.v10OpenSaActionMenu = function(btn, item, ev) {
    const e = ev || window.event;
    e?.stopPropagation?.();
    e?.preventDefault?.();
    window.closeAllMenus?.();
    const popup = document.createElement('div');
    popup.className = 'adm-popup v10-modern-menu';
    popup.dataset.contentType = item?.contentType || '';
    popup.dataset.itemId = item?.itemId || '';
    popup.dataset.subjectId = item?.subjectId || '';
    popup.dataset.unitId = item?.unitId || '';
    popup.innerHTML = `
      <button type="button" class="adm-popup-item" data-action="edit"><span aria-hidden="true">&#9998;</span> Edit</button>
      <button type="button" class="adm-popup-item red" data-action="delete"><span aria-hidden="true">&#128465;</span> Delete</button>
    `;
    btn.closest('.v10-dot-wrap').appendChild(popup);
    btn.setAttribute('aria-expanded', 'true');
  };

  function v10ContentItemRow(title, meta, item, kind, subjectName, unitId, viewLink) {
    const canEdit = v10CanModifyRecord(item);
    const link = viewLink || item.link || item.url || '';
    const viewBtn = link
      ? `<a href="${String(link).replace(/"/g, '&quot;')}" target="_blank" rel="noopener" class="btn btn-ghost btn-sm" style="font-size:0.75rem;text-decoration:none;margin-top:6px;display:inline-block;">View</a>`
      : '';
    const menu = canEdit
      ? `<div style="position:absolute;top:8px;right:8px;z-index:2;">${v10SaDotMenuHtml(kind, item.id || item.dbContentId, subjectName, unitId)}</div>`
      : '';
    return `<div class="v10-item" style="position:relative;padding:12px 14px;border:1.5px solid var(--border);border-radius:var(--radius-md);background:var(--surface);margin-bottom:8px;">
      ${menu}
      <div class="v10-item-body" style="padding-right:${canEdit ? '28px' : '0'};">
        <div class="v10-item-title" style="font-weight:700;color:var(--text1);">${title}</div>
        <div class="v10-item-meta" style="font-size:0.8rem;color:var(--text3);margin-top:4px;">${meta}</div>
        ${viewBtn}
      </div>
    </div>`;
  }

  window.v10NotesForm = function(subjectName, unitId) {
    const notes = window.v10GetUnitContent(subjectName, unitId, 'notes');
    const s = v10EscapeJs(subjectName);
    const isReadOnly = window._v10SASubj?.isReadOnly;

    const formHtml = isReadOnly ? `<div class="v10-form-readonly" style="padding:1rem;background:var(--surface2);border-radius:var(--radius-sm);color:var(--text3);font-size:0.85rem;margin-bottom:1rem;text-align:center;">Read-only view of notes. You do not have permissions to modify this subject.</div>` : `
    <div class="v10-form"><p class="hint">Optionally select a roadmap topic from the dropdown, or type a custom topic below.</p>${v10TopicFieldsHTML(subjectName, unitId, 'notes')}<div class="input-group"><span class="v10-label">NOTE URL / FILE</span><input class="input" id="v10-nlink-${unitId}" placeholder="https://drive.google.com/..." type="url"></div><div class="input-group"><span class="v10-label">DESCRIPTION</span><textarea class="input" id="v10-ndesc-${unitId}" rows="3" style="resize:vertical;"></textarea></div><button class="v10-submit" onclick="window.v10UploadNote('${s}','${unitId}')">Save Note</button></div>`;

    const itemsHtml = notes.length ? `<div class="v10-items"><div class="v10-items-head">Uploaded Notes (${notes.length})</div>${notes.map(n => v10ContentItemRow(
      n.topicName || n.title,
      `${n.description || n.title || ''} · ${n.uploadedAt || ''}`,
      { ...n, created_by: n.created_by || n.uploadedBy },
      'note', subjectName, unitId,
      n.link
    )).join('')}</div>` : '';

    return `${formHtml}${itemsHtml}`;
  };

  window.v10PYQForm = function(subjectName, unitId) {
    const pyqs = window.v10GetUnitContent(subjectName, unitId, 'pyqs');
    const s = (subjectName || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const isReadOnly = window._v10SASubj?.isReadOnly;

    const formHtml = isReadOnly ? `<div class="v10-form-readonly" style="padding:1rem;background:var(--surface2);border-radius:var(--radius-sm);color:var(--text3);font-size:0.85rem;margin-bottom:1rem;text-align:center;">Read-only view of PYQs. You do not have permissions to modify this subject.</div>` : `
    <div class="v10-form"><p class="hint">Optionally link to a roadmap topic, or type a custom topic below.</p><div class="input-group"><span class="v10-label">TOPIC (OPTIONAL)</span>${window.v10TopicSelect(subjectName, unitId, '', 'pyq')}</div><div class="input-group"><span class="v10-label">TOPIC TEXT</span><input class="input v10-topic-text-input" id="v10-pyq-topic-text-${unitId}" placeholder="Type or select a topic" /></div><div class="v10-2col"><div class="input-group"><span class="v10-label">YEAR</span><input class="input" id="v10-pyqyr-${unitId}" type="number" min="2000" max="2099"></div><div class="input-group"><span class="v10-label">MARKS</span><input class="input" id="v10-pyqmarks-${unitId}" type="number" min="1"></div></div><div class="input-group"><span class="v10-label">QUESTION</span><textarea class="input" id="v10-pyqtxt-${unitId}" rows="3" style="resize:vertical;"></textarea></div><button class="v10-submit" onclick="window.v10UploadPYQ('${s}','${unitId}')">Save PYQ</button></div>`;

    const itemsHtml = pyqs.length ? `<div class="v10-items"><div class="v10-items-head">PYQs (${pyqs.length})</div>${pyqs.map(p => v10ContentItemRow(
      p.question,
      `${p.topicName || 'No topic'} · ${p.year || '-'} · ${p.marks || p.count || '-'} marks`,
      { ...p, created_by: p.created_by || p.uploadedBy },
      'pyq', subjectName, unitId
    )).join('')}</div>` : '';

    return `${formHtml}${itemsHtml}`;
  };

  window.v10IQForm = function(subjectName, unitId) {
    const iqs = window.v10GetUnitContent(subjectName, unitId, 'iqs');
    const s = (subjectName || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const isReadOnly = window._v10SASubj?.isReadOnly;

    const formHtml = isReadOnly ? `<div class="v10-form-readonly" style="padding:1rem;background:var(--surface2);border-radius:var(--radius-sm);color:var(--text3);font-size:0.85rem;margin-bottom:1rem;text-align:center;">Read-only view of Important Questions. You do not have permissions to modify this subject.</div>` : `
    <div class="v10-form"><p class="hint">Optionally link to a roadmap topic, or type a custom topic below.</p><div class="input-group"><span class="v10-label">TOPIC (OPTIONAL)</span>${window.v10TopicSelect(subjectName, unitId, '', 'iq')}</div><div class="input-group"><span class="v10-label">TOPIC TEXT</span><input class="input v10-topic-text-input" id="v10-iq-topic-text-${unitId}" placeholder="Type or select a topic" /></div><div class="input-group"><span class="v10-label">QUESTION</span><textarea class="input" id="v10-iqtxt-${unitId}" rows="3" style="resize:vertical;"></textarea></div><div class="input-group"><span class="v10-label">PRIORITY</span><select class="select" id="v10-iqprio-${unitId}"><option value="high">High</option><option value="med" selected>Medium</option><option value="low">Low</option></select></div><button class="v10-submit" onclick="window.v10UploadIQ('${s}','${unitId}')">Save Important Question</button></div>`;

    const itemsHtml = iqs.length ? `<div class="v10-items"><div class="v10-items-head">Important Questions (${iqs.length})</div>${iqs.map(q => v10ContentItemRow(
      q.question,
      `${q.topicName || 'No topic'} · ${q.priority || 'med'}`,
      { ...q, created_by: q.created_by || q.uploadedBy },
      'iq', subjectName, unitId
    )).join('')}</div>` : '';

    return `${formHtml}${itemsHtml}`;
  };

  window.v10MergeUnitContentRows = function(subjectName, unitId, notesRows = [], pyqRows = [], iqRows = [], videoRows = []) {
    const branch = typeof v10BranchForSubject === 'function' ? v10BranchForSubject(subjectName) : '';
    const store = v10EnsureContentStore(subjectName, unitId);
    store.notes = (notesRows || []).map(row => v10MapDbNoteRow(row, subjectName, unitId, branch));
    store.pyqs = (pyqRows || []).map(row => v10MapDbPyqRow(row, subjectName, unitId, branch));
    store.iqs = (iqRows || []).map(row => v10MapDbIqRow(row, subjectName, unitId, branch));
    store.videos = (videoRows || []).map(row => ({
      id: row.id,
      dbContentId: row.id,
      title: row.title || 'Video',
      url: row.url || '',
      subject: subjectName,
      unit: unitId,
      topicId: row.metadata?.topicId || '',
      topicName: row.metadata?.topicTitle || row.metadata?.topicText || '',
      uploadedAt: row.created_at ? new Date(row.created_at).toLocaleString() : '',
      created_by: row.created_by || '',
    }));
  };

  window.v10ReloadUnitRoadmapFromDb = async function(subjId, unitId, subject, unit) {
    if (!window.aimeasyFetchUnitRoadmap || !subject) return null;
    const { data, error } = await window.aimeasyFetchUnitRoadmap({ subject, unit });
    if (error) {
      console.warn('Roadmap DB reload failed:', error);
      return null;
    }
    window.v10PersistSubjectDbIds(subjId, unitId, data);
    window.__v10UnitTopicsCache = window.__v10UnitTopicsCache || {};
    window.__v10UnitTopicsCache[`${subjId}:${unitId}`] = data.topics || [];
    return { id: unitId, topics: data.topics || [] };
  };

  window.v10MoveRoadmapTopicDb = async function (subjId, unitId, topicId, direction) {
    if (window._v10SASubj?.isReadOnly) { showToast('Permission denied: Subject is read-only', 'red'); return; }
    const supabase = window.__AIMEASY_SUPABASE__;
    if (!supabase) return;

    try {
      const { data: topics, error } = await supabase
        .from('topics')
        .select('id, display_order')
        .eq('subject_id', subjId)
        .eq('unit_id', unitId)
        .order('display_order', { ascending: true });

      if (error || !topics) {
        showToast('Failed to fetch topics for reorder', 'red');
        return;
      }

      const idx = topics.findIndex(t => String(t.id) === String(topicId));
      if (idx === -1) return;

      let swapIdx = -1;
      if (direction === 'up' && idx > 0) {
        swapIdx = idx - 1;
      } else if (direction === 'down' && idx < topics.length - 1) {
        swapIdx = idx + 1;
      }

      if (swapIdx === -1) return;

      const t1 = topics[idx];
      const t2 = topics[swapIdx];

      const tempOrder1 = t2.display_order;
      const tempOrder2 = t1.display_order;

      const { error: err1 } = await supabase.from('topics').update({ display_order: tempOrder1 }).eq('id', t1.id);
      const { error: err2 } = await supabase.from('topics').update({ display_order: tempOrder2 }).eq('id', t2.id);

      if (err1 || err2) {
        showToast('Failed to swap topic order', 'red');
        return;
      }

      showToast('Topic order updated.', 'green');
      await window.v10RefreshRoadmapListInPlace(subjId, unitId);
    } catch (err) {
      showToast('Reorder failed: ' + err.message, 'red');
    }
  };

  // =========================================================================
  //  SAVED ROADMAP TOPIC CARDS
  // =========================================================================
  window.v10SavedRoadmapTree = function (topics, subjId, unitId) {
    const esc = window.v10Esc || ((s) => String(s || ''));
    const list = Array.isArray(topics) ? [...topics] : [];
    const isReadOnly = window._v10SASubj?.isReadOnly;
    if (!list.length) {
      return '<div class="v10-saved-roadmap-empty" style="text-align:center;padding:2rem;color:var(--text3);">Saved topics will appear here after saving.</div>';
    }
    list.sort((a, b) => Number(a.displayOrder || a.display_order || 0) - Number(b.displayOrder || b.display_order || 0));
    return `
      <div class="v10-saved-roadmap">
        <div class="v10-items-head" style="margin-bottom:12px;font-weight:700;">Saved Topics (${list.length})</div>
        <div style="display:flex;flex-direction:column;gap:12px;">
          ${list.map((topic, index) => {
            const videos = Array.isArray(topic.videos) && topic.videos.length
              ? topic.videos
              : (topic.youtubeUrls || topic.urls || []).map((url) => ({ url, description: '' }));
            const video = videos[0] || {};
            const name = topic.name || topic.topicName || `Topic ${index + 1}`;
            const url = video.url || topic.youtubeUrl || topic.url || '';
            const description = video.description || topic.description || '';
            const topicKey = topic.id || topic.dbContentId || '';
            const menuHtml = isReadOnly ? '' : `
              <div class="v10-crud-actions" style="position:absolute;top:10px;right:10px;display:flex;gap:4px;" onclick="event.stopPropagation()">
                <button type="button" class="v10-dot-btn v10-crud-action" data-action="edit" data-content-type="roadmap" data-item-id="${esc(topicKey)}" data-subject-id="${esc(subjId)}" data-unit-id="${esc(unitId)}" title="Edit" aria-label="Edit" style="font-size:.9rem;">&#9998;</button>
                <button type="button" class="v10-dot-btn v10-crud-action danger" data-action="delete" data-content-type="roadmap" data-item-id="${esc(topicKey)}" data-subject-id="${esc(subjId)}" data-unit-id="${esc(unitId)}" title="Delete" aria-label="Delete" style="font-size:.9rem;color:var(--red);">&#128465;</button>
              </div>`;
            const viewBtn = url
              ? `<a href="${esc(url)}" target="_blank" rel="noopener" class="btn btn-teal btn-sm" style="font-size:0.75rem;text-decoration:none;width:fit-content;">View</a>`
              : '';
            return `
              <div class="v10-saved-topic" data-topic-id="${esc(topicKey)}" style="position:relative;padding:14px;border:1.5px solid var(--border);border-radius:var(--radius-md);background:var(--surface);box-shadow:var(--shadow-sm);display:flex;flex-direction:column;gap:8px;">
                ${menuHtml}
                <div class="v10-saved-topic-number">Topic ${index + 1}</div>
                <div class="v10-saved-topic-title" style="font-weight:800;color:var(--primary);padding-right:${isReadOnly ? '0' : '28px'};">${esc(name)}</div>
                ${description ? `<p style="margin:0;color:var(--text2);font-size:0.82rem;line-height:1.45;">${esc(description)}</p>` : ''}
                ${viewBtn}
              </div>`;
          }).join('')}
        </div>
      </div>`;
  };

  window.v10OpenTopicMenuDb = function (btn, subjId, unitId, topicId, idx, total, ev) {
    window.v10OpenSaActionMenu(btn, { contentType: 'roadmap', itemId: topicId, subjectId: subjId, unitId }, ev);
  };

  // =========================================================================
  //  TOPIC ROWS & SAVE VALIDATION (CRITICAL REQUIREMENT 7)
  // =========================================================================
  window.v10TopicRowHTML = function (subjId, unitId, idx, name, urls, total, topicId = '') {
    const isReadOnly = window._v10SASubj?.isReadOnly;
    const isFilled = name.trim() !== '';
    const videos = (Array.isArray(urls) && urls.length ? urls : ['']).map((item) => (
      typeof item === 'object'
        ? { url: item.url || item.youtubeUrl || item.url || '', description: item.description || item.title || '' }
        : { url: item || '', description: '' }
    ));
    const video = videos[0] || { url: '', description: '' };
    
    return `
    <div class="v10-topic-row" id="v10-tr-${unitId}-${idx}" data-topic-id="${topicId}" style="display:flex; flex-direction:column; gap:12px; padding:16px; border:1px solid var(--border); border-radius:var(--radius-md); background:var(--surface); margin-bottom:12px; position:relative;">
      <div style="display:flex; align-items:center; gap:8px;">
        <div class="v10-dot ${isFilled ? 'filled' : ''}" id="v10-dot-${unitId}-${idx}" style="width:24px; height:24px; border-radius:50%; background:var(--primary); color:white; display:flex; align-items:center; justify-content:center; font-size:.8rem; font-weight:700;">${idx + 1}</div>
        <h5 style="margin:0; font-size:.85rem; font-weight:600; color:var(--text1);">Topic Node #${idx + 1}</h5>
        ${isReadOnly ? '' : `<button type="button" class="v10-rm-btn" onclick="window.v10RemoveTopic('${unitId}',${idx})" title="Remove" style="margin-left:auto; background:none; border:none; cursor:pointer; color:var(--red); font-size:1.1rem; font-weight:700;">✕</button>`}
      </div>
      <div class="v10-topic-fields" style="display:flex; flex-direction:column; gap:8px;">
        <div class="input-group">
          <span class="v10-label" style="font-size:0.72rem; color:var(--text3); font-weight:600; text-transform:uppercase;">Topic Name *</span>
          <input class="input ${isFilled ? 'filled' : ''}" placeholder="Topic name (e.g. Introduction to AI)" value="${name.replace(/"/g, '&quot;')}" oninput="window.v10DotUpdate('${unitId}',${idx},this.value)" ${isReadOnly ? 'readonly' : 'required'} style="width:100%;" />
        </div>
        <div class="v10-url-list">
          <div class="v10-url-row" style="display:flex; flex-direction:column; gap:8px;">
            <div class="input-group">
              <span class="v10-label" style="font-size:0.72rem; color:var(--text3); font-weight:600; text-transform:uppercase;">Video URL *</span>
              <input class="v10-url-input input" placeholder="Video URL" value="${(video.url || '').replace(/"/g, '&quot;')}" ${isReadOnly ? 'readonly' : 'required'} style="width:100%;" />
            </div>
            <div class="input-group">
              <span class="v10-label" style="font-size:0.72rem; color:var(--text3); font-weight:600; text-transform:uppercase;">Description (Optional)</span>
              <textarea class="v10-video-desc-input input" placeholder="Description..." rows="2" ${isReadOnly ? 'readonly' : ''} style="width:100%; resize:vertical;">${(video.description || '').replace(/"/g, '&quot;')}</textarea>
            </div>
          </div>
        </div>
      </div>
    </div>`;
  };

  window.v10RoadmapPanel = function (subjId, unitId, topics) {
    const list = Array.isArray(topics) ? topics : [];
    window.__v10UnitTopicsCache = window.__v10UnitTopicsCache || {};
    window.__v10UnitTopicsCache[`${subjId}:${unitId}`] = list;
    const isReadOnly = window._v10SASubj?.isReadOnly;
    const rows = `<div id="v10-rm-empty-${unitId}" style="text-align:center;padding:1.8rem;color:var(--text3);">
          <div style="font-weight:600;font-size:.88rem;">No topics queued</div>
          ${isReadOnly ? '' : `<div style="font-size:.76rem;margin-top:4px;">Click "+ Add Topic" to build the roadmap</div>`}
         </div>`;

    const actionsHtml = isReadOnly ? '' : `
        <div class="v10-panel-actions">
          <button class="btn btn-primary btn-sm" onclick="window.v10AddTopic('${subjId}','${unitId}')">+ Add Topic</button>
        </div>`;

    const submitHtml = isReadOnly ? '' : `
        <button class="v10-submit" data-v10-roadmap-save onclick="window.v10SaveRoadmap('${subjId}','${unitId}',this)"><span class="v10-save-label">Save Learning Roadmap</span></button>`;

    return `
    <div class="v10-panel">
      <div class="v10-panel-head">
        <h4>Learning Roadmap</h4>
        ${actionsHtml}
      </div>
      <div class="v10-panel-body">
        <div id="v10-topics-${unitId}">${rows}</div>
        ${submitHtml}
        <div id="v10-saved-roadmap-${unitId}" style="margin-top:1rem;">${window.v10SavedRoadmapTree(list, subjId, unitId)}</div>
      </div>
    </div>`;
  };

  const v10RoadmapSaveLocks = new Set();
  window.v10SaveRoadmap = async function (subjId, unitId, saveButton) {
    if (window._v10SASubj?.isReadOnly) { showToast('Permission denied: Subject is read-only', 'red'); return; }
    const lockKey = `${subjId}:${unitId}`;
    if (v10RoadmapSaveLocks.has(lockKey)) return;
    console.log('[ROADMAP] Save Started');
    const container = document.getElementById('v10-topics-' + unitId);
    if (!container) return;
    const topics = [];
    container.querySelectorAll('.v10-topic-row').forEach((row, index) => {
      const name = row.querySelector('.v10-topic-fields input.input:not(.v10-url-input)')?.value.trim();
      const videoUrl = row.querySelector('.v10-url-input')?.value.trim();
      const description = row.querySelector('.v10-video-desc-input')?.value.trim() || '';
      if (!name) return;
      const topicId = row.dataset.topicId || `${Date.now()}-${index}`;
      const videos = [];
      if (videoUrl) {
        videos.push({ url: videoUrl, description: description });
      }
      topics.push({
        id: topicId,
        topicName: name,
        name,
        videos,
        youtubeUrl: videoUrl || '',
        youtubeUrls: videoUrl ? [videoUrl] : [],
        url: videoUrl || '',
        urls: videoUrl ? [videoUrl] : [],
      });
    });

    if (!topics.length) { showToast('Add at least one topic before saving.', 'red'); return; }
    // Validations: Topic Name required, Video URL required (Critical Requirement 7)
    for (const t of topics) {
      if (!t.name) { showToast('Topic Name is required', 'red'); return; }
      if (!t.youtubeUrl) { showToast('Video URL is required for topic: ' + t.name, 'red'); return; }
      try {
        new URL(t.youtubeUrl);
      } catch (e) {
        showToast('Invalid Video URL for topic: ' + t.name, 'red');
        return;
      }
    }

    const subject = window._v10SASubj || window.v10SubjectForDb(subjId);
    const unit = window.v10UnitForDb(unitId);
    if (!window.aimeasySaveUnitRoadmap || !subject) {
      showToast('Roadmap DB save is unavailable. Supabase is the required source of truth.', 'red');
      return;
    }
    const normalize = (value) => String(value || '').trim().toLocaleLowerCase();
    const signature = (topic) => {
      const video = Array.isArray(topic.videos) ? topic.videos[0] : null;
      return `${normalize(topic.name || topic.topicName)}\u0000${normalize(video?.url || topic.youtubeUrl || topic.url)}`;
    };
    const savedTopics = window.__v10UnitTopicsCache?.[`${subjId}:${unitId}`] || [];
    const existingKeys = new Set(savedTopics.map(signature));
    const queuedKeys = new Set();
    const hasDuplicate = topics.some((topic) => {
      const key = signature(topic);
      if (existingKeys.has(key) || queuedKeys.has(key)) return true;
      queuedKeys.add(key);
      return false;
    });
    if (hasDuplicate) {
      showToast('This topic already exists.', 'red');
      return;
    }

    v10RoadmapSaveLocks.add(lockKey);
    if (saveButton) {
      saveButton.disabled = true;
      saveButton.setAttribute('aria-busy', 'true');
      saveButton.innerHTML = '<span class="v10-button-spinner" aria-hidden="true"></span><span>Saving...</span>';
    }
    try {
      const { data, error } = await window.aimeasySaveUnitRoadmap({ subject, unit, topics: [...savedTopics, ...topics] });
      if (error) throw error;
      v10PersistSubjectDbIds(subjId, unitId, data);
      container.innerHTML = `<div id="v10-rm-empty-${unitId}" style="text-align:center;padding:1.8rem;color:var(--text3);"><div style="font-weight:600;font-size:.88rem;">No topics queued</div><div style="font-size:.76rem;margin-top:4px;">Click "+ Add Topic" to build the roadmap</div></div>`;
      await window.v10RefreshRoadmapListInPlace(subjId, unitId);
      showToast('Learning Roadmap saved successfully.', 'green');
    } catch (error) {
      console.error('[ROADMAP] Save Failed', error);
      showToast('Roadmap DB sync failed: ' + error.message, 'red');
    } finally {
      v10RoadmapSaveLocks.delete(lockKey);
      if (saveButton?.isConnected) {
        saveButton.disabled = false;
        saveButton.removeAttribute('aria-busy');
        saveButton.innerHTML = '<span class="v10-save-label">Save Learning Roadmap</span>';
      }
    }
  };

  window.v10AddTopic = function(subjId, unitId) {
    const container = document.getElementById('v10-topics-' + unitId);
    if (!container) return;
    const empty = document.getElementById('v10-rm-empty-' + unitId);
    if (empty) empty.remove();
    const rows = container.querySelectorAll('.v10-topic-row');
    const idx = rows.length;
    const div = document.createElement('div');
    div.innerHTML = window.v10TopicRowHTML(subjId, unitId, idx, '', [''], idx + 1, '');
    container.appendChild(div.firstElementChild);
    container.lastElementChild.querySelector('input')?.focus();
  };

  // =========================================================================
  //  CONTENT CREATION & DELETION HANDLERS (CRITICAL REQUIREMENT 9)
  // =========================================================================
  const v10ContentSaveLocks = new Set();

  async function v10RunLockedSave(lockKey, button, label, task) {
    if (v10ContentSaveLocks.has(lockKey)) return;
    v10ContentSaveLocks.add(lockKey);
    const originalHtml = button?.innerHTML;
    if (button) {
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      button.innerHTML = `<span class="v10-button-spinner" aria-hidden="true"></span><span>${label}</span>`;
    }
    try {
      return await task();
    } finally {
      v10ContentSaveLocks.delete(lockKey);
      if (button?.isConnected) {
        button.disabled = false;
        button.removeAttribute('aria-busy');
        button.innerHTML = originalHtml;
      }
    }
  }

  window.v10UploadNote = async function (subjectName, unitId) {
    if (window._v10SASubj?.isReadOnly) { showToast('Permission denied: Subject is read-only', 'red'); return; }
    const button = document.activeElement?.matches?.('.v10-submit') ? document.activeElement : null;
    const lockKey = `note:${subjectName}:${unitId}`;
    return v10RunLockedSave(lockKey, button, 'Saving...', async () => {
    const link = document.getElementById('v10-nlink-' + unitId)?.value.trim();
    const description = document.getElementById('v10-ndesc-' + unitId)?.value.trim() || '';
    const { topicId, topicName } = v10ReadTopicInput(unitId, 'notes');
    if (!topicName) { showToast('Enter topic text or select a topic', 'red'); return; }
    
    try {
      const subj = window.v10SubjectForDb(subjectName);
      const unit = window.v10UnitForDb(unitId);
      
      await window.createContent('note', {
        subjectId: subj.dbSubjectId || subj.id,
        unitId: unit.dbUnitId || unit.id,
        title: topicName,
        body: description,
        url: link,
        metadata: { topicId, topicText: topicName }
      });

      document.getElementById('v10-nlink-' + unitId).value = '';
      document.getElementById('v10-ndesc-' + unitId).value = '';
      const topicText = document.getElementById('v10-notes-topic-text-' + unitId);
      if (topicText) topicText.value = '';
      
      await window.v10RefreshContentPane('notes', subjectName, unitId);
      showToast('Note saved under topic.', 'green');
    } catch (err) {
      showToast('DB save failed: ' + err.message, 'red');
    }
    });
  };

  window.v10UploadPYQ = async function (subjectName, unitId) {
    if (window._v10SASubj?.isReadOnly) { showToast('Permission denied: Subject is read-only', 'red'); return; }
    const button = document.activeElement?.matches?.('.v10-submit') ? document.activeElement : null;
    const lockKey = `pyq:${subjectName}:${unitId}`;
    return v10RunLockedSave(lockKey, button, 'Saving...', async () => {
    const question = document.getElementById('v10-pyqtxt-' + unitId)?.value.trim();
    const year = document.getElementById('v10-pyqyr-' + unitId)?.value;
    const marks = document.getElementById('v10-pyqmarks-' + unitId)?.value;
    const { topicId, topicName } = v10ReadTopicInput(unitId, 'pyq');
    if (!topicName) { showToast('Enter topic text or select a topic', 'red'); return; }
    if (!question) { showToast('Enter question', 'red'); return; }

    try {
      const subj = window.v10SubjectForDb(subjectName);
      const unit = window.v10UnitForDb(unitId);
      
      await window.createContent('pyq', {
        subjectId: subj.dbSubjectId || subj.id,
        unitId: unit.dbUnitId || unit.id,
        title: question.slice(0, 80),
        body: question,
        metadata: { year, marks, topicId, topicText: topicName }
      });

      document.getElementById('v10-pyqtxt-' + unitId).value = '';
      document.getElementById('v10-pyqyr-' + unitId).value = '';
      document.getElementById('v10-pyqmarks-' + unitId).value = '';
      
      await window.v10RefreshContentPane('pyq', subjectName, unitId);
      showToast('PYQ saved under topic.', 'green');
    } catch (err) {
      showToast('DB save failed: ' + err.message, 'red');
    }
    });
  };

  window.v10UploadIQ = async function (subjectName, unitId) {
    if (window._v10SASubj?.isReadOnly) { showToast('Permission denied: Subject is read-only', 'red'); return; }
    const button = document.activeElement?.matches?.('.v10-submit') ? document.activeElement : null;
    const lockKey = `iq:${subjectName}:${unitId}`;
    return v10RunLockedSave(lockKey, button, 'Saving...', async () => {
    const question = document.getElementById('v10-iqtxt-' + unitId)?.value.trim();
    const priority = document.getElementById('v10-iqprio-' + unitId)?.value;
    const { topicId, topicName } = v10ReadTopicInput(unitId, 'iq');
    if (!topicName) { showToast('Enter topic text or select a topic', 'red'); return; }
    if (!question) { showToast('Enter question', 'red'); return; }

    try {
      const subj = window.v10SubjectForDb(subjectName);
      const unit = window.v10UnitForDb(unitId);
      
      await window.createContent('iq', {
        subjectId: subj.dbSubjectId || subj.id,
        unitId: unit.dbUnitId || unit.id,
        title: question.slice(0, 80),
        body: question,
        metadata: { priority, topicId, topicText: topicName }
      });

      document.getElementById('v10-iqtxt-' + unitId).value = '';
      
      await window.v10RefreshContentPane('iq', subjectName, unitId);
      showToast('Important question saved under topic.', 'green');
    } catch (err) {
      showToast('DB save failed: ' + err.message, 'red');
    }
    });
  };

  async function v10SaveLinkedContentFromAdmin({ contentType, subjId, unitId, subjName, fields, button }) {
    return v10RunLockedSave(`${contentType}:${subjId}:${unitId}`, button, 'Saving...', async () => {
      const subject = { id: subjId, dbSubjectId: subjId, name: subjName };
      const unit = { id: unitId, dbUnitId: unitId, name: `Unit ${unitId}` };
      const saved = await window.aimeasySaveLinkedContentItem?.({
        subject,
        unit,
        contentType,
        ...fields,
        createdBy: window.APP?.subAdminData?.username || window.APP?.adminType || 'subadmin',
      });
      if (saved?.error) throw saved.error;
      await window.v10ReloadUnitContentFromDb?.(subjName, unitId);
      if (window._v11AdminUnitId && String(window._v11AdminUnitId) === String(unitId)) {
        await window.v11AdminUnitDetail?.(subjId, unitId);
      } else if (window._v11CrSubj && String(window._v11CrSubj.id) === String(subjId)) {
        await window.v11CreatorUnitDetail?.(subjId, unitId);
      } else {
        await window.v10RefreshContentPane?.(contentType === 'note' ? 'notes' : contentType, subjName, unitId);
      }
      showToast(`${v10ContentLabel(contentType)} saved successfully.`, 'green');
      return saved;
    }).catch((error) => {
      showToast('Save failed: ' + error.message, 'red');
      return null;
    });
  }

  window.v11AdminUploadVideo = async function v11AdminUploadVideoUnified(subjId, unitId, subjName) {
    const titleEl = document.getElementById('v11-vtitle');
    const urlEl = document.getElementById('v11-vurl');
    const title = titleEl?.value.trim();
    const url = urlEl?.value.trim();
    if (!title || !url) { showToast('Enter title and URL', 'red'); return; }
    try { new URL(url); } catch (e) { showToast('Please enter a valid URL.', 'red'); return; }
    const saved = await v10SaveLinkedContentFromAdmin({ contentType: 'video', subjId, unitId, subjName, fields: { title, url }, button: document.activeElement });
    if (saved) {
      if (titleEl) titleEl.value = '';
      if (urlEl) urlEl.value = '';
    }
  };

  window.v11AdminUploadNote = async function v11AdminUploadNoteUnified(subjId, unitId, subjName) {
    const titleEl = document.getElementById('v11-ntitle');
    const typeEl = document.getElementById('v11-ntype');
    const linkEl = document.getElementById('v11-nlink');
    const title = titleEl?.value.trim();
    const url = linkEl?.value.trim() || '';
    if (!title) { showToast('Enter title', 'red'); return; }
    const saved = await v10SaveLinkedContentFromAdmin({ contentType: 'note', subjId, unitId, subjName, fields: { title, url, metadata: { type: typeEl?.value || 'link' } }, button: document.activeElement });
    if (saved) {
      if (titleEl) titleEl.value = '';
      if (linkEl) linkEl.value = '';
    }
  };

  window.v11AdminUploadPYQ = async function v11AdminUploadPYQUnified(subjId, unitId, subjName) {
    const yearEl = document.getElementById('v11-pyqyr');
    const countEl = document.getElementById('v11-pyqcnt');
    const questionEl = document.getElementById('v11-pyqtxt');
    const answerEl = document.getElementById('v11-pyqans');
    const question = questionEl?.value.trim();
    const year = yearEl?.value.trim();
    if (!question || !year) { showToast('Enter question and year', 'red'); return; }
    const count = parseInt(countEl?.value || '1', 10) || 1;
    const saved = await v10SaveLinkedContentFromAdmin({
      contentType: 'pyq',
      subjId,
      unitId,
      subjName,
      fields: { title: question.slice(0, 80), body: question, metadata: { year, count, answer: answerEl?.value.trim() || '' } },
      button: document.activeElement,
    });
    if (saved) {
      if (questionEl) questionEl.value = '';
      if (answerEl) answerEl.value = '';
      if (yearEl) yearEl.value = '';
    }
  };

  window.v11AdminUploadIQ = async function v11AdminUploadIQUnified(subjId, unitId, subjName) {
    const questionEl = document.getElementById('v11-iqtxt');
    const priorityEl = document.getElementById('v11-iqprio');
    const tagsEl = document.getElementById('v11-iqtags');
    const question = questionEl?.value.trim();
    if (!question) { showToast('Enter question', 'red'); return; }
    const saved = await v10SaveLinkedContentFromAdmin({
      contentType: 'iq',
      subjId,
      unitId,
      subjName,
      fields: { title: question.slice(0, 80), body: question, metadata: { priority: priorityEl?.value || 'med', tags: tagsEl?.value.trim() || '' } },
      button: document.activeElement,
    });
    if (saved) {
      if (questionEl) questionEl.value = '';
      if (tagsEl) tagsEl.value = '';
    }
  };

  window.v11AdminDeleteVideo = (id, subjId, unitId) => window.v10OpenUnifiedDeleteModal?.({ contentType: 'video', itemId: id, subjectId: subjId, unitId });
  window.v11AdminDeleteNote = (id, subjId, unitId) => window.v10OpenUnifiedDeleteModal?.({ contentType: 'note', itemId: id, subjectId: subjId, unitId });
  window.v11AdminDeletePYQ = (id, subjId, unitId) => window.v10OpenUnifiedDeleteModal?.({ contentType: 'pyq', itemId: id, subjectId: subjId, unitId });
  window.v11AdminDeleteIQ = (id, subjId, unitId) => window.v10OpenUnifiedDeleteModal?.({ contentType: 'iq', itemId: id, subjectId: subjId, unitId });
  window.v11AdminEditNote = (id, subjId, unitId) => window.v10OpenUnifiedEditModal?.({ contentType: 'note', itemId: id, subjectId: subjId, unitId });
  window.v11AdminEditPYQ = (id, subjId, unitId) => window.v10OpenUnifiedEditModal?.({ contentType: 'pyq', itemId: id, subjectId: subjId, unitId });
  window.v11AdminEditIQ = (id, subjId, unitId) => window.v10OpenUnifiedEditModal?.({ contentType: 'iq', itemId: id, subjectId: subjId, unitId });

  function v10ConfirmContentDelete(itemLabel, onDelete) {
    window.v10CloseAllPopups?.();
    const modal = document.createElement('div');
    modal.className = 'v11-confirm-modal';
    modal.innerHTML = `<div class="v11-confirm-box v10-crud-modal" style="max-width:440px;">
      <h3>Delete ${itemLabel}?</h3>
      <p>This action cannot be undone.</p>
      <div class="v10-modal-actions">
        <button type="button" class="btn btn-ghost btn-sm" data-v10-cancel>Cancel</button>
        <button type="button" class="btn btn-danger btn-sm" data-v10-confirm>Delete Permanently</button>
      </div>
    </div>`;
    modal.querySelector('[data-v10-cancel]')?.addEventListener('click', () => modal.remove());
    modal.querySelector('[data-v10-confirm]')?.addEventListener('click', async (event) => {
      const button = event.currentTarget;
      if (button.disabled) return;
      button.disabled = true;
      button.textContent = 'Deleting...';
      try {
        await onDelete();
        modal.remove();
      } catch (error) {
        button.disabled = false;
        button.textContent = 'Delete Permanently';
        showToast('Delete failed: ' + error.message, 'red');
      }
    });
    document.body.appendChild(modal);
  }

  window.v10DeleteNote = async function (id, subjectName, unitId) {
    return window.v10OpenUnifiedDeleteModal?.({ contentType: 'note', itemId: id, subjectId: subjectName, unitId });
  };

  window.v10DeletePYQ = async function (id, subjectName, unitId) {
    return window.v10OpenUnifiedDeleteModal?.({ contentType: 'pyq', itemId: id, subjectId: subjectName, unitId });
  };

  window.v10DeleteIQ = async function (id, subjectName, unitId) {
    return window.v10OpenUnifiedDeleteModal?.({ contentType: 'iq', itemId: id, subjectId: subjectName, unitId });
  };

  // Single SubAdmin saved-content action dispatcher. Renderers provide data only;
  // no executable callback strings are embedded in markup.
  window.v10RunSaCrudAction = function v10RunSaCrudAction(action, item) {
    const contentType = String(item?.contentType || '').trim();
    const itemId = String(item?.itemId || '').trim();
    const subjectId = String(item?.subjectId || '').trim();
    const unitId = String(item?.unitId || '').trim();
    if (!contentType || !itemId || !subjectId || !unitId) {
      showToast('Unable to identify the selected item.', 'red');
      return;
    }
    const normalized = contentType === 'important-questions' ? 'iq' : contentType;
    if (action === 'edit') {
      window.v10OpenUnifiedEditModal?.({ contentType: normalized, itemId, subjectId, unitId });
      return;
    }
    if (action === 'delete') {
      window.v10OpenUnifiedDeleteModal?.({ contentType: normalized, itemId, subjectId, unitId });
      return;
    }
    showToast('This action is not available.', 'red');
  };

  function v10FindSavedContentRecord({ contentType, itemId, subjectId, unitId }) {
    const subjectName = v10ResolveSubjectName(subjectId);
    if (contentType === 'roadmap') {
      const topics = window.__v10UnitTopicsCache?.[`${subjectId}:${unitId}`] || window.v10UnitTopics?.(unitId) || [];
      return topics.find((topic) => [topic?.id, topic?.dbContentId, topic?.topicId, topic?.dbTopicId].some((value) => String(value || '') === String(itemId)));
    }
    const map = { note: 'notes', pyq: 'pyqs', iq: 'iqs', video: 'videos' };
    const rows = window.v10GetUnitContent?.(subjectName, unitId, map[contentType] || contentType) || [];
    return rows.find((row) => String(row.id || row.dbContentId || '') === String(itemId));
  }

  function v10ResolveSubject(subjectId) {
    const candidates = [
      window._v10SASubj,
      window._v11AdminSubj,
      window._v11CrSubj,
      window._crSelectedSubj,
      window.v10SubjectForDb?.(''),
      typeof findSubjectById === 'function' ? findSubjectById(subjectId) : null,
    ].filter(Boolean);
    return candidates.find((subject) => [subject.id, subject.rawId, subject.dbSubjectId, subject.name].some((value) => String(value || '') === String(subjectId))) || candidates[0] || { id: subjectId, name: subjectId };
  }

  function v10ResolveSubjectName(subjectId) {
    return v10ResolveSubject(subjectId)?.name || subjectId;
  }

  function v10ContentLabel(contentType) {
    return ({
      roadmap: 'Topic',
      note: 'Note',
      pyq: 'PYQ',
      iq: 'Important Question',
      video: 'Video',
    })[contentType] || 'Content';
  }

  function v10EditModalFields(contentType, record) {
    const safe = window.v10Esc || ((value) => String(value || ''));
    if (contentType === 'roadmap') {
      const video = Array.isArray(record?.videos) ? record.videos[0] || {} : {};
      return `
        <div class="input-group"><span class="v10-label">TOPIC NAME</span><input class="input" data-field="title" value="${safe(record?.name || record?.topicName || '')}" required></div>
        <div class="input-group"><span class="v10-label">VIDEO URL</span><input class="input" data-field="url" value="${safe(video.url || record?.youtubeUrl || record?.url || '')}" required></div>
        <div class="input-group"><span class="v10-label">DESCRIPTION</span><textarea class="input" data-field="body" rows="3" style="resize:vertical;">${safe(video.description || record?.description || '')}</textarea></div>`;
    }
    if (contentType === 'pyq') {
      return `
        <div class="input-group"><span class="v10-label">QUESTION</span><textarea class="input" data-field="body" rows="4" style="resize:vertical;" required>${safe(record?.question || record?.body || '')}</textarea></div>
        <div class="v10-2col">
          <div class="input-group"><span class="v10-label">YEAR</span><input class="input" data-field="year" type="number" value="${safe(record?.year || '')}"></div>
          <div class="input-group"><span class="v10-label">MARKS</span><input class="input" data-field="marks" type="number" value="${safe(record?.marks || record?.count || '')}"></div>
        </div>
        <div class="input-group"><span class="v10-label">TOPIC</span><input class="input" data-field="topicText" value="${safe(record?.topicName || '')}"></div>`;
    }
    if (contentType === 'iq') {
      const priority = record?.priority || 'med';
      return `
        <div class="input-group"><span class="v10-label">QUESTION</span><textarea class="input" data-field="body" rows="4" style="resize:vertical;" required>${safe(record?.question || record?.body || '')}</textarea></div>
        <div class="input-group"><span class="v10-label">PRIORITY</span><select class="select" data-field="priority">
          <option value="high"${priority === 'high' ? ' selected' : ''}>High</option>
          <option value="med"${priority === 'med' || priority === 'medium' ? ' selected' : ''}>Medium</option>
          <option value="low"${priority === 'low' ? ' selected' : ''}>Low</option>
        </select></div>
        <div class="input-group"><span class="v10-label">TOPIC</span><input class="input" data-field="topicText" value="${safe(record?.topicName || '')}"></div>`;
    }
    return `
      <div class="input-group"><span class="v10-label">TITLE</span><input class="input" data-field="title" value="${safe(record?.title || record?.topicName || '')}" required></div>
      <div class="input-group"><span class="v10-label">URL</span><input class="input" data-field="url" value="${safe(record?.url || record?.link || '')}"></div>
      <div class="input-group"><span class="v10-label">DESCRIPTION</span><textarea class="input" data-field="body" rows="3" style="resize:vertical;">${safe(record?.description || record?.body || '')}</textarea></div>
      <div class="input-group"><span class="v10-label">TOPIC</span><input class="input" data-field="topicText" value="${safe(record?.topicName || record?.title || '')}"></div>`;
  }

  async function v10RefreshAfterCrud({ contentType, subjectId, unitId }) {
    const subject = v10ResolveSubject(subjectId);
    const subjectName = subject?.name || subjectId;
    if (contentType === 'roadmap') {
      await window.v10RefreshRoadmapListInPlace?.(subjectId, unitId);
      return;
    }
    await window.v10RefreshContentPane?.(contentType === 'note' ? 'notes' : contentType, subjectName, unitId);
    if (window._v11AdminUnitId && String(window._v11AdminUnitId) === String(unitId)) {
      await window.v11AdminUnitDetail?.(subject.id || subjectId, unitId);
    }
    if (window._v11CrSubj && String(window._v11CrSubj.id) === String(subjectId)) {
      await window.v11CreatorUnitDetail?.(subject.id || subjectId, unitId);
    }
  }

  window.v10OpenUnifiedEditModal = function v10OpenUnifiedEditModal(item) {
    if (window._v10SASubj?.isReadOnly) { showToast('Permission denied: Subject is read-only', 'red'); return; }
    const record = v10FindSavedContentRecord(item);
    if (!record) {
      showToast('This action is not available.', 'red');
      return;
    }
    if (!v10CanModifyRecord(record)) {
      showToast('Permission denied: You can only edit content you created', 'red');
      return;
    }
    window.v10CloseAllPopups?.();
    const modal = document.createElement('div');
    modal.className = 'v11-confirm-modal';
    modal.innerHTML = `<div class="v11-confirm-box v10-crud-modal" style="max-width:520px;">
      <h3>Edit ${v10ContentLabel(item.contentType)}</h3>
      ${v10EditModalFields(item.contentType, record)}
      <div class="v10-modal-actions">
        <button type="button" class="btn btn-ghost btn-sm" data-v10-cancel>Cancel</button>
        <button type="button" class="btn btn-primary btn-sm" data-v10-save>Save Changes</button>
      </div>
    </div>`;
    modal.querySelector('[data-v10-cancel]')?.addEventListener('click', () => modal.remove());
    modal.querySelector('[data-v10-save]')?.addEventListener('click', async (event) => {
      const button = event.currentTarget;
      if (button.disabled) return;
      const value = (name) => modal.querySelector(`[data-field="${name}"]`)?.value.trim() || '';
      const title = value('title');
      const body = value('body');
      const url = value('url');
      if (item.contentType === 'roadmap' && (!title || !url)) { showToast('Topic name and URL are required.', 'red'); return; }
      if (item.contentType === 'note' && !title) { showToast('Title is required.', 'red'); return; }
      if ((item.contentType === 'pyq' || item.contentType === 'iq') && !body) { showToast('Question is required.', 'red'); return; }
      if (url) {
        try { new URL(url); } catch (e) { showToast('Please enter a valid URL.', 'red'); return; }
      }
      button.disabled = true;
      button.textContent = 'Saving...';
      try {
        if (item.contentType === 'roadmap') {
          await window.v10SaveRoadmapRecord?.(item, { title, url, body });
        } else {
          const metadata = {
            ...(record.metadata || {}),
            topicId: record.topicId || record.metadata?.topicId || '',
            topicText: value('topicText'),
            year: value('year'),
            marks: value('marks'),
            count: value('marks') || value('count'),
            priority: value('priority'),
          };
          const patch = {
            title: item.contentType === 'pyq' || item.contentType === 'iq' ? body.slice(0, 80) : title,
            body,
            url,
            metadata,
            updated_at: new Date().toISOString(),
          };
          await window.updateContent(record.dbContentId || record.id || item.itemId, patch);
        }
        modal.remove();
        await v10RefreshAfterCrud(item);
        showToast(`${v10ContentLabel(item.contentType)} updated successfully.`, 'green');
      } catch (error) {
        button.disabled = false;
        button.textContent = 'Save Changes';
        showToast('Update failed: ' + error.message, 'red');
      }
    });
    document.body.appendChild(modal);
  };

  window.v10OpenUnifiedDeleteModal = function v10OpenUnifiedDeleteModal(item) {
    if (window._v10SASubj?.isReadOnly) { showToast('Permission denied: Subject is read-only', 'red'); return; }
    const record = v10FindSavedContentRecord(item);
    if (record && !v10CanModifyRecord(record)) {
      showToast('Permission denied: You can only delete content you created', 'red');
      return;
    }
    v10ConfirmContentDelete(v10ContentLabel(item.contentType), async () => {
      if (item.contentType === 'roadmap') {
        await window.v10DeleteRoadmapRecord?.(item);
      } else {
        await window.deleteContent(record?.dbContentId || record?.id || item.itemId);
      }
      await v10RefreshAfterCrud(item);
      showToast(`${v10ContentLabel(item.contentType)} deleted successfully.`, 'green');
    });
  };

  window.v10SaveRoadmapRecord = async function v10SaveRoadmapRecord(item, patch) {
    const supabase = window.__AIMEASY_SUPABASE__;
    if (!supabase) throw new Error('Supabase is not available.');
    const ctx = typeof aimeasyResolveRoadmapContext === 'function'
      ? await aimeasyResolveRoadmapContext(item.subjectId, item.unitId)
      : { subjectId: item.subjectId, unitId: item.unitId, topics: window.__v10UnitTopicsCache?.[`${item.subjectId}:${item.unitId}`] || [] };
    const topic = typeof aimeasyFindTopic === 'function'
      ? aimeasyFindTopic(ctx, item.itemId)
      : v10FindSavedContentRecord(item);
    const dbTopicId = typeof aimeasyTopicDbId === 'function'
      ? aimeasyTopicDbId(topic, item.itemId)
      : topic?.id || item.itemId;
    if (!dbTopicId) throw new Error('Topic not found in Supabase.');
    const { error: topicError } = await supabase
      .from('topics')
      .update({ topic_name: patch.title })
      .eq('id', dbTopicId)
      .eq('subject_id', ctx.subjectId || item.subjectId)
      .eq('unit_id', ctx.unitId || item.unitId);
    if (topicError) throw topicError;
    const existing = await supabase
      .from('topic_videos')
      .select('id')
      .eq('topic_id', dbTopicId)
      .order('display_order', { ascending: true })
      .limit(1);
    if (existing.error) throw existing.error;
    if (existing.data?.[0]) {
      const { error } = await supabase
        .from('topic_videos')
        .update({ video_url: patch.url || '', description: patch.body || '' })
        .eq('id', existing.data[0].id);
      if (error) throw error;
    } else if (patch.url) {
      const { error } = await supabase
        .from('topic_videos')
        .insert({ topic_id: dbTopicId, video_url: patch.url, description: patch.body || '', display_order: 1 });
      if (error) throw error;
    }
  };

  window.v10DeleteRoadmapRecord = async function v10DeleteRoadmapRecord(item) {
    const supabase = window.__AIMEASY_SUPABASE__;
    if (!supabase) throw new Error('Supabase is not available.');
    const ctx = typeof aimeasyResolveRoadmapContext === 'function'
      ? await aimeasyResolveRoadmapContext(item.subjectId, item.unitId)
      : { subjectId: item.subjectId, unitId: item.unitId, topics: window.__v10UnitTopicsCache?.[`${item.subjectId}:${item.unitId}`] || [] };
    const topic = typeof aimeasyFindTopic === 'function'
      ? aimeasyFindTopic(ctx, item.itemId)
      : v10FindSavedContentRecord(item);
    const dbTopicId = typeof aimeasyTopicDbId === 'function'
      ? aimeasyTopicDbId(topic, item.itemId)
      : topic?.id || item.itemId;
    if (!dbTopicId) throw new Error('Topic not found in Supabase.');
    const { error: videoError } = await supabase.from('topic_videos').delete().eq('topic_id', dbTopicId);
    if (videoError) throw videoError;
    const { error } = await supabase
      .from('topics')
      .delete()
      .eq('id', dbTopicId)
      .eq('subject_id', ctx.subjectId || item.subjectId)
      .eq('unit_id', ctx.unitId || item.unitId);
    if (error) throw error;
    const { data: remaining, error: orderError } = await supabase
      .from('topics')
      .select('id, display_order')
      .eq('subject_id', ctx.subjectId || item.subjectId)
      .eq('unit_id', ctx.unitId || item.unitId)
      .order('display_order', { ascending: true });
    if (orderError) throw orderError;
    for (const [index, topicRow] of (remaining || []).entries()) {
      const nextOrder = index + 1;
      if (Number(topicRow.display_order) !== nextOrder) {
        const { error: renumberError } = await supabase.from('topics').update({ display_order: nextOrder }).eq('id', topicRow.id);
        if (renumberError) throw renumberError;
      }
    }
  };

  window.v10DynamicCrudButton = function v10DynamicCrudButton(item, feature, subject, unit) {
    const attr = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    const type = attr(item.contentType || item.type || feature || 'dynamic');
    return `<div class="v10-crud-actions" style="display:flex;align-items:center;gap:4px;flex-shrink:0;">
      <button type="button" class="v10-dot-btn v10-crud-action" data-action="edit" data-content-type="${type}" data-item-id="${attr(item.id)}" data-subject-id="${attr(subject)}" data-unit-id="${attr(unit)}" title="Edit" aria-label="Edit" style="font-size:.9rem;">&#9998;</button>
      <button type="button" class="v10-dot-btn v10-crud-action danger" data-action="delete" data-content-type="${type}" data-item-id="${attr(item.id)}" data-subject-id="${attr(subject)}" data-unit-id="${attr(unit)}" title="Delete" aria-label="Delete" style="font-size:.9rem;color:var(--red);">&#128465;</button>
    </div>`;
  };

  window.v10EditDynamicContent = function v10EditDynamicContent(item) {
    const record = window.edusyncGetDynamicFeatureContent?.(item.id, item.feature, item.subject, item.unit);
    if (!record) { showToast('Saved item not found.', 'red'); return; }
    window.v10CloseAllPopups?.();
    const esc = window.v10Esc || ((value) => String(value || ''));
    const modal = document.createElement('div');
    modal.className = 'v11-confirm-modal';
    modal.innerHTML = `<div class="v11-confirm-box v10-crud-modal" style="max-width:520px;">
      <h3>Edit ${esc(item.feature || 'Content')}</h3>
      <div class="input-group"><span class="v10-label">TOPIC NAME</span><input class="input" data-field="title" value="${esc(record.title || '')}"></div>
      <div class="input-group"><span class="v10-label">URL</span><input class="input" data-field="url" value="${esc(record.link || '')}"></div>
      <div class="input-group"><span class="v10-label">DESCRIPTION</span><textarea class="input" data-field="description" rows="3">${esc(record.description || '')}</textarea></div>
      <div class="v10-modal-actions"><button class="btn btn-ghost btn-sm" data-cancel>Cancel</button><button class="btn btn-primary btn-sm" data-save>Save Changes</button></div>
    </div>`;
    modal.querySelector('[data-cancel]').addEventListener('click', () => modal.remove());
    modal.querySelector('[data-save]').addEventListener('click', async (event) => {
      const button = event.currentTarget;
      if (button.disabled) return;
      const title = modal.querySelector('[data-field="title"]')?.value.trim();
      const url = modal.querySelector('[data-field="url"]')?.value.trim() || '';
      const description = modal.querySelector('[data-field="description"]')?.value.trim() || '';
      if (!title) { showToast('Topic name is required.', 'red'); return; }
      button.disabled = true;
      button.textContent = 'Saving...';
      try {
        await window.updateContent(item.id, { title, body: description, url });
        modal.remove();
        await window.v10SAUnitDetail?.(window._v10SASubjId, item.unit);
        showToast('Content updated successfully.', 'green');
      } catch (error) {
        button.disabled = false;
        button.textContent = 'Save Changes';
        showToast('Update failed: ' + error.message, 'red');
      }
    });
    document.body.appendChild(modal);
  };

  window.v10DeleteDynamicContent = function v10DeleteDynamicContent(item) {
    v10ConfirmContentDelete(item.feature || 'Content', async () => {
      await window.deleteContent(item.id);
      await window.v10SAUnitDetail?.(window._v10SASubjId, item.unit);
      showToast('Content deleted successfully.', 'green');
    });
  };

  if (!window.__v10SaCrudDelegationInstalled) {
    window.__v10SaCrudDelegationInstalled = true;
    document.addEventListener('click', (event) => {
      const directAction = event.target.closest?.('.v10-crud-action');
      if (directAction) {
        event.preventDefault();
        event.stopPropagation();
        window.v10RunSaCrudAction?.(directAction.dataset.action, {
          contentType: directAction.dataset.contentType,
          itemId: directAction.dataset.itemId,
          subjectId: directAction.dataset.subjectId,
          unitId: directAction.dataset.unitId,
        });
        return;
      }

      const actionButton = event.target.closest?.('.v10-modern-menu [data-action]');
      if (actionButton) {
        event.preventDefault();
        event.stopPropagation();
        const popup = actionButton.closest('.v10-modern-menu');
        const wrap = popup?.closest('.v10-dot-wrap');
        const trigger = wrap?.querySelector('.v10-sa-crud-trigger');
        const item = {
          contentType: popup?.dataset.contentType || trigger?.dataset.contentType,
          itemId: popup?.dataset.itemId || trigger?.dataset.itemId,
          subjectId: popup?.dataset.subjectId || trigger?.dataset.subjectId,
          unitId: popup?.dataset.unitId || trigger?.dataset.unitId,
        };
        popup?.remove();
        trigger?.setAttribute('aria-expanded', 'false');
        window.v10RunSaCrudAction?.(actionButton.dataset.action, item);
        return;
      }

      const trigger = event.target.closest?.('.v10-sa-crud-trigger');
      if (!trigger) return;
      event.preventDefault();
      event.stopPropagation();
      const existing = trigger.closest('.v10-dot-wrap')?.querySelector('.v10-modern-menu');
      if (existing) {
        existing.remove();
        trigger.setAttribute('aria-expanded', 'false');
        return;
      }
      window.v10OpenSaActionMenu?.(trigger, {
        contentType: trigger.dataset.contentType,
        itemId: trigger.dataset.itemId,
        subjectId: trigger.dataset.subjectId,
        unitId: trigger.dataset.unitId,
      }, event);
    }, true);
  }

  // =========================================================================
  //  ADMIN & CREATOR VIEWS HOOKS FOR UUID COMPATIBILITY
  // =========================================================================
  window.v11AdminSubjectCard = function (s) {
    const safeName = (s.name || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    return `
    <div class="adm-subj-card" id="adm-scard-${s.id}">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:8px;">
        <div style="width:40px;height:40px;border-radius:var(--radius-sm);background:linear-gradient(135deg,var(--primary-light),var(--lavender-light));display:flex;align-items:center;justify-content:center;font-size:1.3rem;flex-shrink:0;">📖</div>
        <div class="v10-dot-wrap" onclick="event.stopPropagation()">
          <button class="v10-dot-btn" onclick="window.v11AdminSubjectDotMenu(this,'${s.id}','${safeName}')" title="Options">⋮</button>
        </div>
      </div>
      <div style="font-weight:700;font-size:.94rem;margin-bottom:3px;">${s.name}</div>
      <div style="font-size:.74rem;color:var(--text3);margin-bottom:10px;">${s.code || '—'} · ${s.credits || 3} Cr · ${s.branch || 'CSE'}</div>
      <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:10px;">
        <span class="badge badge-primary">${s.sem || '—'}</span>
        <span class="badge badge-teal">${s.uni || 'JNTUK'}</span>
        <span class="badge badge-lavender">${s.reg || 'R23'}</span>
      </div>
      <button class="btn btn-ghost btn-sm" onclick="window.v11AdminOpenSubject('${s.id}')" style="width:100%;">📂 Manage Units & Content →</button>
    </div>`;
  };

  window.v11AdminSubjectDotMenu = function (btn, id, safeName) {
    window.v10CloseAllPopups?.();
    const popup = document.createElement('div');
    popup.className = 'adm-popup';
    popup.innerHTML = `
      <button class="adm-popup-item" onclick="window.v11AdminOpenSubject('${id}')">📂 Manage Units</button>
      <button class="adm-popup-item" onclick="window.v11AdminEditSubject('${id}')">✏️ Edit Subject</button>
      <button class="adm-popup-item red" onclick="window.v11AdminDeleteSubject('${id}','${safeName}')">🗑️ Delete Subject</button>`;
    btn.closest('.v10-dot-wrap').appendChild(popup);
    event.stopPropagation();
  };

  window.v11AdminUnitsPage = function (subj) {
    const content = document.getElementById('admin-content');
    if (!content) return;
    const units = v11GetUnits(subj.id, false, subj);

    content.innerHTML = `
    <div style="padding:2rem;max-width:1100px;margin:0 auto;width:100%;">
      <button class="v11-back" onclick="window.v11AdminSubjectsPage()">← Back to Subjects</button>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;flex-wrap:wrap;gap:10px;">
        <div>
          <h2 style="font-size:1.2rem;font-weight:800;letter-spacing:-.02em;margin-bottom:4px;">📖 ${subj.name} — Units</h2>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <span class="badge badge-primary">${subj.sem || '—'}</span>
            <span class="badge badge-teal">${subj.uni || 'JNTUK'}</span>
            <span class="badge badge-lavender">${subj.reg || 'R23'}</span>
            <span class="badge badge-amber">${subj.branch || 'CSE'}</span>
          </div>
        </div>
        <button class="btn btn-primary btn-sm" onclick="window.v11AdminAddUnit('${subj.id}')">+ Add Unit</button>
      </div>
      <div class="adm-unit-grid">
        ${units.map((u, ui) => {
          const vC = 0;
          const nC = 0;
          const pC = 0;
          const iC = 0;
          const tC = (u.topics || []).length;
          return `<div class="adm-unit-card">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:8px;">
              <div style="width:40px;height:40px;border-radius:var(--radius-sm);background:linear-gradient(135deg,var(--lavender),var(--primary));display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:1.1rem;flex-shrink:0;">${u.id}</div>
              <div style="display:flex;gap:4px;" onclick="event.stopPropagation()">
                <button class="v10-dot-btn" title="Edit" onclick="window.v11AdminEditUnit('${subj.id}',${ui})" style="font-size:.8rem;">✏️</button>
                <button class="v10-dot-btn" title="Delete" onclick="window.v11AdminDeleteUnit('${subj.id}',${ui})" style="font-size:.8rem;color:var(--red);">🗑️</button>
              </div>
            </div>
            <div style="font-weight:700;font-size:.9rem;margin-bottom:4px;">${unitLabel(u, ui + 1)}</div>
            <div style="font-size:.74rem;color:var(--text3);margin-bottom:8px;">${tC} topic${tC !== 1 ? 's' : ''}</div>
            <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:8px;">
              ${vC ? `<span class="badge badge-teal">🎬 ${vC}</span>` : ''}
              ${nC ? `<span class="badge badge-primary">📄 ${nC}</span>` : ''}
              ${pC ? `<span class="badge badge-amber">📝 ${pC}</span>` : ''}
              ${iC ? `<span class="badge badge-lavender">⭐ ${iC}</span>` : ''}
            </div>
            <button class="btn btn-ghost btn-sm" onclick="window.v11AdminUnitDetail('${subj.id}','${u.id}')" style="width:100%;">Manage Content →</button>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  };

  window.v11AdminUnitDetail = async function (subjId, unitId) {
    window._v11AdminSubjId = subjId;
    window._v11AdminUnitId = unitId;
    const subj = window._v11AdminSubj;
    if (!subj) return;
    
    let unit = { id: unitId, name: unitLabel(unitId), topics: [], sort_order: unitNumber(unitId) };
    const units = v11GetUnits(subjId, false, subj);
    const found = units.find(u => String(u.id) === String(unitId));
    if (found) unit = found;

    if (typeof window.v10ReloadUnitRoadmapFromDb === 'function') {
      const dbUnitObj = { id: unitId, name: unitLabel(unit, unitId), dbUnitId: unit.id };
      const reloadedUnit = await window.v10ReloadUnitRoadmapFromDb(subjId, unitId, { ...subj, dbSubjectId: subjId }, dbUnitObj);
      if (reloadedUnit) {
        unit.topics = reloadedUnit.topics || [];
      }
    }
    if (typeof window.v10ReloadUnitContentFromDb === 'function') {
      await window.v10ReloadUnitContentFromDb(subj.name, unitId);
    }

    const adminVideos = window.v10GetUnitContent(subj.name, unitId, 'videos');
    const adminNotes = window.v10GetUnitContent(subj.name, unitId, 'notes');
    const adminPYQs = window.v10GetUnitContent(subj.name, unitId, 'pyqs');
    const adminIQs = window.v10GetUnitContent(subj.name, unitId, 'iqs');

    const content = document.getElementById('admin-content');
    if (!content) return;
    
    content.innerHTML = `
    <div style="padding:2rem;max-width:1100px;margin:0 auto;width:100%;">
      <button class="v11-back" onclick="window.v11AdminUnitsPage(window._v11AdminSubj)">← Back to Units</button>
      <h2 style="font-size:1.15rem;font-weight:800;margin-bottom:.4rem;">${esc(subj.name)} - ${unitLabel(unit, unitId)}</h2>
      <p style="font-size:.79rem;color:var(--text3);margin-bottom:1.2rem;">Full content management for this unit</p>

      <div class="v11-tabs">
        <button class="v11-tab on" onclick="v11SwitchTab(this,'v11-topics')">📋 Topics (${(unit.topics || []).length})</button>
        <button class="v11-tab" onclick="v11SwitchTab(this,'v11-videos')">🎬 Videos (${adminVideos.length})</button>
        <button class="v11-tab" onclick="v11SwitchTab(this,'v11-notes')">📄 Notes (${adminNotes.length})</button>
        <button class="v11-tab" onclick="v11SwitchTab(this,'v11-pyqs')">📝 PYQs (${adminPYQs.length})</button>
        <button class="v11-tab" onclick="v11SwitchTab(this,'v11-iqs')">⭐ Imp. Questions (${adminIQs.length})</button>
      </div>

      <div class="v11-pane on" id="v11-topics">
        <div class="card">
          <h4 style="margin-bottom:1rem;">Learning Roadmap / Topics</h4>
          <div id="v11-topics-list">
            ${(unit.topics || []).map((t, ti) => `
            <div class="v11-item-row">
              <span style="width:22px;height:22px;border-radius:50%;background:var(--primary);color:#fff;font-size:.7rem;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${ti + 1}</span>
              <span style="flex:1;">${t.name}</span>
              ${t.url ? `<a href="${t.url}" target="_blank" class="badge badge-teal" style="text-decoration:none;">▶ Video</a>` : ''}
              <button class="btn btn-danger btn-sm" onclick="window.v11AdminDeleteTopic('${subjId}','${unitId}',${ti})">✕</button>
            </div>`).join('') || '<p style="color:var(--text3);font-size:.83rem;">No topics yet. Add some below.</p>'}
          </div>
          <hr style="margin:1rem 0;">
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
            <input class="input" id="v11-topic-name" placeholder="Topic name" style="flex:1;min-width:180px;">
            <input class="input" id="v11-topic-url" placeholder="YouTube URL (optional)" style="flex:1;min-width:220px;">
            <button class="btn btn-primary" onclick="window.v11AdminAddTopic('${subjId}','${unitId}')">+ Add Topic</button>
          </div>
        </div>
      </div>

      <div class="v11-pane" id="v11-videos">
        <div class="card">
          <h4 style="margin-bottom:1rem;">🎬 Upload Video</h4>
          <div class="form-row">
            <div class="input-group"><label>Video Title</label><input class="input" id="v11-vtitle" placeholder="e.g. Unit 1 Introduction"></div>
            <div class="input-group"><label>YouTube URL</label><input class="input" id="v11-vurl" placeholder="https://youtube.com/watch?v=..."></div>
          </div>
          <button class="btn btn-primary" onclick="window.v11AdminUploadVideo('${subjId}','${unitId}','${(subj.name || '').replace(/'/g, "\\'")}')">📤 Upload Video</button>
          <hr style="margin:1rem 0;">
          <div id="v11-videos-list">
            ${adminVideos.map(v => `
            <div class="v11-item-row">
              <span>🎬</span>
              <div style="flex:1;min-width:0;"><div style="font-weight:600;">${v.title}</div><div style="font-size:.72rem;color:var(--primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${v.url}</div></div>
              <span class="badge badge-green">Live</span>
              ${v10SaDotMenuHtml('video', v.id || v.dbContentId, subjId, unitId)}
            </div>`).join('') || '<p style="color:var(--text3);font-size:.83rem;">No videos yet.</p>'}
          </div>
        </div>
      </div>

      <div class="v11-pane" id="v11-notes">
        <div class="card">
          <h4 style="margin-bottom:1rem;">📄 Upload Notes</h4>
          <div class="form-row">
            <div class="input-group"><label>Title</label><input class="input" id="v11-ntitle" placeholder="e.g. Unit 1 Handwritten Notes"></div>
            <div class="input-group"><label>Type</label>
              <select class="select" id="v11-ntype">
                <option value="pdf">PDF</option><option value="doc">DOC</option><option value="link">Link</option>
              </select></div>
          </div>
          <div class="input-group"><label>Google Drive / URL Link</label><input class="input" id="v11-nlink" placeholder="https://drive.google.com/..."></div>
          <button class="btn btn-primary" onclick="window.v11AdminUploadNote('${subjId}','${unitId}','${(subj.name || '').replace(/'/g, "\\'")}')">📤 Upload Notes</button>
          <hr style="margin:1rem 0;">
          <div id="v11-notes-list">
            ${adminNotes.map(n => `
            <div class="v11-item-row">
              <span>📄</span>
              <div style="flex:1;"><div style="font-weight:600;">${n.title}</div><div style="font-size:.72rem;color:var(--text3);">${n.type?.toUpperCase() || 'FILE'} · ${n.uploadedAt || ''}</div></div>
              <span class="badge badge-green">Live</span>
              ${v10SaDotMenuHtml('note', n.id || n.dbContentId, subjId, unitId)}
            </div>`).join('') || '<p style="color:var(--text3);font-size:.83rem;">No notes yet.</p>'}
          </div>
        </div>
      </div>

      <div class="v11-pane" id="v11-pyqs">
        <div class="card">
          <h4 style="margin-bottom:1rem;">📝 Add PYQ</h4>
          <div class="form-row">
            <div class="input-group"><label>Exam Year</label><input class="input" id="v11-pyqyr" placeholder="e.g. 2023" type="number" min="2000" max="2099"></div>
            <div class="input-group"><label>Times Asked</label><input class="input" id="v11-pyqcnt" placeholder="e.g. 3" type="number" min="1" value="1"></div>
          </div>
          <div class="input-group"><label>Question</label><textarea class="input" id="v11-pyqtxt" placeholder="Type the question..." rows="3" style="resize:vertical;"></textarea></div>
          <div class="input-group"><label>Answer (optional)</label><textarea class="input" id="v11-pyqans" placeholder="Answer/explanation..." rows="2" style="resize:vertical;"></textarea></div>
          <button class="btn btn-primary" onclick="window.v11AdminUploadPYQ('${subjId}','${unitId}','${(subj.name || '').replace(/'/g, "\\'")}')">📝 Add PYQ</button>
          <hr style="margin:1rem 0;">
          <div id="v11-pyqs-list">
            ${adminPYQs.map(p => `
            <div class="v11-item-row">
              <span>📝</span>
              <div style="flex:1;min-width:0;"><div style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${p.question.substring(0, 80)}${p.question.length > 80 ? '...' : ''}</div><div style="font-size:.72rem;color:var(--text3);">Year: ${p.year} · ×${p.count || 1}</div></div>
              <span class="badge badge-green">Live</span>
              ${v10SaDotMenuHtml('pyq', p.id || p.dbContentId, subjId, unitId)}
            </div>`).join('') || '<p style="color:var(--text3);font-size:.83rem;">No PYQs yet.</p>'}
          </div>
        </div>
      </div>

      <div class="v11-pane" id="v11-iqs">
        <div class="card">
          <h4 style="margin-bottom:1rem;">⭐ Add Important Question</h4>
          <div class="input-group"><label>Question</label><textarea class="input" id="v11-iqtxt" placeholder="Type the important question..." rows="3" style="resize:vertical;"></textarea></div>
          <div class="form-row">
            <div class="input-group"><label>Priority</label>
              <select class="select" id="v11-iqprio">
                <option value="high">🔴 High</option>
                <option value="med" selected>🟡 Medium</option>
                <option value="low">🟢 Low</option>
              </select></div>
            <div class="input-group"><label>Tags</label><input class="input" id="v11-iqtags" placeholder="e.g. Unit 1, Memory"></div>
          </div>
          <button class="btn btn-primary" onclick="window.v11AdminUploadIQ('${subjId}','${unitId}','${(subj.name || '').replace(/'/g, "\\'")}')">⭐ Add Question</button>
          <hr style="margin:1rem 0;">
          <div id="v11-iqs-list">
            ${adminIQs.map(q => `
            <div class="v11-item-row">
              <span>${q.priority === 'high' ? '🔴' : q.priority === 'low' ? '🟢' : '🟡'}</span>
              <div style="flex:1;min-width:0;"><div style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${q.question.substring(0, 80)}${q.question.length > 80 ? '...' : ''}</div><div style="font-size:.72rem;color:var(--text3);">${q.priority} priority${q.tags ? ' · ' + q.tags : ''}</div></div>
              <span class="badge badge-green">Live</span>
              ${v10SaDotMenuHtml('iq', q.id || q.dbContentId, subjId, unitId)}
            </div>`).join('') || '<p style="color:var(--text3);font-size:.83rem;">No important questions yet.</p>'}}
          </div>
        </div>
      </div>
    </div>`;
  };

  window.v11CreatorUnitDetail = async function (subjId, unitId) {
    const subj = window._v11CrSubj || window._v10SASubj || findSubjectById(subjId);
    if (!subj) return;
    const content = document.getElementById('sa-content') || document.getElementById('admin-content');
    if (!content) return;
    const units = v11GetUnits(subjId, false, subj);
    const unit = units.find(u => String(u.id) === String(unitId)) || { id: unitId, name: unitLabel(unitId), topics: [], sort_order: unitNumber(unitId) };
    const by = APP.subAdminData?.username || 'Creator';

    if (typeof window.v10ReloadUnitRoadmapFromDb === 'function') {
      const dbUnitObj = { id: unitId, name: unitLabel(unit, unitId), dbUnitId: unit.id };
      const reloadedUnit = await window.v10ReloadUnitRoadmapFromDb(subjId, unitId, { ...subj, dbSubjectId: subjId }, dbUnitObj);
      if (reloadedUnit) {
        unit.topics = reloadedUnit.topics || [];
      }
    }
    if (typeof window.v10ReloadUnitContentFromDb === 'function') {
      await window.v10ReloadUnitContentFromDb(subj.name, unitId);
    }

    const adminVideos = window.v10GetUnitContent(subj.name, unitId, 'videos');
    const adminNotes = window.v10GetUnitContent(subj.name, unitId, 'notes');
    const adminPYQs = window.v10GetUnitContent(subj.name, unitId, 'pyqs');
    const adminIQs = window.v10GetUnitContent(subj.name, unitId, 'iqs');

    content.innerHTML = `
    <div style="padding:2rem;max-width:1100px;margin:0 auto;width:100%;">
      <button class="v11-back" onclick="window.v11CreatorUnitsPage(window._v11CrSubj)">← Back to Units</button>
      <h2 style="font-size:1.15rem;font-weight:800;margin-bottom:.4rem;">${esc(subj.name)} - ${unitLabel(unit, unitId)}</h2>
      <p style="font-size:.79rem;color:var(--text3);margin-bottom:1.2rem;">Upload content — instantly visible to all students</p>

      ${(unit.topics || []).length ? `
      <div class="card" style="margin-bottom:1.2rem;border-left:3px solid var(--teal);">
        <h4 style="margin-bottom:.6rem;font-size:.9rem;">📋 Learning Roadmap (${(unit.topics || []).length} topics)</h4>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">
          ${(unit.topics || []).map(t => `<span class="tag">${t.name}</span>`).join('')}
        </div>
      </div>` : ''}

      <div class="v11-tabs">
        <button class="v11-tab on" onclick="v11SwitchTab(this,'v11-cr-videos')">🎬 Videos (${adminVideos.length})</button>
        <button class="v11-tab" onclick="v11SwitchTab(this,'v11-cr-notes')">📄 Notes (${adminNotes.length})</button>
        <button class="v11-tab" onclick="v11SwitchTab(this,'v11-cr-pyqs')">📝 PYQs (${adminPYQs.length})</button>
        <button class="v11-tab" onclick="v11SwitchTab(this,'v11-cr-iqs')">⭐ Imp. Questions (${adminIQs.length})</button>
      </div>

      <!-- Videos Pane -->
      <div class="v11-pane on" id="v11-cr-videos">
        <div class="card">
          <h4 style="margin-bottom:1rem;">🎬 Upload Video</h4>
          <div class="form-row">
            <div class="input-group"><label>Video Title</label><input class="input" id="v11-vtitle" placeholder="e.g. Unit 1 Introduction"></div>
            <div class="input-group"><label>YouTube URL</label><input class="input" id="v11-vurl" placeholder="https://youtube.com/watch?v=..."></div>
          </div>
          <button class="btn btn-primary" onclick="window.v11AdminUploadVideo('${subjId}','${unitId}','${(subj.name || '').replace(/'/g, "\\'")}')">📤 Upload Video</button>
          <hr style="margin:1rem 0;">
          <div id="v11-cr-videos-list">
            ${adminVideos.map(v => `
            <div class="v11-item-row">
              <span>🎬</span>
              <div style="flex:1;min-width:0;"><div style="font-weight:600;">${v.title}</div><div style="font-size:.72rem;color:var(--primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${v.url}</div></div>
              <span class="badge badge-green">Live</span>
              ${v10SaDotMenuHtml('video', v.id || v.dbContentId, subjId, unitId)}
            </div>`).join('') || '<p style="color:var(--text3);font-size:.83rem;">No videos yet.</p>'}
          </div>
        </div>
      </div>

      <!-- Notes Pane -->
      <div class="v11-pane" id="v11-cr-notes">
        <div class="card">
          <h4 style="margin-bottom:1rem;">📄 Upload Notes</h4>
          <div class="form-row">
            <div class="input-group"><label>Title</label><input class="input" id="v11-ntitle" placeholder="e.g. Unit 1 Handwritten Notes"></div>
            <div class="input-group"><label>Type</label>
              <select class="select" id="v11-ntype">
                <option value="pdf">PDF</option><option value="doc">DOC</option><option value="link">Link</option>
              </select></div>
          </div>
          <div class="input-group"><label>Google Drive / URL Link</label><input class="input" id="v11-nlink" placeholder="https://drive.google.com/..."></div>
          <button class="btn btn-primary" onclick="window.v11AdminUploadNote('${subjId}','${unitId}','${(subj.name || '').replace(/'/g, "\\'")}')">📤 Upload Notes</button>
          <hr style="margin:1rem 0;">
          <div id="v11-cr-notes-list">
            ${adminNotes.map(n => `
            <div class="v11-item-row">
              <span>📄</span>
              <div style="flex:1;"><div style="font-weight:600;">${n.title}</div><div style="font-size:.72rem;color:var(--text3);">${n.type?.toUpperCase() || 'FILE'} · ${n.uploadedAt || ''}</div></div>
              <span class="badge badge-green">Live</span>
              ${v10SaDotMenuHtml('note', n.id || n.dbContentId, subjId, unitId)}
            </div>`).join('') || '<p style="color:var(--text3);font-size:.83rem;">No notes yet.</p>'}
          </div>
        </div>
      </div>

      <!-- PYQs Pane -->
      <div class="v11-pane" id="v11-cr-pyqs">
        <div class="card">
          <h4 style="margin-bottom:1rem;">📝 Add PYQ</h4>
          <div class="form-row">
            <div class="input-group"><label>Exam Year</label><input class="input" id="v11-pyqyr" placeholder="e.g. 2023" type="number" min="2000" max="2099"></div>
            <div class="input-group"><label>Times Asked</label><input class="input" id="v11-pyqcnt" placeholder="e.g. 3" type="number" min="1" value="1"></div>
          </div>
          <div class="input-group"><label>Question</label><textarea class="input" id="v11-pyqtxt" placeholder="Type the question..." rows="3" style="resize:vertical;"></textarea></div>
          <div class="input-group"><label>Answer (optional)</label><textarea class="input" id="v11-pyqans" placeholder="Answer/explanation..." rows="2" style="resize:vertical;"></textarea></div>
          <button class="btn btn-primary" onclick="window.v11AdminUploadPYQ('${subjId}','${unitId}','${(subj.name || '').replace(/'/g, "\\'")}')">📝 Add PYQ</button>
          <hr style="margin:1rem 0;">
          <div id="v11-cr-pyqs-list">
            ${adminPYQs.map(p => `
            <div class="v11-item-row">
              <span>📝</span>
              <div style="flex:1;min-width:0;"><div style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${p.question.substring(0, 80)}${p.question.length > 80 ? '...' : ''}</div><div style="font-size:.72rem;color:var(--text3);">Year: ${p.year} · ×${p.count || 1}</div></div>
              <span class="badge badge-green">Live</span>
              ${v10SaDotMenuHtml('pyq', p.id || p.dbContentId, subjId, unitId)}
            </div>`).join('') || '<p style="color:var(--text3);font-size:.83rem;">No PYQs yet.</p>'}
          </div>
        </div>
      </div>

      <!-- IQs Pane -->
      <div class="v11-pane" id="v11-cr-iqs">
        <div class="card">
          <h4 style="margin-bottom:1rem;">⭐ Add Important Question</h4>
          <div class="input-group"><label>Question</label><textarea class="input" id="v11-iqtxt" placeholder="Type the important question..." rows="3" style="resize:vertical;"></textarea></div>
          <div class="form-row">
            <div class="input-group"><label>Priority</label>
              <select class="select" id="v11-iqprio">
                <option value="high">🔴 High</option>
                <option value="med" selected>🟡 Medium</option>
                <option value="low">🟢 Low</option>
              </select></div>
            <div class="input-group"><label>Tags</label><input class="input" id="v11-iqtags" placeholder="e.g. Unit 1, Memory"></div>
          </div>
          <button class="btn btn-primary" onclick="window.v11AdminUploadIQ('${subjId}','${unitId}','${(subj.name || '').replace(/'/g, "\\'")}')">⭐ Add Question</button>
          <hr style="margin:1rem 0;">
          <div id="v11-cr-iqs-list">
            ${adminIQs.map(q => `
            <div class="v11-item-row">
              <span>${q.priority === 'high' ? '🔴' : q.priority === 'low' ? '🟢' : '🟡'}</span>
              <div style="flex:1;min-width:0;"><div style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${q.question.substring(0, 80)}${q.question.length > 80 ? '...' : ''}</div><div style="font-size:.72rem;color:var(--text3);">${q.priority} priority${q.tags ? ' · ' + q.tags : ''}</div></div>
              <span class="badge badge-green">Live</span>
              ${v10SaDotMenuHtml('iq', q.id || q.dbContentId, subjId, unitId)}
            </div>`).join('') || '<p style="color:var(--text3);font-size:.83rem;">No important questions yet.</p>'}
          </div>
        </div>
      </div>
    </div>`;
  };

  // Inject Edit/Delete hover overrides
  const styleEl = document.createElement('style');
  styleEl.textContent = `
    .v10-edit-btn:hover { background:var(--primary-light) !important; color:var(--primary) !important; }
    .v10-del-btn:hover { background:var(--red-light) !important; color:var(--red) !important; }
  `;
  document.head.appendChild(styleEl);

  window.submitVideoSuggestion = async function submitVideoSuggestionDb() {
    const titleInput = document.getElementById('suggest-title-input');
    const urlInput = document.getElementById('suggest-url-input');
    const descInput = document.getElementById('suggest-desc-input');
    const title = titleInput?.value.trim() || '';
    const url = urlInput?.value.trim() || '';
    const description = descInput?.value.trim() || '';
    if (!url) { showToast('Please enter a URL', 'red'); return; }
    try { new URL(url); } catch (e) { showToast('Please enter a valid URL', 'red'); return; }

    const supabase = window.__AIMEASY_SUPABASE__;
    const currentItem = window.APP?._videoItems?.[window.APP.currentVideoIndex];
    const subject = window.APP?.currentSubject;
    const unitNum = window.APP?.currentUnit || 1;
    if (!supabase || !subject || !currentItem?.topicId) {
      showToast('Open a roadmap topic before suggesting a URL.', 'red');
      return;
    }

    const roadmap = await window.aimeasyFetchUnitRoadmap?.({
      subject,
      unit: { id: unitNum, name: `Unit ${unitNum}` },
    });
    const subjectId = roadmap?.data?.subjectId;
    const unitId = roadmap?.data?.unitId;
    const topicId = currentItem.topicId || currentItem.id;
    if (!subjectId || !unitId || !topicId) {
      showToast('Unable to map this suggestion to the current unit/topic.', 'red');
      return;
    }

    const topicName = title || currentItem.title || currentItem.topicName || 'Suggested URL';
    const authUser = supabase.auth?.getUser ? (await supabase.auth.getUser())?.data?.user : null;
    const { error } = await supabase.from('student_url_suggestions').insert({
      student_id: authUser?.id || window.APP?.user?.id || window.APP?.user?.googleId || null,
      student_name: window.APP?.user?.name || 'Student',
      subject_id: subjectId,
      unit_id: unitId,
      topic_id: topicId,
      topic_name: topicName,
      url,
      description,
      status: 'pending',
    });
    if (error) {
      showToast('Suggestion save failed: ' + error.message, 'red');
      return;
    }

    if (titleInput) titleInput.value = '';
    if (urlInput) urlInput.value = '';
    if (descInput) descInput.value = '';
    await window.renderPendingUrls?.();
    showToast('URL submitted. Awaiting admin approval.', 'green');
  };

  window.renderPendingUrls = async function renderPendingUrlsDb() {
    const list = document.getElementById('suggest-pending-list');
    if (!list) return;
    const supabase = window.__AIMEASY_SUPABASE__;
    const currentItem = window.APP?._videoItems?.[window.APP.currentVideoIndex];
    if (!supabase || !currentItem?.topicId) { list.innerHTML = ''; return; }
    const authUser = supabase.auth?.getUser ? (await supabase.auth.getUser())?.data?.user : null;
    let query = supabase
      .from('student_url_suggestions')
      .select('id, topic_name, url, status, created_at, topic_id')
      .eq('topic_id', currentItem.topicId)
      .order('created_at', { ascending: false });
    if (authUser?.id) query = query.eq('student_id', authUser.id);
    const { data, error } = await query;
    if (error) {
      list.innerHTML = '';
      console.warn('[SUGGESTIONS] Pending URL load failed:', error.message || error);
      return;
    }
    if (!data?.length) { list.innerHTML = ''; return; }
    const esc = window.v10Esc || ((s) => String(s || ''));
    list.innerHTML = `<div style="font-size:0.78rem;font-weight:700;color:var(--text2);margin-bottom:6px;">Your Submissions:</div>` +
      data.map((row) => `
        <div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:4px;font-size:0.78rem;">
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text2);">${esc(row.topic_name || row.url)}</span>
          <span class="badge ${row.status === 'approved' ? 'badge-green' : row.status === 'rejected' ? 'badge-red' : 'badge-amber'}">${esc(row.status)}</span>
          ${row.status === 'approved' ? `<button class="btn btn-primary btn-sm" onclick="window.openApprovedVideo('${esc(row.url)}')">Watch</button>` : ''}
        </div>`).join('');
  };

  function installStudentBackButtons() {
    const pages = document.querySelectorAll('#screen-app [id^="page-"]');
    pages.forEach((page) => {
      if (page.id === 'page-dashboard') return;
      if (page.querySelector(':scope > .aimeasy-page-back')) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'back-btn aimeasy-page-back';
      btn.textContent = 'Back';
      btn.addEventListener('click', () => {
        if (page.id === 'page-units') window.navigateTo?.('subjects');
        else if (page.id === 'page-unit-content') window.backToUnits?.();
        else window.aimeasySafeBack?.('/student/dashboard', () => window.navigateTo?.('dashboard'));
      });
      page.insertBefore(btn, page.firstChild);
    });
  }

  async function hydrateProfileFormFromSupabase() {
    const supabase = window.__AIMEASY_SUPABASE__;
    const profileScreen = document.getElementById('screen-profile');
    if (!profileScreen) return;
    if (!profileScreen.querySelector('.aimeasy-profile-back')) {
      const card = profileScreen.querySelector('.profile-card');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-ghost btn-sm aimeasy-profile-back';
      btn.textContent = 'Back';
      btn.addEventListener('click', () => window.aimeasySafeBack?.('/student/dashboard', () => window.navigateTo?.('dashboard')));
      card?.insertBefore(btn, card.firstChild);
    }
    let row = window.APP?.user || {};
    try {
      const authUser = supabase?.auth?.getUser ? (await supabase.auth.getUser())?.data?.user : null;
      if (supabase && authUser?.id) {
        const { data } = await supabase.from('profiles').select('*').eq('id', authUser.id).maybeSingle();
        if (data) row = { ...row, ...data };
      }
    } catch (e) {
      console.warn('[PROFILE] Load failed:', e?.message || e);
    }
    const set = (id, value) => {
      const el = document.getElementById(id);
      if (el && value !== undefined && value !== null) el.value = value;
    };
    set('p-name', row.full_name || row.name);
    set('p-email', row.email || window.APP?.user?.email);
    set('p-phone', row.phone_number || row.phone);
    set('p-college', row.college);
    set('p-year', row.year);
    if (row.year && typeof window.updateSemesterOptions === 'function') window.updateSemesterOptions();
    set('p-semester', row.semester);
    if (typeof window.aimeasyHydrateProfileDropdowns === 'function') {
      await window.aimeasyHydrateProfileDropdowns(document, {
        savedUniversity: row.university_name || row.university,
        savedBranch: row.branch_name || row.branch,
        savedRegulation: row.regulation_code || row.regulation,
        universityId: row.university_id,
        branchId: row.branch_id,
      });
    }
  }

  document.addEventListener('click', (event) => {
    const bell = event.target.closest('#screen-app .notif-btn');
    if (!bell) return;
    event.preventDefault();
    event.stopPropagation();
    window.openNotificationsModal?.();
  }, true);

  const aimeasyShowScreenBeforeProfileHydrate = window.showScreen || showScreen;
  window.showScreen = showScreen = function showScreenHydrateProfile(id, ...rest) {
    const result = aimeasyShowScreenBeforeProfileHydrate?.call(this, id, ...rest);
    if (id === 'screen-profile') window.setTimeout(() => hydrateProfileFormFromSupabase(), 0);
    return result;
  };

  setTimeout(() => {
    installStudentBackButtons();
    hydrateProfileFormFromSupabase();
  }, 200);
  window.addEventListener('aimeasy:data-changed', installStudentBackButtons);

  window.v10StoreUnitTopics = function (subjId, unitId, topics) {
    window.__v10UnitTopicsCache = window.__v10UnitTopicsCache || {};
    window.__v10UnitTopicsCache[`${subjId}:${unitId}`] = topics || [];
    return [{ id: unitId, topics: topics || [] }];
  };

  window.v10UnitForDb = function (unitId) {
    const subj = window.v10SubjectForDb('');
    return {
      id: unitId,
      dbUnitId: subj?.dbUnitIds?.[unitId] || unitId,
      name: typeof unitLabel === 'function' ? unitLabel(unitId) : `Unit ${unitId}`,
      sort_order: typeof unitNumber === 'function' ? unitNumber(unitId) : 1,
    };
  };

  window.v11AdminAddTopic = async function v11AdminAddTopicDb(subjId, unitId) {
    const nameEl = document.getElementById('v11-topic-name');
    const urlEl = document.getElementById('v11-topic-url');
    const name = nameEl?.value.trim();
    const url = urlEl?.value.trim();
    if (!name) { showToast('Enter topic name', 'red'); return; }
    if (!url) { showToast('Enter topic URL', 'red'); return; }
    if (url) {
      try { new URL(url); } catch (e) { showToast('Please enter a valid URL', 'red'); return; }
    }
    const subj = window._v11AdminSubj || window._v10SASubj || findSubjectById?.(subjId);
    const unit = window.v10UnitForDb?.(unitId) || { id: unitId, name: unitLabel?.(unitId), sort_order: unitNumber?.(unitId) };
    if (!window.aimeasySaveUnitRoadmap || !subj) {
      showToast('Topic DB save is unavailable.', 'red');
      return;
    }
    await window.v10ReloadUnitRoadmapFromDb?.(subjId, unitId, { ...subj, dbSubjectId: subjId }, unit);
    const cacheKey = `${subjId}:${unitId}`;
    const existing = window.__v10UnitTopicsCache?.[cacheKey] || [];
    const topics = [...existing, {
      name,
      topicName: name,
      url,
      youtubeUrl: url,
      urls: url ? [url] : [],
      youtubeUrls: url ? [url] : [],
      videos: url ? [{ url, description: '' }] : [],
    }];
    const { data, error } = await window.aimeasySaveUnitRoadmap({ subject: subj, unit, topics });
    if (error) {
      showToast('Topic save failed: ' + error.message, 'red');
      return;
    }
    if (nameEl) nameEl.value = '';
    if (urlEl) urlEl.value = '';
    await window.v10RefreshRoadmapListInPlace?.(subjId, unitId);
    showToast('Topic saved.', 'green');
    window.renderSubAdminDashboardLive?.();
    window.renderAdminDashboardLive?.();
  };

  window.v11AdminDeleteTopic = async function v11AdminDeleteTopicDb(subjId, unitId, topicIdx) {
    const cacheKey = `${subjId}:${unitId}`;
    const topics = window.__v10UnitTopicsCache?.[cacheKey] || [];
    const topic = topics[topicIdx];
    if (!topic?.id) return;
    window.v10DeleteSavedRoadmapTopicDb?.(subjId, unitId, topic.id);
  };

  async function aimeasyResolveRoadmapContext(subjId, unitId) {
    const subject = window._v10SASubj
      || window._v11AdminSubj
      || window._v11CrSubj
      || findSubjectById?.(subjId)
      || { id: subjId, rawId: subjId, dbSubjectId: subjId };
    const unit = window.v10UnitForDb?.(unitId)
      || { id: unitId, name: unitLabel?.(unitId), title: unitLabel?.(unitId), sort_order: unitNumber?.(unitId), dbUnitId: subject?.dbUnitIds?.[unitId] || unitId };
    const cacheKey = `${subjId}:${unitId}`;
    const cachedTopics = window.__v10UnitTopicsCache?.[cacheKey];
    const fetched = await window.aimeasyFetchUnitRoadmap?.({ subject, unit });
    return {
      subject,
      unit,
      subjectId: fetched?.data?.subjectId || subject.dbSubjectId || subject.rawId || subjId,
      unitId: fetched?.data?.unitId || unit.dbUnitId || unit.id || unitId,
      topics: fetched?.data?.topics || cachedTopics || [],
    };
  }

  function aimeasyFindTopic(ctx, topicRef) {
    const topics = Array.isArray(ctx?.topics) ? ctx.topics : [];
    const ref = String(topicRef ?? '');
    const byId = topics.find((topic) => {
      const identities = [
        topic?.id,
        topic?.dbContentId,
        topic?.topicId,
        topic?.dbTopicId,
        topic?.legacyTopicId,
      ].filter((value) => value !== undefined && value !== null);
      return identities.some((value) => String(value) === ref);
    });
    if (byId) return byId;
    const numericIndex = Number(topicRef);
    if (Number.isInteger(numericIndex) && numericIndex >= 0 && numericIndex < topics.length) {
      return topics[numericIndex];
    }
    return null;
  }

  function aimeasyTopicDbId(topic, fallback) {
    return topic?.dbContentId || topic?.id || topic?.topicId || topic?.dbTopicId || fallback || '';
  }

  async function aimeasyRefreshRoadmapSurfaces(subjId, unitId, context) {
    const ctx = context || await aimeasyResolveRoadmapContext(subjId, unitId);
    await window.v10RefreshRoadmapListInPlace?.(subjId, unitId);
    if (document.querySelector('.screen.active')?.id === 'screen-app' && window.APP?.currentSubject && String(window.APP?.currentUnit || '') === String(unitId)) {
      const subjectKey = window.APP.currentSubject.id || window.APP.currentSubject.rawId || subjId;
      window.renderVideoList?.(subjectKey, unitId);
    }
    if (!window._v10SAUnitId && !window._v11AdminUnitId) {
      window.renderSubAdminDashboardLive?.();
      window.renderAdminDashboardLive?.();
    }
  }

  window.v10OpenRoadmapEditModalDb = function v10OpenRoadmapEditModalDbBridge(subjId, unitId, topicId) {
    return window.v10OpenUnifiedEditModal?.({ contentType: 'roadmap', itemId: topicId, subjectId: subjId, unitId });
  };

  window.v10SaveRoadmapEditModalDb = undefined;

  window.v10DeleteSavedRoadmapTopicDb = function v10DeleteSavedRoadmapTopicDbBridge(subjId, unitId, topicId) {
    return window.v10OpenUnifiedDeleteModal?.({ contentType: 'roadmap', itemId: topicId, subjectId: subjId, unitId });
  };

  window.v10OpenRoadmapEditModal = window.v10OpenRoadmapEditModalDb;
  window.v10DeleteSavedRoadmapTopic = window.v10DeleteSavedRoadmapTopicDb;

  window.submitVideoSuggestion = async function submitVideoSuggestionDbFixed() {
    const titleInput = document.getElementById('suggest-title-input');
    const urlInput = document.getElementById('suggest-url-input');
    const descInput = document.getElementById('suggest-desc-input');
    const title = titleInput?.value.trim() || '';
    const url = urlInput?.value.trim() || '';
    const description = descInput?.value.trim() || '';
    if (!url) { showToast('Please enter a URL', 'red'); return; }
    try { new URL(url); } catch (e) { showToast('Please enter a valid URL', 'red'); return; }
    const supabase = window.__AIMEASY_SUPABASE__;
    const currentItem = window.APP?._videoItems?.[window.APP.currentVideoIndex];
    const subject = window.APP?.currentSubject;
    const unitNum = window.APP?.currentUnit || 1;
    if (!supabase || !subject || !currentItem?.topicId) {
      showToast('Open a roadmap topic before suggesting a URL.', 'red');
      return;
    }
    const roadmap = await window.aimeasyFetchUnitRoadmap?.({ subject, unit: { id: unitNum, name: `Unit ${unitNum}`, dbUnitId: subject?.dbUnitIds?.[unitNum] } });
    const subjectId = roadmap?.data?.subjectId;
    const unitId = roadmap?.data?.unitId;
    const topic = (roadmap?.data?.topics || []).find(t => String(t.id || t.dbContentId) === String(currentItem.topicId));
    const topicId = topic?.id || currentItem.topicId;
    if (!subjectId || !unitId || !topicId) {
      showToast('Unable to map this suggestion to the current unit/topic.', 'red');
      return;
    }
    const authUser = supabase.auth?.getUser ? (await supabase.auth.getUser())?.data?.user : null;
    const topicName = title || topic?.topicName || topic?.name || currentItem.title || currentItem.topicName || 'Suggested URL';
    const suggestionPayload = {
      student_id: authUser?.id || window.APP?.user?.id || window.APP?.user?.googleId || null,
      student_name: window.APP?.user?.name || 'Student',
      subject_id: subjectId,
      unit_id: unitId,
      topic_id: topicId,
      subject_name: subject.name || '',
      unit_name: roadmap?.data?.unitName || `Unit ${unitNum}`,
      topic_name: topicName,
      url,
      description,
      status: 'pending',
    };
    let { error } = await supabase.from('student_url_suggestions').insert(suggestionPayload);
    if (error && /subject_name|unit_name|topic_name/i.test(error.message || '')) {
      const { subject_name, unit_name, topic_name, ...requiredPayload } = suggestionPayload;
      const retry = await supabase.from('student_url_suggestions').insert(requiredPayload);
      error = retry.error;
    }
    if (error) { showToast('Suggestion save failed: ' + error.message, 'red'); return; }
    if (titleInput) titleInput.value = '';
    if (urlInput) urlInput.value = '';
    if (descInput) descInput.value = '';
    await window.renderPendingUrls?.();
    showToast('URL submitted. Awaiting admin approval.', 'green');
  };

  const aimeasyRenderVideoListWithSuggestions = window.renderVideoList || renderVideoList;
  window.openApprovedVideo = async function openApprovedVideoDbFixed(url) {
    const sid = APP.currentSubject?.id || APP.currentSubject?.rawId || 'default';
    const uid = APP.currentUnit || 1;
    await aimeasyRenderVideoListWithSuggestions?.(sid, uid);
    const idx = (APP._videoItems || []).findIndex(v => String(v.url || '') === String(url || ''));
    if (idx >= 0) {
      selectVideoItem(idx);
      switchTab?.('videos');
      showToast('Playing approved URL.', 'green');
    }
  };

  const aimeasyOriginalSelectTopicUrl = window.selectTopicUrl || selectTopicUrl;
  window.selectTopicUrl = selectTopicUrl = function selectTopicUrlFixed(topicIndex, urlIndex) {
    const matchIndex = (APP._videoItems || []).findIndex(item => Number(item.topicIndex) === Number(topicIndex) && Number(item.videoIndex) === Number(urlIndex));
    if (matchIndex >= 0) selectVideoItem(matchIndex);
    else aimeasyOriginalSelectTopicUrl?.(topicIndex, urlIndex);
  };

  window.addEventListener('aimeasy:data-changed', () => {
    if (document.querySelector('.screen.active')?.id === 'screen-app') installStudentBackButtons();
  });

  setTimeout(() => {
    updateRegulationDropdowns();
    updateUniversityDropdowns();
    addMenuIcons();
    replaceUnitButtons();
  }, 0);
})();
