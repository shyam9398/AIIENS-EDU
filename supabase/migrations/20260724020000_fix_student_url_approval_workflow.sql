-- One durable workflow for student video URL suggestions.
alter table public.student_url_suggestions add column if not exists title text;

do $$
declare constraint_name text;
begin
  for constraint_name in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    join unnest(c.conkey) key_attnum on true
    join pg_attribute a on a.attrelid = t.oid and a.attnum = key_attnum
    where n.nspname = 'public' and t.relname = 'student_url_suggestions'
      and c.contype = 'c' and a.attname = 'status'
  loop
    execute format('alter table public.student_url_suggestions drop constraint %I', constraint_name);
  end loop;
end $$;

update public.student_url_suggestions
set status = lower(trim(coalesce(status, 'pending')));

update public.student_url_suggestions
set status = 'pending'
where status not in ('pending', 'approved', 'rejected');

update public.student_url_suggestions
set title = coalesce(nullif(trim(title), ''), nullif(trim(topic_name), ''), 'Suggested URL')
where title is null or trim(title) = '';

alter table public.student_url_suggestions
  alter column title set not null,
  alter column status set default 'pending',
  alter column status set not null;

alter table public.student_url_suggestions
  add constraint student_url_suggestions_status_check
  check (status in ('pending', 'approved', 'rejected'));

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
        role in ('admin', 'subadmin')
        or coalesce(roles, '[]'::jsonb) ?| array['admin', 'subadmin']
      )
  );
$$;

alter table public.student_url_suggestions enable row level security;

drop policy if exists "student suggestions read" on public.student_url_suggestions;
drop policy if exists "student suggestions insert own" on public.student_url_suggestions;
drop policy if exists "student suggestions update authenticated" on public.student_url_suggestions;
drop policy if exists "student suggestions anon read" on public.student_url_suggestions;
drop policy if exists "student suggestions anon update" on public.student_url_suggestions;
drop policy if exists "url suggestions student read own or approver read all" on public.student_url_suggestions;
drop policy if exists "url suggestions students insert pending own" on public.student_url_suggestions;
drop policy if exists "url suggestions approver update" on public.student_url_suggestions;
drop policy if exists "url suggestions approver delete" on public.student_url_suggestions;

create policy "url suggestions student read own or approver read all"
  on public.student_url_suggestions for select to authenticated
  using (student_id = auth.uid() or public.is_url_approver());

create policy "url suggestions students insert pending own"
  on public.student_url_suggestions for insert to authenticated
  with check (student_id = auth.uid() and status = 'pending');

create policy "url suggestions approver update"
  on public.student_url_suggestions for update to authenticated
  using (public.is_url_approver())
  with check (public.is_url_approver());

create policy "url suggestions approver delete"
  on public.student_url_suggestions for delete to authenticated
  using (public.is_url_approver());

-- Approval and permanent topic-video storage happen in one transaction. A
-- request cannot be marked approved if its video cannot be stored.
create or replace function public.approve_student_url_suggestion(suggestion_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  suggestion public.student_url_suggestions%rowtype;
  next_order integer;
begin
  if not public.is_url_approver() then
    raise exception 'Only an admin or sub admin can approve URL suggestions';
  end if;

  select * into suggestion
  from public.student_url_suggestions
  where id = suggestion_id
  for update;

  if not found then
    raise exception 'URL suggestion not found';
  end if;
  if suggestion.status <> 'pending' then
    raise exception 'Only pending URL suggestions can be approved';
  end if;

  select coalesce(max(display_order), -1) + 1 into next_order
  from public.topic_videos
  where topic_id = suggestion.topic_id;

  insert into public.topic_videos (topic_id, sub_topic_name, video_url, description, display_order)
  select suggestion.topic_id,
         coalesce(nullif(suggestion.topic_name, ''), suggestion.title, 'Student Suggested Video'),
         suggestion.url,
         coalesce(nullif(suggestion.description, ''), 'Approved student suggestion'),
         next_order
  where not exists (
    select 1 from public.topic_videos
    where topic_id = suggestion.topic_id and video_url = suggestion.url
  );

  update public.student_url_suggestions
  set status = 'approved', approved_by = auth.uid(), approved_at = now()
  where id = suggestion_id;
end;
$$;

revoke all on function public.approve_student_url_suggestion(uuid) from public;
grant execute on function public.approve_student_url_suggestion(uuid) to authenticated;

-- Deliver a new submission to an already-open Admin approval page immediately.
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
