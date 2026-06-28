alter table public.content_items
add column if not exists branch text;

alter table public.curriculum_content_items
add column if not exists branch text;

update public.content_items ci
set branch = s.branch
from public.subjects s
where ci.subject_id = s.id
  and ci.branch is null
  and s.branch is not null;

update public.curriculum_content_items cci
set branch = c.branch
from public.curriculums c
where cci.curriculum_id = c.id
  and cci.branch is null
  and c.branch is not null;

create index if not exists idx_content_items_branch on public.content_items(branch);
create index if not exists idx_curriculum_content_items_branch on public.curriculum_content_items(branch);
