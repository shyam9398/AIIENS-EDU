-- Existing app_state + regulations (keep)
create table if not exists public.app_state (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.app_state enable row level security;

drop policy if exists "Allow anonymous app state reads" on public.app_state;
drop policy if exists "Allow anonymous app state writes" on public.app_state;

create policy "Allow anonymous app state reads"
on public.app_state for select to anon using (true);

create policy "Allow anonymous app state writes"
on public.app_state for all to anon using (true) with check (true);

drop policy if exists "Allow authenticated app state reads" on public.app_state;
drop policy if exists "Allow authenticated app state writes" on public.app_state;

create policy "Allow authenticated app state reads"
on public.app_state for select to authenticated using (true);

create policy "Allow authenticated app state writes"
on public.app_state for all to authenticated using (true) with check (true);

create table if not exists public.regulations (
  id uuid primary key default gen_random_uuid(),
  regulation_name text not null,
  regulation_code text not null,
  university text not null,
  status text not null default 'active',
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.regulations enable row level security;

drop policy if exists "Allow regs reads" on public.regulations;
drop policy if exists "Allow regs writes" on public.regulations;

create policy "Allow regs reads" on public.regulations for select to anon using (true);
create policy "Allow regs writes" on public.regulations for all to anon using (true) with check (true);

create or replace function public.set_regulations_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_regulations_updated_at on public.regulations;
create trigger trg_regulations_updated_at
before update on public.regulations
for each row execute function public.set_regulations_updated_at();

create table if not exists public.universities (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  university_id uuid references public.universities(id) on delete cascade,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  unique (name, university_id)
);

alter table public.universities enable row level security;
alter table public.branches enable row level security;

drop policy if exists "universities read" on public.universities;
drop policy if exists "universities write" on public.universities;
drop policy if exists "branches read" on public.branches;
drop policy if exists "branches write" on public.branches;

create policy "universities read" on public.universities for select to anon using (true);
create policy "universities write" on public.universities for all to anon using (true) with check (true);
create policy "branches read" on public.branches for select to anon using (true);
create policy "branches write" on public.branches for all to anon using (true) with check (true);

-- User profiles (Issues 1, 2)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null check (role in ('student', 'content_creator', 'subadmin', 'admin')),
  full_name text,
  name text,
  phone text,
  phone_number text,
  college text,
  role_type text check (role_type in ('teacher', 'non_teacher')),
  qualification text,
  experience text,
  university_id uuid references public.universities(id),
  university_name text,
  regulation_id uuid references public.regulations(id),
  regulation_code text,
  branch_id uuid references public.branches(id),
  branch_name text,
  year text,
  semester text,
  photo_url text,
  onboarding_completed boolean not null default false,
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
add column if not exists onboarding_completed boolean not null default false;

alter table public.profiles
add column if not exists onboarding_completed_at timestamptz;

alter table public.profiles
add column if not exists full_name text;

alter table public.profiles
add column if not exists phone_number text;

alter table public.profiles
add column if not exists role_type text;

alter table public.profiles
add column if not exists qualification text;

alter table public.profiles
add column if not exists experience text;

alter table public.profiles
drop constraint if exists profiles_role_type_check;

alter table public.profiles
add constraint profiles_role_type_check
check (role_type is null or role_type in ('teacher', 'non_teacher'));

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_id_auth_user_fkey'
  ) then
    alter table public.profiles
    add constraint profiles_id_auth_user_fkey
    foreign key (id) references auth.users(id) on delete cascade not valid;
  end if;
end $$;

do $$
declare
  constraint_name text;
begin
  select conname into constraint_name
  from pg_constraint
  where conrelid = 'public.profiles'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%role%';

  if constraint_name is not null then
    execute format('alter table public.profiles drop constraint %I', constraint_name);
  end if;
end $$;

update public.profiles
set role = 'content_creator'
where role in ('creator', 'teacher');

update public.profiles
set full_name = coalesce(full_name, name)
where full_name is null and name is not null;

update public.profiles
set phone_number = coalesce(phone_number, phone)
where phone_number is null and phone is not null;

delete from public.profiles p
using (
  select ctid
  from (
    select
      ctid,
      row_number() over (partition by email order by created_at asc, id asc) as duplicate_rank
    from public.profiles
    where email is not null
  ) ranked_profiles
  where duplicate_rank > 1
) duplicates
where p.ctid = duplicates.ctid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_email_unique'
  ) then
    alter table public.profiles
    add constraint profiles_email_unique unique (email);
  end if;
