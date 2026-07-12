-- Consolidate all Google-account roles on the one profile row.
alter table public.profiles
  add column if not exists roles jsonb not null default '[]'::jsonb;

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('student', 'content_creator', 'subadmin', 'admin', 'live_workshop'));

update public.profiles
set roles = jsonb_build_array(role)
where coalesce(jsonb_array_length(roles), 0) = 0
  and role in ('student', 'content_creator', 'subadmin', 'admin', 'live_workshop');

alter table public.profiles
  drop constraint if exists profiles_roles_check;

alter table public.profiles
  add constraint profiles_roles_check
  check (
    jsonb_typeof(roles) = 'array'
    and roles <@ '["student", "content_creator", "subadmin", "admin", "live_workshop"]'::jsonb
  );

create index if not exists idx_profiles_roles on public.profiles using gin (roles);

-- Existing installations may have the retired table. Merge its memberships
-- before removing it; fresh installations never create it.
do $$
begin
  if to_regclass('public.role_profiles') is not null then
    execute $merge$
      update public.profiles p
      set roles = (
        select coalesce(jsonb_agg(role), '[]'::jsonb)
        from (
          select value as role
          from jsonb_array_elements_text(coalesce(p.roles, '[]'::jsonb)) as current(value)
          union
          select rp.role
          from public.role_profiles rp
          where rp.id = p.id
        ) merged_roles
      )
    $merge$;
    execute 'drop table public.role_profiles';
  end if;
end $$;

drop policy if exists "profiles insert own" on public.profiles;
drop policy if exists "profiles update own" on public.profiles;

create policy "profiles insert own"
on public.profiles for insert to authenticated
with check (id = auth.uid() and jsonb_typeof(roles) = 'array');

create policy "profiles update own"
on public.profiles for update to authenticated
using (id = auth.uid())
with check (id = auth.uid() and jsonb_typeof(roles) = 'array');
