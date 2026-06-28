-- Enable SELECT access for anonymous users to look up admin/subadmin profiles to retrieve the generated email
DROP POLICY IF EXISTS "Allow anon select for admin subadmin profiles" ON public.profiles;
CREATE POLICY "Allow anon select for admin subadmin profiles"
  ON public.profiles FOR SELECT TO anon
  USING (role IN ('admin', 'subadmin'));

-- Allow anonymous users to select from sub_admin_accounts for login lookup
ALTER TABLE public.sub_admin_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon select sub_admin_accounts" ON public.sub_admin_accounts;
CREATE POLICY "Allow anon select sub_admin_accounts"
  ON public.sub_admin_accounts FOR SELECT TO anon
  USING (true);

-- Allow anonymous users to select from admin_accounts for login lookup
ALTER TABLE public.admin_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon select admin_accounts" ON public.admin_accounts;
CREATE POLICY "Allow anon select admin_accounts"
  ON public.admin_accounts FOR SELECT TO anon
  USING (true);
