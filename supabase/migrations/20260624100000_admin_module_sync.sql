-- Admin module sync: notifications, notification_reads, suggestion metadata, content_items feature type

-- ── Notifications ────────────────────────────────────────────────────────────
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message text not null,
  target_role text not null default 'both'
    check (target_role in ('student', 'content_creator', 'both')),
  created_by text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.notification_reads (
  notification_id uuid not null references public.notifications(id) on delete cascade,
  user_key text not null,
  read_at timestamptz not null default now(),
  primary key (notification_id, user_key)
);

create index if not exists idx_notifications_created_at on public.notifications(created_at desc);
create index if not exists idx_notification_reads_user on public.notification_reads(user_key);

alter table public.notifications enable row level security;
alter table public.notification_reads enable row level security;

drop policy if exists "notifications anon all" on public.notifications;
create policy "notifications anon all"
  on public.notifications for all to anon using (true) with check (true);

drop policy if exists "notification_reads anon all" on public.notification_reads;
create policy "notification_reads anon all"
  on public.notification_reads for all to anon using (true) with check (true);

drop policy if exists "notifications auth all" on public.notifications;
create policy "notifications auth all"
  on public.notifications for all to authenticated using (true) with check (true);

drop policy if exists "notification_reads auth all" on public.notification_reads;
create policy "notification_reads auth all"
  on public.notification_reads for all to authenticated using (true) with check (true);

-- Align legacy column name if an older migration used recipient_role
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'notifications' and column_name = 'recipient_role'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'notifications' and column_name = 'target_role'
  ) then
    alter table public.notifications rename column recipient_role to target_role;
  end if;
end $$;

alter table public.notifications add column if not exists is_active boolean not null default true;
alter table public.notifications add column if not exists target_role text;

-- ── University extended columns ──────────────────────────────────────────────
alter table public.universities add column if not exists code text;
alter table public.universities add column if not exists state text;
alter table public.universities add column if not exists updated_at timestamptz not null default now();

-- ── Student URL suggestion metadata ──────────────────────────────────────────
alter table public.student_url_suggestions add column if not exists student_name text;
alter table public.student_url_suggestions add column if not exists subject_name text;
alter table public.student_url_suggestions add column if not exists unit_name text;
alter table public.student_url_suggestions add column if not exists topic_name text;
alter table public.student_url_suggestions add column if not exists branch text;
alter table public.student_url_suggestions add column if not exists university text;
alter table public.student_url_suggestions add column if not exists regulation text;

-- ── Feature registry via content_items ───────────────────────────────────────
alter table public.content_items drop constraint if exists content_items_content_type_check;
alter table public.content_items add constraint content_items_content_type_check
  check (content_type in ('video', 'note', 'pyq', 'iq', 'roadmap', 'feature'));
