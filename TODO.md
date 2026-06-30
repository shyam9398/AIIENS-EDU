# TODO - Critical Bug Fix: openAdminLogin undefined

## Step 0 — Inspect render/runtime path
- [x] Identify where legacy-app.js is injected / loaded in production (legacy runtime injection, bundled index files, dynamic script injection, runLegacyScripts, install* functions)

## Step 1 — Locate openAdminLogin definition
- [x] Search codebase for `function openAdminLogin` and `window.openAdminLogin` assignments
- [x] Confirm which file(s) contain those definitions

## Step 2 — Identify whether openAdminLogin is executed
- [x] Add temporary diagnostics right at definition time:
  - `console.log('[DEBUG] OPEN ADMIN FILE LOADED')`
  - `console.log('[DEBUG] typeof openAdminLogin before expose', typeof openAdminLogin)`

## Step 3 — Ensure global registration is not blocked
- [x] Verify we assign to global reliably:
  - `window.openAdminLogin = openAdminLogin`
  - `globalThis.openAdminLogin = openAdminLogin`
- [x] Add diagnostics right after assignment.

## Step 4 — Detect overwrite / delete later
- [x] Add diagnostics at other handler installations (critical fixes / intro splash / browser navigation) to ensure they do not overwrite window.openAdminLogin

## Step 5 — Runtime exception audit
- [x] Check console for earlier JS exceptions preventing execution before handler registration
- [x] Fix only the minimal cause (no UI/auth/router/db workflow changes)

## Step 6 — Validate all required globals
- [x] Verify in runtime (before any user click):
  - `typeof window.openAdminLogin === 'function'`
  - `typeof window.closeAdminLogin === 'function'`
  - `typeof window.submitAdminLogin === 'function'`
  - `typeof window.toggleAdminDropdown === 'function'`
  - etc.

## Step 7 — Remove temporary logs
- [x] Remove debug logs after confirmation


