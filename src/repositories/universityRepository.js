/**
 * Single source of truth for public.universities — no localStorage/sessionStorage caching.
 */
import {
  fetchUniversitiesCatalog,
  filterActiveCatalogRows,
} from '../services/academic/catalogFetch.js';
import { supabase } from '../services/supabase/client.js';

function esc(value) {
  return String(value ?? '').replace(/"/g, '&quot;');
}

/** Active universities for dropdowns — always fetched fresh from Supabase. */
export async function fetchActiveUniversities() {
  const rows = await fetchUniversitiesCatalog();
  if (rows.length) return rows;

  if (!supabase) return [];
  const { data, error } = await supabase.from('universities').select('id,name,code,state,status,created_at').order('name', { ascending: true });
  if (error) {
    console.warn('[universityRepository] fetchActiveUniversities fallback:', error.message);
    return [];
  }
  const active = filterActiveCatalogRows(data || []);
  console.info('[universityRepository] loaded active universities (client fallback)', active.length);
  return active;
}

/** All universities for admin management list. */
export async function fetchAllUniversities() {
  if (!supabase) return [];
  const { data, error } = await supabase.from('universities').select('*').order('name', { ascending: true });
  if (error) {
    console.warn('[universityRepository] fetchAllUniversities:', error.message);
    return [];
  }
  return (data || []).filter((row) => String(row.status || 'active').toLowerCase() !== 'deleted');
}

export async function createUniversity({ name, code, state, status = 'active' }) {
  if (!supabase) return { data: null, error: new Error('Supabase not configured') };
  const payload = {
    name,
    code: code || name,
    state: state || null,
    status: status === 'inactive' ? 'inactive' : 'active',
    updated_at: new Date().toISOString(),
  };
  return supabase.from('universities').insert(payload).select().single();
}

export async function updateUniversity(id, { name, code, state, status }) {
  if (!supabase) return { data: null, error: new Error('Supabase not configured') };
  const payload = { updated_at: new Date().toISOString() };
  if (name !== undefined) payload.name = name;
  if (code !== undefined) payload.code = code;
  if (state !== undefined) payload.state = state;
  if (status !== undefined) payload.status = status === 'inactive' ? 'inactive' : 'active';
  return supabase.from('universities').update(payload).eq('id', id).select().single();
}

export async function deleteUniversity(id) {
  if (!supabase) return { error: new Error('Supabase not configured') };
  return supabase.from('universities').delete().eq('id', id);
}

export async function setUniversityStatus(id, status) {
  return updateUniversity(id, { status: status === 'inactive' ? 'inactive' : 'active' });
}

export async function resolveUniversityId(universityId, universityName) {
  if (universityId) return universityId;
  if (!universityName) return null;
  const rows = await fetchActiveUniversities();
  const match = rows.find((row) => String(row.name || '').trim().toLowerCase() === String(universityName).trim().toLowerCase());
  if (match?.id) return match.id;
  if (!supabase) return null;
  const { data } = await supabase.from('universities').select('id').eq('name', universityName).maybeSingle();
  return data?.id || null;
}

export function universityOptionsHtml(
  universities,
  {
    selectedValue = '',
    includeAll = false,
    allLabel = 'All Universities',
    placeholder = 'Select University',
    emptyLabel = 'No universities available',
  } = {},
) {
  const rows = Array.isArray(universities) ? universities : [];
  let html = includeAll
    ? `<option value="">${allLabel}</option>`
    : `<option value="">${rows.length ? placeholder : emptyLabel}</option>`;
  html += rows
    .map((uni) => {
      const name = uni?.name ?? uni;
      return `<option value="${esc(name)}"${String(selectedValue) === String(name) ? ' selected' : ''}>${esc(name)}</option>`;
    })
    .join('');
  return html;
}

export async function hydrateUniversitySelect(
  selectEl,
  { selectedValue = '', includeAll = false, allLabel, placeholder, emptyLabel } = {},
) {
  if (!selectEl) return [];
  const current = selectedValue || selectEl.value || '';
  const universities = await fetchActiveUniversities();
  selectEl.disabled = false;
  selectEl.innerHTML = universityOptionsHtml(universities, {
    selectedValue: current,
    includeAll,
    allLabel,
    placeholder,
    emptyLabel,
  });
  if (current && ![...selectEl.options].some((option) => option.value === current)) {
    selectEl.value = '';
  }
  return universities;
}

const UNIVERSITY_SELECT_IDS = new Set([
  'sa-create-university',
  'v10-sa-uni',
  'v11-adm-uni',
  'admin-subject-uni',
  'adm-uni',
  'sa-sub-uni',
  'sa-uni',
]);

/** Student profile academic selects — hydrated by hydrateProfileAcademicDropdowns only. */
export const PROFILE_ACADEMIC_SELECT_IDS = new Set(['p-university', 'p-regulation', 'p-branch']);

export async function hydrateAllUniversityDropdowns(root = document) {
  const selects = [];

  UNIVERSITY_SELECT_IDS.forEach((id) => {
    const el = root.getElementById?.(id) || document.getElementById(id);
    if (el) selects.push(el);
  });

  root.querySelectorAll?.('select').forEach((select) => {
    if (UNIVERSITY_SELECT_IDS.has(select.id) || PROFILE_ACADEMIC_SELECT_IDS.has(select.id)) return;
    const id = (select.id || '').toLowerCase();
    const label = (select.closest('.input-group')?.querySelector('label,.v10-label')?.textContent || '').toLowerCase();
    const onchange = select.getAttribute('onchange') || '';
    if (!id.includes('uni') && !label.includes('university') && !onchange.toLowerCase().includes('uni')) return;
    if (!selects.includes(select)) selects.push(select);
  });

  const universities = await fetchActiveUniversities();

  selects.forEach((select) => {
    const onchange = select.getAttribute('onchange') || '';
    const isFilter = onchange.includes('Filter') || onchange.includes('filter');
    select.disabled = false;
    select.innerHTML = universityOptionsHtml(universities, {
      selectedValue: select.value,
      includeAll: isFilter,
      allLabel: 'All Universities',
      emptyLabel: 'No universities available',
    });
    if (select.value && ![...select.options].some((option) => option.value === select.value)) {
      select.value = '';
    }
  });

  return universities;
}

export async function fetchActiveUniversityNames() {
  const rows = await fetchActiveUniversities();
  return rows.map((row) => row.name).filter(Boolean);
}

export const getUniversities = fetchActiveUniversities;
