insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'aimeasy-content',
  'aimeasy-content',
  true,
  26214400,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "aimeasy content read" on storage.objects;
drop policy if exists "aimeasy content insert" on storage.objects;
drop policy if exists "aimeasy content update" on storage.objects;
drop policy if exists "aimeasy content delete" on storage.objects;

create policy "aimeasy content read"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'aimeasy-content');

create policy "aimeasy content insert"
on storage.objects for insert
to anon, authenticated
with check (bucket_id = 'aimeasy-content');

create policy "aimeasy content update"
on storage.objects for update
to anon, authenticated
using (bucket_id = 'aimeasy-content')
with check (bucket_id = 'aimeasy-content');

create policy "aimeasy content delete"
on storage.objects for delete
to anon, authenticated
using (bucket_id = 'aimeasy-content');
