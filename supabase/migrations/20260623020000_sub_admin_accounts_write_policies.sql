-- Allow anon INSERT/UPDATE/DELETE on sub_admin_accounts for admin portal CRUD
-- (Admin/SubAdmin authenticate via custom tables, not Supabase Auth)

ALTER TABLE public.sub_admin_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon insert sub_admin_accounts" ON public.sub_admin_accounts;
CREATE POLICY "Allow anon insert sub_admin_accounts"
  ON public.sub_admin_accounts FOR INSERT TO anon
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon update sub_admin_accounts" ON public.sub_admin_accounts;
CREATE POLICY "Allow anon update sub_admin_accounts"
  ON public.sub_admin_accounts FOR UPDATE TO anon
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon delete sub_admin_accounts" ON public.sub_admin_accounts;
CREATE POLICY "Allow anon delete sub_admin_accounts"
  ON public.sub_admin_accounts FOR DELETE TO anon
  USING (true);
