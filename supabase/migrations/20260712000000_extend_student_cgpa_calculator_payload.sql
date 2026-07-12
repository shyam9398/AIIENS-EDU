-- Reuse the existing student_cgpa table for the full calculator state.
-- No replacement calculator table is created.
alter table public.student_cgpa
  add column if not exists semester_key text,
  add column if not exists sgpa numeric(4,2),
  add column if not exists percentage numeric(5,2),
  add column if not exists payload jsonb not null default '{}'::jsonb,
  add column if not exists calculated_at timestamptz not null default now();

-- Preserve existing rows that used the original semester column.
update public.student_cgpa
set semester_key = coalesce(semester_key, semester)
where semester_key is null and semester is not null;

create index if not exists idx_student_cgpa_user_calculated
  on public.student_cgpa(student_id, calculated_at desc);

alter table public.student_cgpa enable row level security;

drop policy if exists "student cgpa own read" on public.student_cgpa;
drop policy if exists "student cgpa own write" on public.student_cgpa;
create policy "student cgpa own read" on public.student_cgpa
  for select to authenticated using (student_id = auth.uid());
create policy "student cgpa own write" on public.student_cgpa
  for all to authenticated using (student_id = auth.uid()) with check (student_id = auth.uid());
