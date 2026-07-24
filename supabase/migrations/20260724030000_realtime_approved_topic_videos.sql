-- Students with an open topic should see a newly approved suggestion without
-- refreshing the page. The client subscribes to INSERT events on this table.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'topic_videos'
    ) then
    alter publication supabase_realtime add table public.topic_videos;
  end if;
end $$;
