-- Students sign in via Google OAuth (authenticated role). Catalog reads must work for authenticated users.
DROP POLICY IF EXISTS "universities_authenticated_read" ON public.universities;
CREATE POLICY "universities_authenticated_read"
  ON public.universities FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "branches_authenticated_read" ON public.branches;
CREATE POLICY "branches_authenticated_read"
  ON public.branches FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "regulations_authenticated_read" ON public.regulations;
CREATE POLICY "regulations_authenticated_read"
  ON public.regulations FOR SELECT TO authenticated
  USING (true);
