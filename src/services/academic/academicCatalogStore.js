/**
 * Shared in-memory catalog state for universities and branches.
 * Supabase repositories remain the data layer; this store coordinates refresh + UI sync.
 */
import { fetchActiveBranches } from '../../repositories/branchRepository.js';
import { fetchActiveUniversities } from '../../repositories/universityRepository.js';

const listeners = new Set();

let state = {
  universities: [],
  branches: [],
  loading: false,
  error: null,
  lastRefresh: null,
};

let refreshPromise = null;

function syncRuntimeGlobals() {
  window.__aiiensCatalogUniversities = state.universities;
  window.__aiiensCatalogBranches = state.branches;
  window.__aiiensRuntimeUniversityNames = state.universities.map((row) => row.name).filter(Boolean);
  window.__aiiensRuntimeBranchNames = state.branches.map((row) => row.name).filter(Boolean);
}

function notify() {
  syncRuntimeGlobals();
  const snapshot = getCatalogState();
  listeners.forEach((listener) => {
    try {
      listener(snapshot);
    } catch (error) {
      console.warn('[academicCatalogStore] listener failed:', error);
    }
  });
  window.dispatchEvent(new CustomEvent('aiiens:catalog-updated', { detail: snapshot }));
}

export function getCatalogState() {
  return { ...state, universities: [...state.universities], branches: [...state.branches] };
}

export function subscribeCatalog(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function findUniversityById(id) {
  return state.universities.find((row) => String(row.id) === String(id)) || null;
}

export function findUniversityByName(name) {
  const key = String(name || '').trim().toLowerCase();
  if (!key) return null;
  return state.universities.find((row) => String(row.name || '').trim().toLowerCase() === key) || null;
}

export function findBranchById(id) {
  return state.branches.find((row) => String(row.id) === String(id)) || null;
}

export function findBranchByName(name, universityId = null) {
  const key = String(name || '').trim().toLowerCase();
  if (!key) return null;
  return (
    state.branches.find((row) => {
      if (String(row.name || '').trim().toLowerCase() !== key) return false;
      if (!universityId) return true;
      return !row.university_id || String(row.university_id) === String(universityId);
    }) || null
  );
}

export async function refreshCatalog({ universityId = null, universityName = null } = {}) {
  if (refreshPromise) return refreshPromise;

  state = { ...state, loading: true, error: null };
  notify();

  refreshPromise = (async () => {
    try {
      const universities = await fetchActiveUniversities();
      const uni = universityId || findUniversityByName(universityName)?.id || null;
      const branches = await fetchActiveBranches({ universityId: uni, universityName: universityName || null });
      state = {
        universities,
        branches,
        loading: false,
        error: null,
        lastRefresh: Date.now(),
      };
      console.info('[academicCatalogStore] refreshed', {
        universities: universities.length,
        branches: branches.length,
        universityId: uni,
      });
    } catch (error) {
      state = {
        ...state,
        loading: false,
        error: error?.message || String(error),
      };
      console.warn('[academicCatalogStore] refresh failed:', state.error);
    } finally {
      refreshPromise = null;
    }
    notify();
    return getCatalogState();
  })();

  return refreshPromise;
}

export async function refreshBranchesForUniversity({ universityId = null, universityName = null } = {}) {
  try {
    const branches = await fetchActiveBranches({ universityId, universityName });
    state = { ...state, branches, error: null, lastRefresh: Date.now() };
    notify();
    return branches;
  } catch (error) {
    state = { ...state, error: error?.message || String(error) };
    notify();
    return [];
  }
}

export async function resolveAcademicSelection({
  universityId = null,
  universityName = null,
  branchId = null,
  branchName = null,
} = {}) {
  if (!state.universities.length) await refreshCatalog();

  let resolvedUniversityId = universityId || null;
  let resolvedUniversityName = universityName || null;

  if (!resolvedUniversityId && resolvedUniversityName) {
    const uni = findUniversityByName(resolvedUniversityName);
    resolvedUniversityId = uni?.id || null;
    resolvedUniversityName = uni?.name || resolvedUniversityName;
  } else if (resolvedUniversityId && !resolvedUniversityName) {
    resolvedUniversityName = findUniversityById(resolvedUniversityId)?.name || null;
  }

  if (resolvedUniversityId || resolvedUniversityName) {
    await refreshBranchesForUniversity({
      universityId: resolvedUniversityId,
      universityName: resolvedUniversityName,
    });
  }

  let resolvedBranchId = branchId || null;
  let resolvedBranchName = branchName || null;

  if (!resolvedBranchId && resolvedBranchName) {
    const branch = findBranchByName(resolvedBranchName, resolvedUniversityId);
    resolvedBranchId = branch?.id || null;
    resolvedBranchName = branch?.name || resolvedBranchName;
  } else if (resolvedBranchId && !resolvedBranchName) {
    resolvedBranchName = findBranchById(resolvedBranchId)?.name || null;
  }

  return {
    university_id: resolvedUniversityId,
    university_name: resolvedUniversityName,
    branch_id: resolvedBranchId,
    branch_name: resolvedBranchName,
  };
}

export function installCatalogStoreGlobals() {
  if (window.__aiiensCatalogStoreInstalled) return;
  window.__aiiensCatalogStoreInstalled = true;
  window.aiiensGetCatalogState = getCatalogState;
  window.aiiensSubscribeCatalog = subscribeCatalog;
  window.aiiensRefreshCatalog = refreshCatalog;
  window.aiiensResolveAcademicSelection = resolveAcademicSelection;
}
