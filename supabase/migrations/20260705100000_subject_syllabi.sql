create table if not exists public.subject_syllabus (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  subject_name text not null default '',
  drive_url text not null,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subject_id)
);

create index if not exists idx_subject_syllabus_subject
  on public.subject_syllabus(subject_id);

alter table public.subject_syllabus enable row level security;

drop policy if exists "subject_syllabus_anon_select" on public.subject_syllabus;
drop policy if exists "subject_syllabus_auth_select" on public.subject_syllabus;
drop policy if exists "subject_syllabus_anon_write" on public.subject_syllabus;
drop policy if exists "subject_syllabus_auth_write" on public.subject_syllabus;

create policy "subject_syllabus_anon_select"
  on public.subject_syllabus for select to anon
  using (true);

create policy "subject_syllabus_auth_select"
  on public.subject_syllabus for select to authenticated
  using (true);

create policy "subject_syllabus_anon_write"
  on public.subject_syllabus for all to anon
  using (true)
  with check (true);

create policy "subject_syllabus_auth_write"
  on public.subject_syllabus for all to authenticated
  using (true)
  with check (true);
