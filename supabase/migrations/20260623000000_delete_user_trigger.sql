-- Trigger to delete auth.users record when a profile is deleted
create or replace function public.handle_profile_deleted()
returns trigger as $$
begin
  delete from auth.users where id = old.id;
  return old;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_profile_deleted on public.profiles;
create trigger trg_profile_deleted
  after delete on public.profiles
  for each row
  execute function public.handle_profile_deleted();
