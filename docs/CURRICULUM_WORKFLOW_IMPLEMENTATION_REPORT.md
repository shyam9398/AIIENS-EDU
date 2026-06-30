# Curriculum Workflow Implementation Report

Date: 2026-06-01

## Scope

Implemented targeted fixes for CRUD page retention, role-scoped Google profiles, separated Curriculum workflow, Creator review submission, status badges, and live workflow counts.

## Modified Areas

- Auth profile service now prefers `role_profiles` keyed by `(id, role)` so the same Google account can have separate Student and Content Creator profiles.
- SubAdmin dashboard live renderer now updates only while the dashboard tab is active, preventing CRUD actions from replacing unit/content pages.
- Curriculum is isolated from Create Subject data with separate tables and a separate SubAdmin UI.
- Content Creator dashboard shows assigned, completed, and pending unit counts from workflow data.
- Content Creator unit page includes `Send For Review`, enabled after Video, Note, PYQ, and Important Question content exist.

## Database

New migration:

- `supabase/migrations/20260601040000_role_profiles_and_curriculum_workflow.sql`

New tables:

- `role_profiles`
- `curriculums`
- `curriculum_units`
- `curriculum_topics`
- `curriculum_assignments`
- `curriculum_content_items`

Schema mirror updated:

- `supabase/schema.sql`

## Services

New service:

- `src/services/curriculum/curriculumWorkflowRepository.js`

Updated services:

- `src/services/auth/profileService.js`
- `src/legacy/installCriticalFixes.js`

## UI

Updated legacy/React shell implementation:

- `src/legacy/legacy-app.js`

Key behavior:

- Create Subject remains the full academic/content structure.
- Curriculum creates blueprint-only Subject, Unit, Topic.
- Creator adds content against curriculum units.
- SubAdmin reviews `Sent To SubAdmin` curriculum and can approve/reject.

## Status Workflow

Supported statuses:

- Draft
- In Progress
- Completed
- Sent To SubAdmin
- Published
- Returned

## Regression Guard

No changes were made to Google OAuth startup, onboarding screens, protected routes, or dashboard navigation internals. Role behavior is isolated in profile lookup/storage and falls back to the existing `profiles` table if the new table is unavailable.
