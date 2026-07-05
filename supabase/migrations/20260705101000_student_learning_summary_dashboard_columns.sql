alter table public.student_learning_summaries
  add column if not exists weekly_completion integer not null default 0,
  add column if not exists active_subjects integer not null default 0,
  add column if not exists learning_sessions integer not null default 0;
