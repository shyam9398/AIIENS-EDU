create table if not exists public.student_topic_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_key text not null,
  unit_key text not null,
  topic_index int not null,
  topic_id uuid references public.topics(id) on delete set null,
  status text not null default 'current' check (status in ('current', 'completed', 'review')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, subject_key, unit_key, topic_index)
);

create index if not exists idx_student_topic_progress_user
  on public.student_topic_progress(user_id);

create index if not exists idx_student_topic_progress_unit
  on public.student_topic_progress(subject_key, unit_key);

alter table public.student_topic_progress enable row level security;

drop policy if exists "student topic progress own read" on public.student_topic_progress;
drop policy if exists "student topic progress own insert" on public.student_topic_progress;
drop policy if exists "student topic progress own update" on public.student_topic_progress;

create policy "student topic progress own read"
  on public.student_topic_progress for select to authenticated
  using (user_id = auth.uid());

create policy "student topic progress own insert"
  on public.student_topic_progress for insert to authenticated
  with check (user_id = auth.uid());

create policy "student topic progress own update"
  on public.student_topic_progress for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