end $$;

alter table public.profiles
drop constraint if exists profiles_role_check;

alter table public.profiles
add constraint profiles_role_check
check (role in ('student', 'content_creator', 'subadmin', 'admin'));

alter table public.profiles enable row level security;

drop policy if exists "profiles read" on public.profiles;
drop policy if exists "profiles write" on public.profiles;
drop policy if exists "profiles select own" on public.profiles;
drop policy if exists "profiles insert own" on public.profiles;
drop policy if exists "profiles update own" on public.profiles;

create policy "profiles select own"
on public.profiles for select to authenticated
using (id = auth.uid());

create policy "profiles insert own"
on public.profiles for insert to authenticated
with check (id = auth.uid() and role in ('student', 'content_creator', 'subadmin', 'admin'));

create policy "profiles update own"
on public.profiles for update to authenticated
using (id = auth.uid())
with check (id = auth.uid() and role in ('student', 'content_creator', 'subadmin', 'admin'));

create or replace function public.set_profiles_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_profiles_updated_at();

create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text,
  branch text,
  regulation_code text,
  semester text,
  university_name text,
  created_by text,
  created_at timestamptz not null default now()
);

create table if not exists public.units (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  title text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.content_items (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  unit_id uuid not null references public.units(id) on delete cascade,
  content_type text not null check (content_type in ('video', 'note', 'pyq', 'iq', 'roadmap')),
  title text,
  body text,
  url text,
  metadata jsonb default '{}'::jsonb,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.topics (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  unit_id uuid not null references public.units(id) on delete cascade,
  topic_name text not null,
  display_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.topic_videos (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.topics(id) on delete cascade,
  sub_topic_name text,
  video_url text not null,
  description text,
  display_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.student_topic_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_key text not null,
  unit_key text not null,
  topic_index int not null,
  topic_id uuid references public.topics(id) on delete set null,
  status text not null default 'current' check (status in ('current', 'completed', 'review')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, subject_key, unit_key, topic_index)
);

create table if not exists public.student_url_suggestions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references auth.users(id) on delete set null,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  unit_id uuid not null references public.units(id) on delete cascade,
  topic_id uuid not null references public.topics(id) on delete cascade,
  subject_name text,
  unit_name text,
  topic_name text,
  title text not null,
  url text not null,
  description text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz
);

alter table public.student_url_suggestions
add column if not exists title text;

alter table public.student_url_suggestions
add column if not exists subject_name text;

alter table public.student_url_suggestions
add column if not exists unit_name text;

alter table public.student_url_suggestions
add column if not exists topic_name text;

alter table public.student_url_suggestions
add column if not exists description text;

alter table public.student_url_suggestions
add column if not exists approved_by uuid references auth.users(id) on delete set null;

alter table public.student_url_suggestions
add column if not exists approved_at timestamptz;

alter table public.topics add column if not exists topic_name text;
alter table public.topics add column if not exists display_order int not null default 0;
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'topics' and column_name = 'title'
  ) then
    execute 'update public.topics set topic_name = coalesce(topic_name, title, ''Untitled Topic'') where topic_name is null';
  else
    update public.topics set topic_name = 'Untitled Topic' where topic_name is null;
  end if;
end $$;
alter table public.topics alter column topic_name set not null;

alter table public.topic_videos add column if not exists video_url text;
alter table public.topic_videos add column if not exists sub_topic_name text;
alter table public.topic_videos add column if not exists description text;
alter table public.topic_videos add column if not exists display_order int not null default 0;
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'topic_videos' and column_name = 'url'
  ) then
    execute 'update public.topic_videos set video_url = coalesce(video_url, url, '''') where video_url is null';
  else
    update public.topic_videos set video_url = '' where video_url is null;
  end if;
end $$;
delete from public.topic_videos where video_url = '';
alter table public.topic_videos alter column video_url set not null;

create index if not exists idx_units_subject_id on public.units(subject_id);
create index if not exists idx_content_items_unit_type on public.content_items(unit_id, content_type);
create index if not exists idx_topics_unit_order on public.topics(unit_id, display_order);
create index if not exists idx_topics_subject_unit on public.topics(subject_id, unit_id);
create index if not exists idx_topic_videos_topic_order on public.topic_videos(topic_id, display_order);
create index if not exists idx_student_topic_progress_user on public.student_topic_progress(user_id);
create index if not exists idx_student_topic_progress_unit on public.student_topic_progress(subject_key, unit_key);
create index if not exists idx_student_url_suggestions_status on public.student_url_suggestions(status, created_at);
create index if not exists idx_student_url_suggestions_topic on public.student_url_suggestions(subject_id, unit_id, topic_id, status);

alter table public.subjects      enable row level security;
alter table public.units         enable row level security;
alter table public.content_items enable row level security;
alter table public.topics        enable row level security;
alter table public.topic_videos  enable row level security;
alter table public.student_topic_progress enable row level security;
alter table public.student_url_suggestions enable row level security;

-- subjects
drop policy if exists "subjects all"               on public.subjects;
drop policy if exists "subjects authenticated all" on public.subjects;
drop policy if exists "subjects_anon_select"       on public.subjects;
drop policy if exists "subjects_auth_select"       on public.subjects;
drop policy if exists "subjects_auth_write"        on public.subjects;
drop policy if exists "authenticated_can_read_subjects" on public.subjects;

create policy "subjects_anon_select"
  on public.subjects for select to anon using (true);
create policy "authenticated_can_read_subjects"
  on public.subjects for select to authenticated using (true);
create policy "subjects_auth_write"
  on public.subjects for all to authenticated using (true) with check (true);

-- units
drop policy if exists "units all"               on public.units;
drop policy if exists "units authenticated all" on public.units;
drop policy if exists "units_anon_select"       on public.units;
drop policy if exists "units_auth_select"       on public.units;
drop policy if exists "units_auth_write"        on public.units;

create policy "units_anon_select"
  on public.units for select to anon using (true);
create policy "units_auth_select"
  on public.units for select to authenticated using (true);
create policy "units_auth_write"
  on public.units for all to authenticated using (true) with check (true);

-- topics
drop policy if exists "topics all"               on public.topics;
drop policy if exists "topics authenticated all" on public.topics;
drop policy if exists "topics_anon_select"       on public.topics;
drop policy if exists "topics_auth_select"       on public.topics;
drop policy if exists "topics_auth_write"        on public.topics;

create policy "topics_anon_select"
  on public.topics for select to anon using (true);
create policy "topics_auth_select"
  on public.topics for select to authenticated using (true);
create policy "topics_auth_write"
  on public.topics for all to authenticated using (true) with check (true);

-- topic_videos
drop policy if exists "topic videos all"               on public.topic_videos;
drop policy if exists "topic videos authenticated all" on public.topic_videos;
drop policy if exists "topic_videos_anon_select"       on public.topic_videos;
drop policy if exists "topic_videos_auth_select"       on public.topic_videos;
drop policy if exists "topic_videos_auth_write"        on public.topic_videos;

create policy "topic_videos_anon_select"
  on public.topic_videos for select to anon using (true);
create policy "topic_videos_auth_select"
  on public.topic_videos for select to authenticated using (true);
create policy "topic_videos_auth_write"
  on public.topic_videos for all to authenticated using (true) with check (true);

-- student topic progress
drop policy if exists "student topic progress own read"   on public.student_topic_progress;
drop policy if exists "student topic progress own insert" on public.student_topic_progress;
drop policy if exists "student topic progress own update" on public.student_topic_progress;

create policy "student topic progress own read"
  on public.student_topic_progress for select to authenticated
  using (user_id = auth.uid());
create policy "student topic progress own insert"
  on public.student_topic_progress for insert to authenticated
  with check (user_id = auth.uid());
create policy "student topic progress own update"
on public.student_topic_progress for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "student suggestions read" on public.student_url_suggestions;
drop policy if exists "student suggestions insert own" on public.student_url_suggestions;
drop policy if exists "student suggestions update authenticated" on public.student_url_suggestions;
drop policy if exists "student suggestions anon read" on public.student_url_suggestions;
drop policy if exists "student suggestions anon update" on public.student_url_suggestions;

create policy "student suggestions read"
on public.student_url_suggestions for select to authenticated
using (true);

create policy "student suggestions anon read"
on public.student_url_suggestions for select to anon
using (true);

create policy "student suggestions insert own"
on public.student_url_suggestions for insert to authenticated
with check (student_id = auth.uid());

create policy "student suggestions update authenticated"
on public.student_url_suggestions for update to authenticated
using (true)
with check (true);

create policy "student suggestions anon update"
on public.student_url_suggestions for update to anon
using (true)
with check (true);

-- content_items
drop policy if exists "content all"               on public.content_items;
drop policy if exists "content authenticated all" on public.content_items;
drop policy if exists "content_items_anon_select" on public.content_items;
drop policy if exists "content_items_auth_select" on public.content_items;
drop policy if exists "content_items_auth_write"  on public.content_items;

create policy "content_items_anon_select"
  on public.content_items for select to anon using (true);
create policy "content_items_auth_select"
  on public.content_items for select to authenticated using (true);
create policy "content_items_auth_write"
  on public.content_items for all to authenticated using (true) with check (true);

-- Student dashboard persistence
create table if not exists public.student_recent_subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id text not null,
  subject_name text not null,
  subject_code text,
  subject_icon text,
  branch text,
  regulation text,
  semester text,
  last_opened_at timestamptz not null default now(),
  unique (user_id, subject_id)
);

create table if not exists public.student_cgpa_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  semester_key text,
  sgpa numeric(4,2),
  cgpa numeric(4,2) not null,
  percentage numeric(5,2) not null,
  payload jsonb not null default '{}'::jsonb,
  calculated_at timestamptz not null default now()
);

create table if not exists public.student_learning_summaries (
  user_id uuid primary key references auth.users(id) on delete cascade,
  total_topics integer not null default 0,
  completed_topics integer not null default 0,
  completed_videos integer not null default 0,
  learning_percentage numeric(5,2) not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.student_streaks (
  user_id uuid primary key references auth.users(id) on delete cascade,
  current_streak integer not null default 0,
  best_streak integer not null default 0,
  last_active_date date,
  missed_yesterday boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.live_workshop_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  mobile_number text not null,
  role_type text not null check (role_type in ('student', 'job_holder', 'other')),
  college_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.live_workshops (
  id uuid primary key default gen_random_uuid(),
  workshop_name text not null,
  speaker_name text not null,
  workshop_date date not null,
  workshop_time time not null,
  description text,
  join_link text not null,
  banner_image text,
  status text not null default 'unpublished' check (status in ('unpublished', 'published')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

create table if not exists public.live_workshop_registrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workshop_id uuid references public.live_workshops(id) on delete cascade,
  name text,
  mobile_number text,
  role_type text check (role_type is null or role_type in ('student', 'job_holder', 'other')),
  college_name text,
  created_at timestamptz not null default now(),
  unique (user_id, workshop_id)
);

create index if not exists idx_student_recent_subjects_user on public.student_recent_subjects(user_id, last_opened_at desc);
create index if not exists idx_student_cgpa_results_user on public.student_cgpa_results(user_id, calculated_at desc);
create index if not exists idx_live_workshops_published on public.live_workshops(status, workshop_date, workshop_time);
create index if not exists idx_live_workshop_banners_active on public.live_workshop_banners(is_active, created_at desc);

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

alter table public.student_recent_subjects enable row level security;
alter table public.student_cgpa_results enable row level security;
alter table public.student_learning_summaries enable row level security;
alter table public.student_streaks enable row level security;
alter table public.live_workshop_profiles enable row level security;
alter table public.live_workshops enable row level security;
alter table public.live_workshop_banners enable row level security;
alter table public.live_workshop_registrations enable row level security;

drop policy if exists "student recent own read" on public.student_recent_subjects;
drop policy if exists "student recent own write" on public.student_recent_subjects;
create policy "student recent own read" on public.student_recent_subjects for select to authenticated using (user_id = auth.uid());
create policy "student recent own write" on public.student_recent_subjects for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "student cgpa own read" on public.student_cgpa_results;
drop policy if exists "student cgpa own write" on public.student_cgpa_results;
create policy "student cgpa own read" on public.student_cgpa_results for select to authenticated using (user_id = auth.uid());
create policy "student cgpa own write" on public.student_cgpa_results for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "student summary own read" on public.student_learning_summaries;
drop policy if exists "student summary own write" on public.student_learning_summaries;
create policy "student summary own read" on public.student_learning_summaries for select to authenticated using (user_id = auth.uid());
create policy "student summary own write" on public.student_learning_summaries for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "student streak own read" on public.student_streaks;
drop policy if exists "student streak own write" on public.student_streaks;
create policy "student streak own read" on public.student_streaks for select to authenticated using (user_id = auth.uid());
create policy "student streak own write" on public.student_streaks for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "workshop profiles own read" on public.live_workshop_profiles;
drop policy if exists "workshop profiles own write" on public.live_workshop_profiles;
create policy "workshop profiles own read" on public.live_workshop_profiles for select to authenticated using (user_id = auth.uid());
create policy "workshop profiles own write" on public.live_workshop_profiles for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "workshops read published" on public.live_workshops;
drop policy if exists "workshops admin write" on public.live_workshops;
drop policy if exists "workshops anon legacy admin write" on public.live_workshops;
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
create policy "workshops admin write"
on public.live_workshops for all to authenticated
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
create policy "workshops anon legacy admin write"
on public.live_workshops for all to anon
using (true)
with check (true);

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

drop policy if exists "workshop registrations own read" on public.live_workshop_registrations;
drop policy if exists "workshop registrations own write" on public.live_workshop_registrations;
create policy "workshop registrations own read" on public.live_workshop_registrations for select to authenticated using (user_id = auth.uid());
create policy "workshop registrations own write" on public.live_workshop_registrations for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());



-- Role-scoped profiles + separate curriculum workflow
create table if not exists public.role_profiles (
  id uuid not null references auth.users(id) on delete cascade,
  email text,
  role text not null check (role in ('student', 'content_creator', 'subadmin', 'admin')),
  full_name text,
  name text,
  phone text,
  phone_number text,
  college text,
  role_type text check (role_type is null or role_type in ('teacher', 'non_teacher')),
  qualification text,
  experience text,
  university_id uuid references public.universities(id),
  university_name text,
  regulation_id uuid references public.regulations(id),
  regulation_code text,
  branch_id uuid references public.branches(id),
  branch_name text,
  year text,
  semester text,
  photo_url text,
  onboarding_completed boolean not null default false,
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, role)
);

create table if not exists public.curriculums (
  id uuid primary key default gen_random_uuid(),
  subject_name text not null,
  subject_code text,
  branch text,
  regulation_code text,
  semester text,
  university_name text,
  status text not null default 'Draft' check (status in ('Draft', 'In Progress', 'Completed', 'Sent To SubAdmin', 'Published', 'Returned')),
  created_by uuid,
  assigned_creator uuid,
  review_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.curriculum_units (
  id uuid primary key default gen_random_uuid(),
  curriculum_id uuid not null references public.curriculums(id) on delete cascade,
  unit_name text not null,
  display_order int not null default 0,
  status text not null default 'Draft' check (status in ('Draft', 'In Progress', 'Completed', 'Sent To SubAdmin', 'Published', 'Returned')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.curriculum_topics (
  id uuid primary key default gen_random_uuid(),
  curriculum_unit_id uuid not null references public.curriculum_units(id) on delete cascade,
  topic_name text not null,
  display_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.curriculum_assignments (
  id uuid primary key default gen_random_uuid(),
  curriculum_id uuid not null references public.curriculums(id) on delete cascade,
  curriculum_unit_id uuid references public.curriculum_units(id) on delete cascade,
  creator_profile_id uuid,
  status text not null default 'Draft' check (status in ('Draft', 'In Progress', 'Completed', 'Sent To SubAdmin', 'Published', 'Returned')),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.curriculum_content_items (
  id uuid primary key default gen_random_uuid(),
  curriculum_id uuid not null references public.curriculums(id) on delete cascade,
  curriculum_unit_id uuid references public.curriculum_units(id) on delete cascade,
  curriculum_topic_id uuid references public.curriculum_topics(id) on delete set null,
  content_type text not null check (content_type in ('video', 'note', 'pyq', 'iq', 'other')),
  title text,
  body text,
  url text,
  description text,
  metadata jsonb default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_role_profiles_id_role on public.role_profiles(id, role);
create index if not exists idx_curriculums_status on public.curriculums(status);
create index if not exists idx_curriculum_units_curriculum on public.curriculum_units(curriculum_id, display_order);
create index if not exists idx_curriculum_topics_unit on public.curriculum_topics(curriculum_unit_id, display_order);
create index if not exists idx_curriculum_assignments_creator on public.curriculum_assignments(creator_profile_id, status);
create index if not exists idx_curriculum_content_unit_type on public.curriculum_content_items(curriculum_unit_id, content_type);

alter table public.role_profiles enable row level security;
alter table public.curriculums enable row level security;
alter table public.curriculum_units enable row level security;
alter table public.curriculum_topics enable row level security;
alter table public.curriculum_assignments enable row level security;
alter table public.curriculum_content_items enable row level security;

drop policy if exists "role profiles own read" on public.role_profiles;
drop policy if exists "role profiles own write" on public.role_profiles;
drop policy if exists "curriculums all read" on public.curriculums;
drop policy if exists "curriculums all write" on public.curriculums;
drop policy if exists "curriculum units all" on public.curriculum_units;
drop policy if exists "curriculum topics all" on public.curriculum_topics;
drop policy if exists "curriculum assignments all" on public.curriculum_assignments;
drop policy if exists "curriculum content all" on public.curriculum_content_items;

create policy "role profiles own read" on public.role_profiles for select to authenticated using (id = auth.uid());
create policy "role profiles own write" on public.role_profiles for all to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "curriculums all read" on public.curriculums for select to anon, authenticated using (true);
create policy "curriculums all write" on public.curriculums for all to anon, authenticated using (true) with check (true);
create policy "curriculum units all" on public.curriculum_units for all to anon, authenticated using (true) with check (true);
create policy "curriculum topics all" on public.curriculum_topics for all to anon, authenticated using (true) with check (true);
create policy "curriculum assignments all" on public.curriculum_assignments for all to anon, authenticated using (true) with check (true);
create policy "curriculum content all" on public.curriculum_content_items for all to anon, authenticated using (true) with check (true);

-- Seed minimal catalog if empty (run once in SQL editor)
-- insert into universities (name) values ('JNTUK') on conflict do nothing;
