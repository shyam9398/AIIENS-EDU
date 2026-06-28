/**
 * Shared catalog API — single entry point for all University/Branch dropdowns.
 */
import {
  fetchActiveBranches,
  fetchActiveBranchNames,
  fetchAllBranches,
} from '../../repositories/branchRepository.js';
import {
  fetchActiveUniversities,
  fetchActiveUniversityNames,
  fetchAllUniversities,
} from '../../repositories/universityRepository.js';

export const getUniversities = fetchActiveUniversities;
export const getBranches = fetchActiveBranches;
export const getBranchesByUniversity = (universityId, options = {}) =>
  fetchActiveBranches({ universityId, ...options });

export {
  fetchActiveUniversities,
  fetchActiveUniversityNames,
  fetchAllUniversities,
  fetchActiveBranches,
  fetchActiveBranchNames,
  fetchAllBranches,
};

export function installCatalogServiceGlobals() {
  if (window.__aiiensCatalogServiceInstalled) return;
  window.__aiiensCatalogServiceInstalled = true;
  window.getUniversities = getUniversities;
  window.getBranches = getBranches;
  window.getBranchesByUniversity = getBranchesByUniversity;
}
