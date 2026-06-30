import { fetchRegulationsCatalog } from './catalogFetch.js';
import { supabase } from '../supabase/client.js';
import { fetchActiveBranches, hydrateBranchSelect, branchOptionsHtml } from '../../repositories/branchRepository.js';
import { fetchActiveUniversities, universityOptionsHtml } from '../../repositories/universityRepository.js';
import { refreshCatalog, resolveAcademicSelection } from './academicCatalogStore.js';

export { resolveAcademicSelection };

function isActiveCatalogRow(row) {
  const status = String(row?.status || '').trim().toLowerCase();
  return !status || status === 'active';
}

export async function loadUniversities() {
  const rows = await fetchActiveUniversities();
  window.__aiiensCatalogUniversities = rows;
  window.__aiiensRuntimeUniversityNames = rows.map((row) => row.name);
  return rows;
}

export async function loadBranches(universityId, universityName = null) {
  const rows = await fetchActiveBranches({ universityId, universityName });
  if (!universityId && !universityName) {
    window.__aiiensCatalogBranches = rows;
    window.__aiiensRuntimeBranchNames = rows.map((row) => row.name);
  }
  return rows;
}

export async function loadRegulations() {
  const catalogRows = await fetchRegulationsCatalog();
  if (catalogRows.length) return catalogRows;

  if (!supabase) return [];
  const { data, error } = await supabase
    .from('regulations')
    .select('id, regulation_name, regulation_code, university, status')
    .order('regulation_code', { ascending: true });
  if (error) {
    console.warn('academicCatalog regulations:', error.message);
    return [];
  }
  return (data || []).filter(isActiveCatalogRow);
}

function fillSelect(selectEl, options, { valueKey = 'id', labelFn, placeholder = 'Select' } = {}) {
  if (!selectEl) return;
  const current = selectEl.value;
  const firstLabel = selectEl.querySelector('option[value=""]')?.textContent || placeholder;
  selectEl.innerHTML =
    `<option value="">${firstLabel}</option>` +
    options
      .map((o) => {
        const val = o[valueKey] ?? o;
        const label = labelFn ? labelFn(o) : o.name || o.regulation_name || o.regulation_code || String(val);
        return `<option value="${String(val).replace(/"/g, '&quot;')}">${label}</option>`;
      })
      .join('');
  if (current) selectEl.value = current;
}

function setSelectLoading(selectEl, message = 'Loading...') {
  if (!selectEl) return;
  selectEl.disabled = true;
  selectEl.innerHTML = `<option value="">${message}</option>`;
}

function setSelectReady(selectEl) {
  if (!selectEl) return;
  selectEl.disabled = false;
}

function profileSavedValues(overrides = {}) {
  const user = window.APP?.user || {};
  return {
    universityId: overrides.universityId ?? user.university_id ?? null,
    branchId: overrides.branchId ?? user.branch_id ?? null,
    university:
      overrides.savedUniversity ??
      overrides.university ??
      user.university_name ??
      user.university ??
      '',
    branch: overrides.savedBranch ?? overrides.branch ?? user.branch_name ?? user.branch ?? '',
    regulation:
      overrides.savedRegulation ??
      overrides.regulation ??
      user.regulation_code ??
      user.regulation ??
      '',
  };
}

function resolveUniversityName(universities, preset) {
  if (preset.university) return preset.university;
  if (preset.universityId) {
    const match = universities.find((row) => String(row.id) === String(preset.universityId));
    if (match?.name) return match.name;
  }
  return '';
}

function resolveBranchName(branches, preset) {
  if (preset.branch) return preset.branch;
  if (preset.branchId) {
    const match = branches.find((row) => String(row.id) === String(preset.branchId));
    if (match?.name) return match.name;
  }
  return '';
}

let profileCatalogListenerInstalled = false;
let lastProfileHydration = 0;

function installProfileCatalogListener() {
  if (profileCatalogListenerInstalled) return;
  profileCatalogListenerInstalled = true;
  window.addEventListener('aiiens:catalog-updated', () => {
    if (!document.getElementById('screen-profile')?.classList.contains('active')) return;
    // If profile selects are already hydrated recently, skip automatic refresh to avoid loops
    const uniSelect = document.getElementById('p-university');
    if (uniSelect && uniSelect.dataset.hydrated === '1') return;
    // Avoid rapid repeated hydrations
    if (Date.now() - lastProfileHydration < 5000) return;
    hydrateProfileAcademicDropdowns(document).catch((error) => {
      console.warn('[academicCatalog] profile catalog refresh failed:', error);
    });
  });
}

