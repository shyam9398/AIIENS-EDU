/**
 * Dynamic university & branch loading — Supabase repositories only.
 */
import { hydrateAllAcademicDropdowns, hydrateProfileAcademicDropdowns } from '../services/academic/academicCatalog.js';
import { installCatalogStoreGlobals, refreshCatalog, subscribeCatalog } from '../services/academic/academicCatalogStore.js';
import { installCatalogServiceGlobals } from '../services/academic/academicCatalogService.js';
import { fetchRegulationsCatalog } from '../services/academic/catalogFetch.js';
import {
  bindBranchCascade,
  branchOptionsHtml,
  fetchActiveBranchNames,
  fetchActiveBranches,
  hydrateAllBranchDropdowns,
} from '../repositories/branchRepository.js';
import {
  fetchActiveUniversities,
  fetchActiveUniversityNames,
  hydrateAllUniversityDropdowns,
} from '../repositories/universityRepository.js';

async function preloadRuntimeBranches(universityName = null) {
  const rows = await fetchActiveBranches({ universityName, includeGlobalBranches: true });
  window.__aiiensRuntimeBranchNames = rows.map((row) => row.name);
  window.__aiiensCatalogBranches = rows;
  return window.__aiiensRuntimeBranchNames;
}

async function preloadRuntimeUniversities() {
  const rows = await fetchActiveUniversities();
  window.__aiiensRuntimeUniversityNames = rows.map((row) => row.name);
  window.__aiiensCatalogUniversities = rows;
  return window.__aiiensRuntimeUniversityNames;
}

export async function refreshAllCatalogDropdowns(root = document) {
  await refreshCatalog();
  const universities = await preloadRuntimeUniversities();
  const branches = await preloadRuntimeBranches(null);
  await hydrateAllAcademicDropdowns(root);
  console.info('[catalog-sync] refreshed dropdowns', {
    universities: universities.length,
    branches: branches.length,
  });
  return { universities: universities.length, branches: branches.length };
}

function profileHydrationContext() {
  const user = window.APP?.user || {};
  return {
    savedUniversity: user.university_name || user.university,
    savedBranch: user.branch_name || user.branch,
    savedRegulation: user.regulation_code || user.regulation,
    universityId: user.university_id,
    branchId: user.branch_id,
  };
}

function refreshProfileAcademicDropdowns(root = document) {
  return hydrateProfileAcademicDropdowns(root, profileHydrationContext());
}

function patchNavigationPreload() {
  const wrap = (name, getUniversityName) => {
    const original = window[name];
    if (typeof original !== 'function' || original.__catalogPreloadPatched) return;
    window[name] = function catalogPreloadWrapper(...args) {
      const result = original.apply(this, args);
      window.setTimeout(async () => {
        await preloadRuntimeUniversities();
        await preloadRuntimeBranches(getUniversityName?.() || null);
        await refreshAllCatalogDropdowns(document);
      }, 0);
      return result;
    };
    window[name].__catalogPreloadPatched = true;
  };

  wrap('switchAdminSection', () => window._v10AdminFilter?.uni || null);
  wrap('switchSASection', () => {
    const sa = window.APP?.subAdminData || {};
    return window._saSubjectFilter?.uni || sa.university || null;
  });
  wrap('switchCRSection', () => window._crFilter?.uni || null);
  wrap('v10AdminSubjects', () => window._v10AdminFilter?.uni || null);
  wrap('renderAdminDashboard', () => window._v10AdminFilter?.uni || null);
  wrap('renderSASection', () => {
    const sa = window.APP?.subAdminData || {};
    return window._saSubjectFilter?.uni || sa.university || null;
  });
  wrap('renderCRChoosing', () => window._crFilter?.uni || null);

  const origShowScreen = window.showScreen;
  if (typeof origShowScreen === 'function' && !origShowScreen.__catalogPreloadPatched) {
    window.showScreen = function showScreenWithCatalog(id, role) {
      const result = origShowScreen.call(this, id, role);
      if (id === 'screen-profile' || id === 'screen-setting-up-profile') {
        window.setTimeout(() => refreshProfileAcademicDropdowns(document), 0);
      }
      return result;
    };
    window.showScreen.__catalogPreloadPatched = true;
  }

  const origOpenCreate = window.openCreateSubAdminModal;
  if (typeof origOpenCreate === 'function' && !origOpenCreate.__catalogPreloadPatched) {
    window.openCreateSubAdminModal = async function openCreateSubAdminModalWithCatalog(...args) {
      await refreshAllCatalogDropdowns(document);
      return origOpenCreate.apply(this, args);
    };
    window.openCreateSubAdminModal.__catalogPreloadPatched = true;
  }
}

export function installDynamicBranches() {
  if (window.__aiiensDynamicBranchesInstalled) return;
  window.__aiiensDynamicBranchesInstalled = true;

  installCatalogStoreGlobals();
  installCatalogServiceGlobals();

  window.aiiensFetchActiveBranches = fetchActiveBranches;
  window.aiiensFetchActiveBranchNames = fetchActiveBranchNames;
  window.aiiensFetchActiveUniversities = fetchActiveUniversities;
  window.aiiensBranchOptionsHtml = branchOptionsHtml;
  window.aiiensPreloadRuntimeBranches = preloadRuntimeBranches;
  window.aiiensPreloadRuntimeUniversities = preloadRuntimeUniversities;
  window.aiiensHydrateAllBranchDropdowns = hydrateAllBranchDropdowns;
  window.aiiensHydrateAllUniversityDropdowns = hydrateAllUniversityDropdowns;
  window.aiiensBindBranchCascade = bindBranchCascade;
  window.aiiensRefreshAllCatalogDropdowns = refreshAllCatalogDropdowns;
  window.aiiensHydrateStudentAcademicDetails = refreshProfileAcademicDropdowns;
  window.aiiensFetchRegulationsCatalog = fetchRegulationsCatalog;

  subscribeCatalog(() => {
    window.setTimeout(() => {
      if (document.getElementById('screen-profile')?.classList.contains('active')) {
        refreshProfileAcademicDropdowns(document);
      }
      window.aiiensHydrateAllUniversityDropdowns?.(document);
      window.aiiensHydrateAllBranchDropdowns?.(document);
    }, 0);
  });

  const origUpdateUniversityDropdowns = window.aiiensUpdateUniversityDropdowns;
  window.aiiensUpdateUniversityDropdowns = async function aiiensUpdateUniversityDropdownsWithCatalog(root = document) {
    if (origUpdateUniversityDropdowns) {
      await origUpdateUniversityDropdowns(root);
    } else {
      await hydrateAllUniversityDropdowns(root);
    }
    await hydrateAllBranchDropdowns(root);
  };
  window.aimeasyUpdateUniversityDropdowns = window.aiiensUpdateUniversityDropdowns;

  patchNavigationPreload();

  window.setTimeout(() => refreshAllCatalogDropdowns(document), 0);
}
