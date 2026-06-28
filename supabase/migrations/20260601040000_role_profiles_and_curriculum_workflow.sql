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

create index if not exists idx_role_profiles_id_role on public.role_profiles(id, role);
create index if not exists idx_role_profiles_email_role on public.role_profiles(lower(email), role);

insert into public.role_profiles (
  id, email, role, full_name, name, phone, phone_number, college,
  role_type, qualification, experience, university_id, university_name,
  regulation_id, regulation_code, branch_id, branch_name, year, semester,
  photo_url, onboarding_completed, onboarding_completed_at, created_at, updated_at
)
select
  p.id, p.email, p.role, p.full_name, p.name, p.phone, p.phone_number, p.college,
  p.role_type, p.qualification, p.experience, p.university_id, p.university_name,
  p.regulation_id, p.regulation_code, p.branch_id, p.branch_name, p.year, p.semester,
  p.photo_url, p.onboarding_completed, p.onboarding_completed_at, p.created_at, p.updated_at
from public.profiles p
where p.role in ('student', 'content_creator', 'subadmin', 'admin')
on conflict (id, role) do nothing;

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
  updated_at timestamptz not null default now(),
  unique (curriculum_id, curriculum_unit_id, creator_profile_id)
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

create index if not exists idx_curriculums_status on public.curriculums(status);
create index if not exists idx_curriculum_units_curriculum on public.curriculum_units(curriculum_id, display_order);
create index if not exists idx_curriculum_topics_unit on public.curriculum_topics(curriculum_unit_id, display_order);
create index if not exists idx_curriculum_assignments_creator on public.curriculum_assignments(creator_profile_id, status);
create index if not exists idx_curriculum_content_unit_type on public.curriculum_content_items(curriculum_unit_id, content_type);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_role_profiles_updated_at on public.role_profiles;
create trigger trg_role_profiles_updated_at before update on public.role_profiles
for each row execute function public.set_updated_at();

drop trigger if exists trg_curriculums_updated_at on public.curriculums;
create trigger trg_curriculums_updated_at before update on public.curriculums
for each row execute function public.set_updated_at();

drop trigger if exists trg_curriculum_units_updated_at on public.curriculum_units;
create trigger trg_curriculum_units_updated_at before update on public.curriculum_units
for each row execute function public.set_updated_at();

drop trigger if exists trg_curriculum_assignments_updated_at on public.curriculum_assignments;
create trigger trg_curriculum_assignments_updated_at before update on public.curriculum_assignments
for each row execute function public.set_updated_at();

drop trigger if exists trg_curriculum_content_items_updated_at on public.curriculum_content_items;
create trigger trg_curriculum_content_items_updated_at before update on public.curriculum_content_items
for each row execute function public.set_updated_at();

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

create policy "role profiles own read" on public.role_profiles
for select to authenticated using (id = auth.uid());

create policy "role profiles own write" on public.role_profiles
for all to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "curriculums all read" on public.curriculums for select to anon, authenticated using (true);
create policy "curriculums all write" on public.curriculums for all to anon, authenticated using (true) with check (true);
create policy "curriculum units all" on public.curriculum_units for all to anon, authenticated using (true) with check (true);
create policy "curriculum topics all" on public.curriculum_topics for all to anon, authenticated using (true) with check (true);
create policy "curriculum assignments all" on public.curriculum_assignments for all to anon, authenticated using (true) with check (true);
create policy "curriculum content all" on public.curriculum_content_items for all to anon, authenticated using (true) with check (true);
