create table if not exists public.student_dashboard_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cgpa numeric(4,2) not null default 0,
  sgpa numeric(4,2) not null default 0,
  syllabus_percentage integer not null default 0,
  weekly_completion integer not null default 0,
  completed_topics integer not null default 0,
  completed_videos integer not null default 0,
  completed_units integer not null default 0,
  completed_subjects integer not null default 0,
  active_subjects integer not null default 0,
  learning_sessions integer not null default 0,
  notes_read integer not null default 0,
  pyqs_completed integer not null default 0,
  current_streak integer not null default 0,
  longest_streak integer not null default 0,
  last_activity_date date,
  first_subject_opened boolean not null default false,
  first_unit_completed boolean not null default false,
  five_units_completed boolean not null default false,
  ten_units_completed boolean not null default false,
  seven_day_streak boolean not null default false,
  thirty_day_streak boolean not null default false,
  hundred_notes_read boolean not null default false,
  subject_milestone boolean not null default false,
  recent_subject_1 text,
  recent_subject_1_id text,
  recent_subject_1_opened timestamptz,
  recent_subject_2 text,
  recent_subject_2_id text,
  recent_subject_2_opened timestamptz,
  recent_subject_3 text,
  recent_subject_3_id text,
  recent_subject_3_opened timestamptz,
  recent_subject_4 text,
  recent_subject_4_id text,
  recent_subject_4_opened timestamptz,
  recent_subject_5 text,
  recent_subject_5_id text,
  recent_subject_5_opened timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create index if not exists idx_student_dashboard_progress_user
  on public.student_dashboard_progress(user_id, updated_at desc);

alter table public.student_dashboard_progress enable row level security;

drop policy if exists "student dashboard progress own read" on public.student_dashboard_progress;
drop policy if exists "student dashboard progress own write" on public.student_dashboard_progress;

create policy "student dashboard progress own read"
  on public.student_dashboard_progress for select to authenticated
  using (user_id = auth.uid());

create policy "student dashboard progress own write"
  on public.student_dashboard_progress for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
