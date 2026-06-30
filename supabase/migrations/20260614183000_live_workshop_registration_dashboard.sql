alter table if exists public.live_workshops
  add column if not exists status text not null default 'unpublished';

do $$
begin
  alter table public.live_workshops
    drop constraint if exists live_workshops_status_check;

  update public.live_workshops
  set status = 'unpublished'
  where status is null or status <> 'published';

  alter table public.live_workshops
    add constraint live_workshops_status_check
    check (status in ('unpublished', 'published'));
end $$;

-- Migration logic updated to use status column only

create table if not exists public.live_workshop_banners (
  id uuid primary key default gen_random_uuid(),
  banner_image text not null,
  banner_title text not null,
  banner_subtitle text,
  is_active boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.live_workshop_registrations
  add column if not exists name text,
  add column if not exists mobile_number text,
  add column if not exists role_type text,
  add column if not exists college_name text,
  add column if not exists created_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'live_workshop_registrations_role_type_check'
      and conrelid = 'public.live_workshop_registrations'::regclass
  ) then
    alter table public.live_workshop_registrations
      add constraint live_workshop_registrations_role_type_check
      check (role_type is null or role_type in ('student', 'job_holder', 'other'));
  end if;
end $$;

create index if not exists idx_live_workshops_published
  on public.live_workshops(status, workshop_date, workshop_time);

create index if not exists idx_live_workshop_banners_active
  on public.live_workshop_banners(is_active, created_at desc);

create or replace function public.get_live_workshop_participant_count()
returns integer
language sql
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.live_workshop_registrations;
$$;

grant execute on function public.get_live_workshop_participant_count() to anon, authenticated;

alter table public.live_workshop_banners enable row level security;

drop policy if exists "workshops read published" on public.live_workshops;
create policy "workshops read published"
on public.live_workshops for select to authenticated
using (
  status = 'published'
  or exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.role in ('admin', 'subadmin')
  )
);

drop policy if exists "workshop banners read active" on public.live_workshop_banners;
drop policy if exists "workshop banners admin write" on public.live_workshop_banners;
drop policy if exists "workshop banners anon legacy admin write" on public.live_workshop_banners;

create policy "workshop banners read active"
on public.live_workshop_banners for select to authenticated
using (
  is_active = true
  or exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.role in ('admin', 'subadmin')
  )
);

create policy "workshop banners admin write"
on public.live_workshop_banners for all to authenticated
using (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.role in ('admin', 'subadmin')
  )
)
with check (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.role in ('admin', 'subadmin')
  )
);

create policy "workshop banners anon legacy admin write"
on public.live_workshop_banners for all to anon
using (true)
with check (true);
