-- ══════════════════════════════════════════════════════════════════════════
-- FIX_SUBADMIN_RLS.SQL  —  Run this in your Supabase SQL Editor
-- Fixes: "permission denied for table subjects" for unauthenticated SubAdmins
-- ══════════════════════════════════════════════════════════════════════════

-- Enable write access (INSERT, UPDATE, DELETE) for the unauthenticated 'anon' role.
-- This is necessary because SubAdmins authenticate using a custom table instead
-- of Supabase Auth, meaning their API calls are evaluated under the 'anon' role.

-- 1. subjects
DROP POLICY IF EXISTS "subjects_anon_write" ON public.subjects;
CREATE POLICY "subjects_anon_write"
  ON public.subjects FOR ALL TO anon
  USING (true) WITH CHECK (true);

-- 2. units
DROP POLICY IF EXISTS "units_anon_write" ON public.units;
CREATE POLICY "units_anon_write"
  ON public.units FOR ALL TO anon
  USING (true) WITH CHECK (true);

-- 3. topics
DROP POLICY IF EXISTS "topics_anon_write" ON public.topics;
CREATE POLICY "topics_anon_write"
  ON public.topics FOR ALL TO anon
  USING (true) WITH CHECK (true);

-- 4. topic_videos
DROP POLICY IF EXISTS "topic_videos_anon_write" ON public.topic_videos;
CREATE POLICY "topic_videos_anon_write"
  ON public.topic_videos FOR ALL TO anon
  USING (true) WITH CHECK (true);

-- 5. content_items
DROP POLICY IF EXISTS "content_items_anon_write" ON public.content_items;
CREATE POLICY "content_items_anon_write"
  ON public.content_items FOR ALL TO anon
  USING (true) WITH CHECK (true);

-- 6. Verify applied policies
SELECT
  tablename,
  policyname,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE tablename IN ('subjects','units','topics','topic_videos','content_items')
ORDER BY tablename, policyname;
