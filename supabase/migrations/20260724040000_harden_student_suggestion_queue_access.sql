-- Normalize legacy profile role values so authenticated Admin/Sub Admin users
-- can always read the pending suggestion queue.
create or replace function public.is_url_approver()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and (
        lower(replace(coalesce(role, ''), ' ', '_')) in ('admin', 'subadmin', 'sub_admin')
        or exists (
          select 1
          from jsonb_array_elements_text(coalesce(roles, '[]'::jsonb)) as role_value(value)
          where lower(replace(role_value.value, ' ', '_')) in ('admin', 'subadmin', 'sub_admin')
        )
      )
  );
$$;

-- Keep the queue's required metadata available on older projects that were
-- created before the student suggestion workflow was introduced.
alter table public.student_url_suggestions add column if not exists student_name text;
alter table public.student_url_suggestions add column if not exists subject_name text;
alter table public.student_url_suggestions add column if not exists unit_name text;
alter table public.student_url_suggestions add column if not exists topic_name text;
alter table public.student_url_suggestions add column if not exists title text;
alter table public.student_url_suggestions add column if not exists created_at timestamptz not null default now();

drop policy if exists "url suggestions student read own or approver read all" on public.student_url_suggestions;
create policy "url suggestions student read own or approver read all"
  on public.student_url_suggestions for select to authenticated
  using (student_id = auth.uid() or public.is_url_approver());

-- Ensure a live Admin page receives submitted rows immediately when Realtime
-- is available (the UI also has a polling fallback).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'student_url_suggestions'
    ) then
    alter publication supabase_realtime add table public.student_url_suggestions;
  end if;
end $$;
