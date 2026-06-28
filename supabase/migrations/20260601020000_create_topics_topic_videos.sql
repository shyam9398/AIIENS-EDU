create table if not exists public.topics (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  unit_id uuid not null references public.units(id) on delete cascade,
  topic_name text not null,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.topic_videos (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.topics(id) on delete cascade,
  sub_topic_name text,
  video_url text not null,
  description text,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.topics add column if not exists topic_name text;
alter table public.topics add column if not exists display_order integer not null default 0;
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
alter table public.topic_videos add column if not exists display_order integer not null default 0;
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

create index if not exists idx_topics_subject_id on public.topics(subject_id);
create index if not exists idx_topics_unit_id on public.topics(unit_id);
create index if not exists idx_topics_unit_order on public.topics(unit_id, display_order);
create index if not exists idx_topic_videos_topic_id on public.topic_videos(topic_id);
create index if not exists idx_topic_videos_topic_order on public.topic_videos(topic_id, display_order);

alter table public.topics enable row level security;
alter table public.topic_videos enable row level security;

drop policy if exists "topics all" on public.topics;
drop policy if exists "topic videos all" on public.topic_videos;
drop policy if exists "topics authenticated all" on public.topics;
drop policy if exists "topic videos authenticated all" on public.topic_videos;

create policy "topics all" on public.topics for all to anon using (true) with check (true);
create policy "topic videos all" on public.topic_videos for all to anon using (true) with check (true);
create policy "topics authenticated all" on public.topics for all to authenticated using (true) with check (true);
create policy "topic videos authenticated all" on public.topic_videos for all to authenticated using (true) with check (true);
