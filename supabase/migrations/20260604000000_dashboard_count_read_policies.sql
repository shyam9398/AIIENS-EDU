create or replace function public.get_dashboard_counts()
returns table (
  students bigint,
  creators bigint,
  subjects bigint,
  regulations bigint
)
language sql
security definer
set search_path = public
as $$
  select
    (select count(*) from public.role_profiles where role = 'student') as students,
    (select count(*) from public.role_profiles where role = 'content_creator') as creators,
    (select count(*) from public.subjects) as subjects,
    (select count(*) from public.regulations) as regulations;
$$;

grant execute on function public.get_dashboard_counts() to anon, authenticated;
