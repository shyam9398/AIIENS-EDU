-- Opportunities authored by Content Creators and displayed to students after approval.
create table if not exists public.explorer_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) > 0),
  description text not null default '',
  category text not null,
  company_name text not null,
  banner_url text,
  apply_url text not null,
  start_date date,
  end_date date,
  eligibility text,
  location text,
  tags text[] not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  is_published boolean not null default false,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.explorer_posts add column if not exists location text;

-- Normalize installations that used the earlier published/unpublished names.
do $$
declare constraint_name text;
begin
  -- A previous hand-created table may have constrained status to
  -- published/unpublished. Remove only constraints attached to this column
  -- before converting those values to the approval workflow.
  for constraint_name in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    join unnest(c.conkey) key_attnum on true
    join pg_attribute a on a.attrelid = t.oid and a.attnum = key_attnum
    where n.nspname = 'public' and t.relname = 'explorer_posts'
      and c.contype = 'c' and a.attname = 'status'
  loop
    execute format('alter table public.explorer_posts drop constraint %I', constraint_name);
  end loop;
end $$;

update public.explorer_posts set status = 'approved', is_published = true where status = 'published';
update public.explorer_posts set status = 'pending', is_published = false where status = 'unpublished';
alter table public.explorer_posts drop constraint if exists explorer_posts_status_check;
alter table public.explorer_posts add constraint explorer_posts_status_check check (status in ('pending', 'approved', 'rejected'));

create index if not exists idx_explorer_posts_creator_created_at on public.explorer_posts (created_by, created_at desc);
create index if not exists idx_explorer_posts_visible on public.explorer_posts (status, is_published, created_at desc);

alter table public.explorer_posts enable row level security;

drop policy if exists "explorer creators manage own posts" on public.explorer_posts;
create policy "explorer creators manage own posts" on public.explorer_posts for all to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

drop policy if exists "explorer approved posts are readable" on public.explorer_posts;
create policy "explorer approved posts are readable" on public.explorer_posts for select to authenticated
  using (status = 'approved' or is_published = true);

-- Invoked whenever Explorer loads. Posts with no deadline remain untouched.
create or replace function public.cleanup_expired_explorer_posts()
returns void language sql security definer set search_path = public as $$
  delete from public.explorer_posts where end_date is not null and end_date < current_date;
$$;

revoke all on function public.cleanup_expired_explorer_posts() from public;
grant execute on function public.cleanup_expired_explorer_posts() to authenticated;
