-- Workspace assignment columns for SubAdmin isolation (University + Branch + Regulation)
ALTER TABLE public.sub_admin_accounts
  ADD COLUMN IF NOT EXISTS branch text,
  ADD COLUMN IF NOT EXISTS university text,
  ADD COLUMN IF NOT EXISTS regulation text;

COMMENT ON COLUMN public.sub_admin_accounts.branch IS 'Assigned branch workspace for SubAdmin access control';
COMMENT ON COLUMN public.sub_admin_accounts.university IS 'Assigned university workspace for SubAdmin access control';
COMMENT ON COLUMN public.sub_admin_accounts.regulation IS 'Assigned regulation workspace for SubAdmin access control';
