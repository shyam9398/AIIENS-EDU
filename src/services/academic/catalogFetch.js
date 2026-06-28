/**
 * Public catalog reads via Supabase REST + anon key.
 * Uses anon role even when a student OAuth session is active (authenticated RLS may block reads).
 */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export function isActiveCatalogStatus(status) {
  const normalized = String(status ?? 'active').trim().toLowerCase();
  if (!normalized || normalized === 'active' || normalized === 'true') return true;
  if (['inactive', 'deleted', 'disabled', 'false'].includes(normalized)) return false;
  return true;
}

export function filterActiveCatalogRows(rows) {
  return (rows || []).filter((row) => isActiveCatalogStatus(row?.status));
}

function catalogHeaders() {
  return {
    apikey: supabaseAnonKey,
    Authorization: `Bearer ${supabaseAnonKey}`,
    Accept: 'application/json',
  };
}

/**
 * Fetch catalog rows from Supabase REST (anon role).
 * @param {string} table
 * @param {{ select?: string, order?: string, ascending?: boolean, query?: Record<string, string> }} options
 */
export async function fetchCatalogRows(table, { select = '*', order = 'name', ascending = true, query = {} } = {}) {
  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('[catalogFetch] Supabase env not configured');
    return [];
  }

  try {
    const params = new URLSearchParams();
    params.set('select', select);
    params.set('order', `${order}.${ascending ? 'asc' : 'desc'}`);
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') params.set(key, value);
    });

    const response = await fetch(`${supabaseUrl}/rest/v1/${table}?${params.toString()}`, {
      headers: catalogHeaders(),
    });

    if (!response.ok) {
      console.warn(`[catalogFetch] ${table} HTTP ${response.status}`);
      return [];
    }

    const rows = await response.json();
    if (!Array.isArray(rows)) return [];
    return rows;
  } catch (error) {
    console.warn(`[catalogFetch] ${table} failed:`, error?.message || error);
    return [];
  }
}

export async function fetchUniversitiesCatalog() {
  const rows = await fetchCatalogRows('universities', {
    select: 'id,name,code,state,status,created_at',
    order: 'name',
  });
  const active = filterActiveCatalogRows(rows);
  console.info('[catalogFetch] universities', active.length);
  return active;
}

export async function fetchBranchesCatalog({ universityId = null, includeGlobalBranches = false } = {}) {
  const query = {};
  if (universityId) {
    if (includeGlobalBranches) {
      query.or = `(university_id.eq.${universityId},university_id.is.null)`;
    } else {
      query.university_id = `eq.${universityId}`;
    }
  }

  const rows = await fetchCatalogRows('branches', {
    select: 'id,name,university_id,status,created_at',
    order: 'name',
    query,
  });
  const active = filterActiveCatalogRows(rows);
  console.info('[catalogFetch] branches', { count: active.length, universityId, includeGlobalBranches });
  return active;
}

export async function fetchRegulationsCatalog() {
  const rows = await fetchCatalogRows('regulations', {
    select: 'id,regulation_name,regulation_code,university,status',
    order: 'regulation_code',
  });
  return filterActiveCatalogRows(rows);
}