export async function hydrateProfileAcademicDropdowns(root = document, saved = {}, options = {}) {
  installProfileCatalogListener();

  const force = !!options.force;

  const uniSelect = root.getElementById?.('p-university') || document.getElementById('p-university');
  const regSelect = root.getElementById?.('p-regulation') || document.getElementById('p-regulation');
  const branchSelect = root.getElementById?.('p-branch') || document.getElementById('p-branch');
  const preset = profileSavedValues(saved);

  // Only show loading placeholders when not already hydrated or when forced
  if (!uniSelect?.dataset.hydrated || force) setSelectLoading(uniSelect, 'Loading universities...');
  if (!regSelect?.dataset.hydrated || force) setSelectLoading(regSelect, 'Loading regulations...');
  if (!branchSelect?.dataset.hydrated || force) setSelectLoading(branchSelect, 'Loading branches...');

  let universities = [];
  let regulations = [];
  let branches = [];

  try {
    [universities, regulations, branches] = await Promise.all([
      loadUniversities(),
      loadRegulations(),
      loadBranches(),
    ]);
  } catch (error) {
    console.warn('[academicCatalog] profile dropdown fetch failed:', error);
    // Ensure selects are enabled and show a clear error state (not stuck on loading)
    if (uniSelect) {
      setSelectReady(uniSelect);
      uniSelect.innerHTML = `<option value="">Unable to load universities</option>`;
    }
    if (regSelect) {
      setSelectReady(regSelect);
      regSelect.innerHTML = `<option value="">Unable to load regulations</option>`;
    }
    if (branchSelect) {
      setSelectReady(branchSelect);
      branchSelect.innerHTML = `<option value="">Unable to load branches</option>`;
    }
    return;
  }

  const selectedUniversityName = resolveUniversityName(universities, preset);

  if (uniSelect) {
    setSelectReady(uniSelect);
    uniSelect.innerHTML = universityOptionsHtml(universities, {
      selectedValue: selectedUniversityName,
      placeholder: universities.length ? 'Select University' : 'No universities available',
      emptyLabel: 'No universities available',
    });
    if (selectedUniversityName) {
      uniSelect.value = selectedUniversityName;
    }
  }

  if (regSelect) {
    setSelectReady(regSelect);
    fillSelect(regSelect, regulations, {
      valueKey: 'regulation_code',
      labelFn: (r) => r.regulation_code || r.regulation_name,
      placeholder: regulations.length ? 'Select Regulation' : 'No regulations available',
    });
    if (preset.regulation) regSelect.value = preset.regulation;
  }

  if (branchSelect) {
    const selectedBranchName = resolveBranchName(branches, preset);
    setSelectReady(branchSelect);
    branchSelect.innerHTML = branchOptionsHtml(branches, {
      selectedValue: selectedBranchName,
      placeholder: branches.length ? 'Select Branch' : 'No branches available',
      emptyLabel: 'No branches available',
    });
    if (selectedBranchName) {
      branchSelect.value = selectedBranchName;
    }
  }

  // Mark selects as hydrated so we don't auto-refresh them repeatedly
  lastProfileHydration = Date.now();
  if (uniSelect) uniSelect.dataset.hydrated = '1';
  if (regSelect) regSelect.dataset.hydrated = '1';
  if (branchSelect) branchSelect.dataset.hydrated = '1';

  console.info('[academicCatalog] profile academic dropdowns hydrated', {
    universities: universities.length,
    regulations: regulations.length,
    university: uniSelect?.value || null,
    branch: branchSelect?.value || null,
  });
}

export const hydrateStudentAcademicDetails = hydrateProfileAcademicDropdowns;

export async function hydrateAllAcademicDropdowns(root = document) {
  await refreshCatalog();
  await hydrateProfileAcademicDropdowns(root);
  await window.aiiensHydrateAllUniversityDropdowns?.(root);
  await window.aiiensHydrateAllBranchDropdowns?.(root);
  await window.aimeasyUpdateRegulationDropdowns?.(root);
}
