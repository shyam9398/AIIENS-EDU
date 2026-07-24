-- student_cgpa_results is an existing, single-record-per-user calculator
-- table. Its payload and RLS intentionally use only its deployed columns.
alter table public.student_cgpa_results enable row level security;

drop policy if exists "student cgpa results own read" on public.student_cgpa_results;
drop policy if exists "student cgpa results own write" on public.student_cgpa_results;
create policy "student cgpa results own read" on public.student_cgpa_results
  for select to authenticated using (user_id = auth.uid());
create policy "student cgpa results own write" on public.student_cgpa_results
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
