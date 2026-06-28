# Storage Migration Audit

## Summary

This audit identifies legacy storage usage, current Supabase persistence, and the exact migration surface for moving business data off browser `localStorage`/`sessionStorage` and into Supabase.

## Key Findings

- Legacy app heavily uses `localStorage` for business-critical data, including subjects, units, admin content, progress, CGPA, sub-admins, requests, roadmap state, and skill courses.
- Existing Supabase schema already supports:
  - `subjects`
  - `units`
  - `topics`
  - `topic_videos`
  - `content_items`
  - `universities`
  - `branches`
  - `regulations`
  - `profiles`
- The current backend bridge in `src/services/backend/legacyStorageBridge.js` syncs all `edusync_*` keys into `app_state` as a generic key/value store scoped by user ID.
- That bridge is a compatibility shim, not a full structured migration to the requested Supabase tables.
- The requested tables are partially missing from schema: `notifications`, `student_cgpa`, `student_progress`, `student_bookmarks`, `admin_accounts`, `sub_admin_accounts`.

## Legacy Storage Keys by Classification

### UI Preference / Temporary Client State (keep in localStorage/sessionStorage)

- `edusync_roadmap_open` — roadmap sidebar collapsed/expanded state
- `aimeasy:intro_suppressed_for_auth` — intro suppression per tab
- `aimeasy_login_portal` / `aimeasy_login_portal_backup` — login portal selection backup
- `edusync_session_user` — legacy session compatibility shim for old UI, not business source of truth
- `aimeasy_cached_regulations` — local cache only

### Business Data / Academic Data (must migrate to Supabase)

- `edusync_custom_subjects` — custom subjects data
- `edusync_units_<subjectId>` — custom units per subject
- `edusync_roadmaps` — roadmap topics and student video URLs
- `edusync_admin_videos` — admin uploaded video content
- `edusync_admin_notes` — admin uploaded notes content
- `edusync_admin_pyqs` — admin uploaded previous-year questions
- `edusync_admin_iqs` — admin uploaded important questions
- `edusync_dynamic_feature_content` — dynamic feature content authored for units
- `edusync_features` / `edusync_disabled_features` — feature list configuration
- `edusync_completed_topics` — completed topic tracking / progress
- `edusync_cgpa_data` — student CGPA data
- `edusync_skills` — skill course metadata
- `edusync_skill_videos` — skill course videos
- `edusync_skill_notes` — skill course notes
- `edusync_subadmins` — subadmin user accounts
- `edusync_url_requests` — admin/creator URL requests or notifications
- `edusync_regulations` — cached regulation catalog
- `edusync_universities` — cached universities catalog

## Exact File Impact

### Storage bridge and backend sync

- `src/services/backend/legacyStorageBridge.js`
  - Installs patch on `Storage.prototype.setItem` / `removeItem`
  - Syncs all `edusync_*` keys to Supabase `app_state`
- `src/services/backend/appState.js`
  - Loads user-scoped `app_state` rows
  - Saves/removes scoped keys with `key:userId`

### Legacy app storage usage

- `src/legacy/legacy-app.js`
  - Largest consumer of `edusync_*` keys and `sessionStorage`
  - Reads/writes business data and UI state across many features
- `src/legacy/aimeasy-fixes.js`
  - Uses `edusync_*` keys for admin content, subadmins, regulations, universities, and session user
- `src/legacy/installAdminSubjectCrud.js`
  - Manages custom subjects, units, and related cleanup in legacy UI
- `src/legacy/legacy-patches.js`
  - Patches legacy navigation and content tab behavior
  - Reads/writes `edusync_*` keys for admin content, custom subjects, units, and roadmap data
- `src/legacy/installBrowserNavigation.js`
  - Uses sessionStorage for intro suppression and navigation state
- `src/legacy/installCriticalFixes.js`
  - Maintains compatibility with legacy session user storage

### Modern Supabase repository code

- `src/services/curriculum/curriculumRepository.js`
  - Implements subject/unit/topic/topic_video CRUD in Supabase
  - Can be reused to migrate roadmap data and custom subject/unit state
- `src/services/content/contentRepository.js`
  - Implements `content_items` CRUD for videos/notes/pyqs/iqs/roadmap
  - Can be reused for admin content and dynamic unit content
- `src/services/academic/academicCatalog.js`
  - Reads `universities` and related data from Supabase
- `src/services/search/studentSearch.js`
  - Still reads `edusync_custom_subjects` from localStorage and needs migration
- `src/services/auth/postAuthRouter.js`
  - Reads/writes `edusync_session_user` for legacy compatibility
- `src/services/auth/authService.js` and `src/services/auth/profileService.js`
  - Manage login portal/session UI state

## Mapping from Legacy Keys to Supabase Tables

