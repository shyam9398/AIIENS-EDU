# Curriculum Workflow Test Report

Date: 2026-06-01

## Automated Verification

Command:

```bash
npm run build
```

Result:

- Passed.
- Vite transformed 115 modules and generated the production bundle.
- Existing bundle-size warning remains.

## Focused Checks

- CRUD page retention: SubAdmin dashboard renderer is guarded so content CRUD refreshes do not replace the current unit/content page.
- Role separation: Student and Content Creator profiles are selected by `(id, role)` in `role_profiles`.
- Curriculum isolation: Curriculum reads/writes `curriculums`, `curriculum_units`, and `curriculum_topics`; it does not read from Create Subject `subjects/units/topics`.
- Creator workflow: Creator content is stored separately in `curriculum_content_items`/local fallback and enables Send For Review only when required content exists.
- Status workflow: Draft, In Progress, Sent To SubAdmin, Published, and Returned paths are represented in UI and service layer.

## Manual Verification Checklist

- Log in as Student with a Google account and complete/open Student dashboard.
- Log in as Content Creator using the same Google account and verify a separate Creator profile/dashboard.
- In SubAdmin, open Create Subject and verify existing subject CRUD still works.
- In SubAdmin, open Curriculum and create a blueprint with Subject, Unit, Topic only.
- In Creator, open assigned curriculum, add Video, Note, PYQ, and Important Question.
- Confirm Send For Review becomes enabled and keeps the user on the same unit page.
- In SubAdmin Curriculum, approve/reject a sent curriculum and verify status badge changes.
- Save/Edit/Delete Notes/PYQs/IQs and confirm the user remains on the current Subject -> Unit -> tab.
