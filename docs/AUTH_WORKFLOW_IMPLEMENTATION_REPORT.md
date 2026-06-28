# Authentication Workflow Implementation Report

## Root Causes

- OAuth callback completion could run repeatedly from navigation hooks, load handlers, recovery timers, and multiple auth listeners.
- Legacy startup and navigation hooks also performed repeated remote state hydration, extending loading time.
- The PKCE authorization code remained in the URL after exchange, allowing later handlers to retry an already-consumed code.
- Creator login reused student onboarding assumptions and did not persist creator-specific fields.
- Existing profiles were fetched by multiple callers without a shared request cache.
- `app_state` RLS allowed `anon` access but not `authenticated` access, causing signed-in users to receive 403 errors.
- The profiles migration did not contain all required creator fields or an enforced email uniqueness migration.

## Authentication Fixes

- Centralized post-auth routing through `routeAfterAuth()` and `syncSessionFromSupabase()`.
- Added `authService.js` as the single implementation for Google OAuth start, PKCE exchange, and session request deduplication.
- Kept one runtime Supabase auth-state listener in `AuthProvider`.
- Added in-flight guards for OAuth start, callback exchange, and session synchronization.
- Removed the recovery polling loop and redundant legacy auth subscriptions.
- Clear the consumed PKCE code from the URL immediately after a successful exchange.
- Cache profile fetches by authenticated user ID and create a missing profile with an idempotent upsert.
- Persist the selected student or content creator portal in `sessionStorage` before OAuth redirect.
- Force both public role cards through the shared Google auth screen so stale local storage cannot bypass centralized routing.
- Clear stale admin and subadmin state when Student or Content Creator is selected, and again before opening the Student dashboard.

## Onboarding And Roles

- Valid dashboard roles remain `student`, `content_creator`, `subadmin`, and `admin`.
- Removed the public `/teacher` route and changed the active landing selection to `content_creator`.
- Student onboarding requires personal details followed by academic details.
- Student personal details require full name, college name, and phone number.
- Student academic details require university, regulation, branch, year, and semester.
- Semester options are filtered after the student selects a year.
- Content creator onboarding requires personal details and role type.
- Teacher-type content creators must also provide qualification and experience.
- Returning users route from the persisted `onboarding_completed` value and skip completed onboarding.

## Database Migration

Run `supabase/schema.sql` in the Supabase SQL editor. It now:

- Adds `phone_number`, `role_type`, `qualification`, and `experience`.
- Migrates legacy `phone` values into `phone_number`.
- Migrates legacy `teacher` and `creator` roles into `content_creator`.
- Adds `profiles_id_auth_user_fkey` referencing `auth.users(id)`.
- Removes duplicate profile emails before adding `profiles_email_unique`.
- Keeps the valid role check idempotent across repeated migration runs.

## RLS Changes

- Added authenticated read and write policies for `app_state`.
- Kept profile access scoped to `auth.uid()` for authenticated users.
- Profile inserts and updates only allow student and content creator self-service roles.

## Performance Improvements

- Deduplicated profile reads with a promise cache.
- Deduplicated callback exchange and session routing with in-flight promises.
- Removed polling-based OAuth recovery and duplicate listener-driven redirects.
- Removed repeated PKCE callback processing after URL cleanup.
- Removed periodic and navigation-triggered remote state hydration.
- Added a 1.5-second ceiling for initial legacy state hydration so the shell can render promptly during a slow backend response.

## Verification

- `npm run build` passes.
- `git diff --check` passes.
- `npm run check:supabase` passes: Supabase is reachable, `app_state` is accessible, and required profile columns exist.

## Deployment Note

The connectivity check does not apply migrations. Execute `supabase/schema.sql` in the target Supabase project before validating authenticated RLS and creator profile persistence in production.
