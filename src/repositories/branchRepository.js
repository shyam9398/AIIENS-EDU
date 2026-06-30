/**
 * Single source of truth for public.branches — no localStorage/sessionStorage caching.
 */
import {
  fetchBranchesCatalog,
  filterActiveCatalogRows,
} from '../services/academic/catalogFetch.js';
import { supabase } from '../services/supabase/client.js';
import { resolveUniversityId as resolveUniversityIdFromRepo, PROFILE_ACADEMIC_SELECT_IDS } from './universityRepository.js';

function esc(value) {
  return String(value ?? '').replace(/"/g, '&quot;');
}

async function resolveUniversityId(universityId, universityName) {
  return resolveUniversityIdFromRepo(universityId, universityName);
}

/** Active branches for dropdowns — always fetched fresh from Supabase. */
export async function fetchActiveBranches({
  universityId = null,
  universityName = null,
  includeGlobalBranches = false,
} = {}) {
  const resolvedId = await resolveUniversityId(universityId, universityName);

  const catalogRows = await fetchBranchesCatalog({
    universityId: resolvedId,
    includeGlobalBranches,
  });
  if (catalogRows.length || resolvedId) return catalogRows;

  if (!supabase) return [];
  let q = supabase.from('branches').select('id,name,university_id,status,created_at').order('name', { ascending: true });
  if (resolvedId) {
    if (includeGlobalBranches) {
      q = q.or(`university_id.eq.${resolvedId},university_id.is.null`);
    } else {
      q = q.eq('university_id', resolvedId);
    }
  }
  const { data, error } = await q;
  if (error) {
    console.warn('[branchRepository] fetchActiveBranches fallback:', error.message);
    return [];
  }
  const rows = filterActiveCatalogRows(data || []);
  console.info('[branchRepository] loaded active branches (client fallback)', {
    count: rows.length,
    universityId: resolvedId || null,
  });
  return rows;
}

/** All branches for admin management (includes inactive). */
export async function fetchAllBranches({ universityId = null } = {}) {
  if (!supabase) return [];
  let q = supabase.from('branches').select('*').order('name', { ascending: true });
  if (universityId) q = q.eq('university_id', universityId);
  const { data, error } = await q;
  if (error) {
    console.warn('[branchRepository] fetchAllBranches:', error.message);
    return [];
  }
  return data || [];
}

export async function createBranch({ name, universityId = null, status = 'active' }) {
  if (!supabase) return { data: null, error: new Error('Supabase not configured') };
  const row = {
    name,
    status: status === 'inactive' ? 'inactive' : 'active',
  };
  if (universityId) row.university_id = universityId;
  return supabase.from('branches').insert(row).select().single();
}

export async function updateBranch(id, { name, universityId, status }) {
  if (!supabase) return { data: null, error: new Error('Supabase not configured') };
  const payload = {};
  if (name !== undefined) payload.name = name;
  if (universityId !== undefined) payload.university_id = universityId;
  if (status !== undefined) payload.status = status === 'inactive' ? 'inactive' : 'active';
  return supabase.from('branches').update(payload).eq('id', id).select().single();
}

export async function deleteBranch(id) {
  if (!supabase) return { error: new Error('Supabase not configured') };
  return supabase.from('branches').delete().eq('id', id);
}

export async function setBranchStatus(id, status) {
  return updateBranch(id, { status: status === 'inactive' ? 'inactive' : 'active' });
}

export async function resolveBranchId({ branchId = null, branchName = null, universityId = null, universityName = null } = {}) {
  if (branchId) return branchId;
  if (!branchName) return null;
  const resolvedUniversityId = await resolveUniversityId(universityId, universityName);
  const rows = await fetchActiveBranches({
    universityId: resolvedUniversityId,
    universityName,
    includeGlobalBranches: true,
  });
  const match = rows.find((row) => String(row.name || '').trim().toLowerCase() === String(branchName).trim().toLowerCase());
  return match?.id || null;
}

export function branchOptionsHtml(
  branches,
  {
    selectedValue = '',
    includeAll = false,
    allLabel = 'All Branches',
    placeholder = 'Select Branch',
    emptyLabel = 'No branches available',
  } = {},
) {
  const rows = Array.isArray(branches) ? branches : [];
  let html = includeAll
    ? `<option value="">${allLabel}</option>`
    : `<option value="">${rows.length ? placeholder : emptyLabel}</option>`;
  html += rows
    .map((branch) => {
      const name = branch?.name ?? branch;
      return `<option value="${esc(name)}"${String(selectedValue) === String(name) ? ' selected' : ''}>${esc(name)}</option>`;
    })
    .join('');
  return html;
}

export async function hydrateBranchSelect(
  selectEl,
  {
    universityId = null,
    universityName = null,
    selectedValue = '',
    includeAll = false,
    includeGlobalBranches = false,
    allLabel,
    placeholder,
    emptyLabel,
  } = {},
) {
  if (!selectEl) return [];
  const current = selectedValue || selectEl.value || '';
  const branches = await fetchActiveBranches({ universityId, universityName, includeGlobalBranches });
  selectEl.disabled = false;
  selectEl.innerHTML = branchOptionsHtml(branches, {
    selectedValue: current,
    includeAll,
    allLabel,
    placeholder,
    emptyLabel,
  });
  if (current && ![...selectEl.options].some((option) => option.value === current)) {
    selectEl.value = '';
  }
  return branches;
}

/** Known university → branch select pairs across the app. */
export const BRANCH_CASCADE_PAIRS = [
  ['sa-create-university', 'sa-create-branch'],
  ['v10-sa-uni', 'v10-sa-branch'],
  ['v11-adm-uni', 'v11-adm-branch'],
  ['admin-subject-uni', 'admin-subject-branch'],
  ['adm-uni', 'adm-branch'],
  ['sa-sub-uni', 'sa-sub-branch'],
  ['sa-uni', 'sa-branch'],
];

export async function bindBranchCascade(universitySelectId, branchSelectId, { includeAll = false, includeGlobalBranches = false } = {}) {
  const uniSelect = document.getElementById(universitySelectId);
  const branchSelect = document.getElementById(branchSelectId);
  if (!uniSelect || !branchSelect) return;

  const sync = async () => {
    const uniName = uniSelect.value || '';
    if (!uniName) {
      branchSelect.disabled = true;
      branchSelect.innerHTML = branchOptionsHtml([], { placeholder: 'Select university first' });
      return;
    }
    branchSelect.disabled = true;
    branchSelect.innerHTML = branchOptionsHtml([], { placeholder: 'Loading branches...' });
    await hydrateBranchSelect(branchSelect, {
      universityName: uniName,
      selectedValue: '',
      includeAll,
      includeGlobalBranches,
      allLabel: 'All Branches',
      emptyLabel: 'No branches available',
    });
  };

  if (!uniSelect.dataset.branchCascadeBound) {
    uniSelect.dataset.branchCascadeBound = '1';
    uniSelect.addEventListener('change', sync);
  }
  await sync();
}

export async function hydrateAllBranchDropdowns(root = document) {
  await Promise.all(
    BRANCH_CASCADE_PAIRS.map(([uniId, branchId]) =>
      bindBranchCascade(uniId, branchId, { includeGlobalBranches: true }),
    ),
  );

  root.querySelectorAll?.('select[id*="branch"], select[id*="-branch"]').forEach(async (select) => {
    if (PROFILE_ACADEMIC_SELECT_IDS.has(select.id)) return;
    if (BRANCH_CASCADE_PAIRS.some(([, branchId]) => select.id === branchId)) return;
    const label = (select.closest('.input-group')?.querySelector('label')?.textContent || '').toLowerCase();
    if (!select.id.toLowerCase().includes('branch') && !label.includes('branch')) return;
    if (select.dataset.dynamicBranches === '1') return;
    select.dataset.dynamicBranches = '1';
    await hydrateBranchSelect(select, {
      includeAll: select.querySelector('option[value=""]')?.textContent?.includes('All'),
      includeGlobalBranches: true,
    });
  });
}

export async function fetchActiveBranchNames({ universityName = null, universityId = null } = {}) {
  const rows = await fetchActiveBranches({ universityName, universityId, includeGlobalBranches: true });
  return rows.map((row) => row.name).filter(Boolean);
}

export const getBranches = fetchActiveBranches;
export const getBranchesByUniversity = (universityId, options = {}) =>
  fetchActiveBranches({ universityId, ...options });