| Legacy Key | Current Usage | Suggested Target | Notes |
| --- | --- | --- | --- |
| `edusync_custom_subjects` | custom subject list | `subjects` | map subject metadata to `subjects` rows
| `edusync_units_<subjectId>` | subject-specific unit records | `units` | create `units` per `subject_id`; preserve order in `sort_order`
| `edusync_roadmaps` | roadmap topics/videos | `topics`, `topic_videos` | use `saveUnitRoadmap`/`fetchUnitRoadmap`
| `edusync_admin_videos` | admin video content | `content_items` (video) | use `createContentItem`
| `edusync_admin_notes` | admin notes content | `content_items` (note) | use `createContentItem`
| `edusync_admin_pyqs` | admin PYQ content | `content_items` (pyq) | use `createContentItem`
| `edusync_admin_iqs` | admin IQ content | `content_items` (iq) | use `createContentItem`
| `edusync_dynamic_feature_content` | dynamic unit content | `content_items` (other/metadata) | preserve feature slug in metadata
| `edusync_features` | dynamic feature list | `app_state` / new config table | if not structural, can remain as app state or migrate to config table
| `edusync_disabled_features` | disabled feature list | `app_state` / new config table | same as above
| `edusync_completed_topics` | topic completion tracking | `student_progress` | recommended new table by user requirement
| `edusync_cgpa_data` | CGPA data | `student_cgpa` | recommended new table by user requirement
| `edusync_skills` | skills metadata | `content_items` or new `skills` table | missing schema support now
| `edusync_skill_videos` | skill videos | `content_items` or new skill tables | missing schema support now
| `edusync_skill_notes` | skill notes | `content_items` or new skill tables | missing schema support now
| `edusync_subadmins` | subadmin account list | `profiles` (role=subadmin) or `sub_admin_accounts` | user account data should be centralized in Supabase auth/profiles
| `edusync_url_requests` | request notifications | `notifications` | recommended new table by user requirement
| `edusync_regulations` | regulations catalog | `regulations` | already exists in schema
| `edusync_universities` | university catalog | `universities` | already exists in schema
| `edusync_session_user` | legacy user session | legacy compat only | keep as local legacy shim if needed, not source of truth
| `edusync_roadmap_open` | sidebar open/close state | local UI preference | keep localStorage
| `aimeasy_cached_regulations` | cached reg data | local UI cache | keep local/cache only
| `aimeasy_login_portal` | login portal selection | local UI preference | keep local/session storage

## Missing Supabase Tables Needed

The current `supabase/schema.sql` is missing these user-requested tables:

- `notifications`
- `student_cgpa`
- `student_progress`
- `student_bookmarks`
- `admin_accounts` (or use `profiles` / auth users)
- `sub_admin_accounts` (or use `profiles` / auth users)

## Recommended Migration Strategy

1. Keep `localStorage` only for UI state and temporary cache:
   - sidebar open state
   - login portal selection
   - intro suppression
   - legacy compatibility shim (`edusync_session_user`)
2. Remove automatic generic `edusync_*` sync to `app_state` once structured tables are in place.
3. Migrate data from localStorage into Supabase via targeted repository functions:
   - `curriculumRepository.ensureSubject` / `ensureUnit`
   - `curriculumRepository.saveUnitRoadmap`
   - `contentRepository.createContentItem`
4. Add missing schema tables for progress/bookmarks/notifications/CGPA and use them as single source of truth.
5. Update legacy modules to read from Supabase-backed APIs instead of `localStorage`:
   - `src/legacy/legacy-app.js`
   - `src/legacy/aimeasy-fixes.js`
   - `src/legacy/installAdminSubjectCrud.js`
   - `src/legacy/legacy-patches.js`
   - `src/services/search/studentSearch.js`
   - `src/services/auth/postAuthRouter.js`
6. Preserve compatibility for legacy UI by introducing a migration layer that hydates localStorage from Supabase on auth, then removes legacy reads/writes progressively.

## Immediate Risks

- `app_state` sync currently masks but does not eliminate legacy business data storage.
- `edusync_*` keys are still used directly in many legacy modules; a full migration requires code replacement across multiple files.
- Schema gaps exist for requested business entities, so full compliance requires adding tables before complete migration.

## Next Implementation Steps

1. Extend `supabase/schema.sql` with `student_cgpa`, `student_progress`, `student_bookmarks`, `notifications`, and optional skill/subadmin tables.
2. Build migration services for legacy key groups:
   - subject/unit/roadmap
   - admin content
   - student progress / CGPA
   - subadmins / requests
3. Replace `localStorage` read/write in legacy code with Supabase service calls.
4. Keep `edusync_roadmap_open` and other purely UI state keys local only.
5. Remove `legacyStorageBridge` once migration is complete or narrow it to only config keys still in transition.

---

## Files Changed / Reviewed

- `src/services/backend/legacyStorageBridge.js`
- `src/services/backend/appState.js`
- `src/legacy/legacy-app.js`
- `src/legacy/aimeasy-fixes.js`
- `src/legacy/installAdminSubjectCrud.js`
- `src/legacy/legacy-patches.js`
- `src/legacy/installBrowserNavigation.js`
- `src/legacy/installCriticalFixes.js`
- `src/services/curriculum/curriculumRepository.js`
- `src/services/content/contentRepository.js`
- `src/services/search/studentSearch.js`
- `src/services/auth/postAuthRouter.js`
- `supabase/schema.sql`
