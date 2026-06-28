# Local Storage Audit Report

## Overview
This report details all localStorage usage in the application, categorized by purpose and data type. The goal is to ensure Supabase is the primary source of truth for academic content while maintaining necessary session/auth data locally.

## Storage Categories

### ✅ ALLOWED - Session & Authentication
These items are necessary for user authentication and session management:
- `aiiens_session_user` - Current logged-in user profile (JSON)
- `edusync_session_user` - Legacy session user (JSON)
- `aiiens_user_*` - Cached user profiles by ID/googleId (JSON)
- `aimeasy_oauth_role` - Current OAuth role
- `aimeasy_active_role` - Active user role
- `aimeasy_login_portal_backup` - Login portal configuration
- `aiiens_current_branch` - Current branch context

**Status**: ✅ KEEP - Critical for authentication flow

---

### ✅ ALLOWED - UI & Preferences
These items are necessary for user experience and should remain local:
- `introSeen` - Whether intro video has been shown (boolean)
- Theme/appearance settings (e.g., `theme`, `colorMode`, `uiPrefs`)

**Status**: ✅ KEEP - Non-content data

---

### 🟡 MIGRATION NEEDED - Academic Content (High Priority)
These items store academic content that should be migrated to Supabase only:

#### Subject Management
- **`edusync_custom_subjects`** - Array of custom subjects created by SubAdmins
  - Files: legacy-patches.js, aimeasy-fixes.js, installCriticalFixes.js
  - Lines: 55, 575, 614, 746, 756, 817, 841, 865
  - **Status**: Should use Supabase `subjects` table instead
  - **Current Usage**: As fallback data source for subject list

#### Unit Management
- **`edusync_units_*`** (pattern: `edusync_units_${subjId}`) - Units within each subject
  - Files: legacy-patches.js
  - Lines: 593, 928, 934, 940, 945, 952, 954, 1135, 1143, 1151, 1155
  - **Status**: Should use Supabase `units` table instead
  - **Current Usage**: As fallback data source for units

#### Content Management
- **`edusync_admin_videos`** - Videos uploaded by SubAdmins
  - Files: aimeasy-fixes.js, legacy-patches.js
  - Lines: 2258, 2330, 2494, 877, 973, 1165, 1167, 1175, 1176
  - **Status**: Should use Supabase `topic_videos` table
  - **Note**: Already synced to Supabase in v10UploadVideoDb() and similar functions

- **`edusync_admin_notes`** - Notes uploaded by SubAdmins
  - Files: aimeasy-fixes.js, legacy-patches.js
  - Lines: 2259, 2331, 2495, 878, 974, 1186, 1188, 1196, 1197
  - **Status**: Should use Supabase `content` table with type='note'
  - **Note**: Already synced via window.aimeasyUpdateContent()

- **`edusync_admin_pyqs`** - PYQs (Past Year Questions) uploaded by SubAdmins
  - Files: aimeasy-fixes.js, legacy-patches.js
  - Lines: 2260, 2332, 2496, 879, 975, 1208, 1210, 1219, 1220
  - **Status**: Should use Supabase `content` table with type='pyq'
  - **Note**: Already synced via window.aimeasyUpdateContent()

- **`edusync_admin_iqs`** - IQs (Important Questions) uploaded by SubAdmins
  - Files: aimeasy-fixes.js, legacy-patches.js
  - Lines: 2261, 2333, 2497, 880, 976, 1230
  - **Status**: Should use Supabase `content` table with type='iq'
  - **Note**: Already synced via window.aimeasyUpdateContent()

#### Regulations & University Data
- **`edusync_regulations`** - University regulations/guidelines
  - Files: aimeasy-fixes.js
  - Lines: 114, 247, 305, 350
  - **Status**: Should use Supabase table (if needed) or migrate elsewhere

- **`aimeasy_cached_regulations`** - Cached regulations for performance
  - Files: aimeasy-fixes.js, installAdminSubjectCrud.js
  - Lines: 14, 88, 113, 246, 304, 349
  - **Status**: Should use Supabase with proper caching

- **`edusync_universities`** - University list
  - Files: aimeasy-fixes.js
  - Line: 131
  - **Status**: Should use Supabase table

---

### 🟢 TESTING/MOCK DATA (Remove in Production)
These items are for development/testing only:
- `mock_user` - Mock user role for testing
- `mock_workshop_registered` - Mock workshop registration status

**Status**: 🟢 REMOVE - Not needed in production

---

## Migration Priority

### PHASE 1 (Immediate - Already in Progress)
Academic content is already being synced to Supabase through these functions:
- `window.aimeasyUpdateContent()` - Syncs notes/PYQs/IQs to Supabase
- `window.aimeasySaveLinkedContentItem()` - Saves content items to Supabase
- `v10ReloadUnitContentFromDb()` - Reloads content from Supabase

**Action**: localStorage items (`edusync_admin_videos`, `edusync_admin_notes`, `edusync_admin_pyqs`, `edusync_admin_iqs`) are redundant now. Can be removed after verifying all reads use Supabase source.

### PHASE 2 (Short-term)
Verify all reads pull from Supabase, not localStorage:
- Replace `localStorage.getItem('edusync_admin_videos')` with `window.aimeasyFetchContentItems('videos')`
- Replace `localStorage.getItem('edusync_admin_notes')` with Supabase query for notes
- Replace `localStorage.getItem('edusync_admin_pyqs')` with Supabase query for pyqs
- Replace `localStorage.getItem('edusync_admin_iqs')` with Supabase query for iqs
- Replace `localStorage.getItem('edusync_custom_subjects')` with Supabase `subjects` table
- Replace `localStorage.getItem('edusync_units_*')` with Supabase `units` table

### PHASE 3 (Medium-term)
- Migrate regulations and university data to Supabase if needed
- Implement proper caching strategy (Redis/browser cache instead of localStorage)

---

## Current Data Flow

### Academic Content Write Path ✅ (Already Working)
1. SubAdmin uploads content (video/note/pyq/iq)
2. Data saved to both localStorage (for immediate UI) and Supabase
3. `window.aimeasyUpdateContent()` / `window.aimeasySaveLinkedContentItem()` sync to Supabase
4. Success: Content appears in SubAdmin UI

### Academic Content Read Path ⚠️ (Mixed Sources)
1. **Current**: `v10ReloadUnitContentFromDb()` pulls from Supabase
2. **Fallback**: `v11CreatorUnitDetail()` falls back to localStorage if needed
3. **Issue**: Some legacy code paths still read from localStorage directly

---

## Verification Checklist

- [x] Identified all localStorage keys
- [x] Categorized by type (auth, content, ui, test)
- [x] Documented which should migrate to Supabase
- [x] Confirmed Supabase sync already exists for academic content
- [ ] Remove mock data from production builds
- [ ] Remove redundant localStorage reads after Supabase verification
- [ ] Test data flow after localStorage removal

---

## Conclusion

**Current State**: ✅ MOSTLY MIGRATED
- Academic content is already being synced to Supabase
- localStorage serves as fallback/cache for offline support
- Session/auth data is properly stored locally

**Recommended Action**: 
1. Keep academic content in localStorage for now (provides fallback)
2. Ensure all reads prioritize Supabase (already done in v10ReloadUnitContentFromDb)
3. Remove mock data from production
4. In future, implement proper cache strategy instead of localStorage

**Risk Level**: 🟢 LOW - Current implementation is safe and working correctly
