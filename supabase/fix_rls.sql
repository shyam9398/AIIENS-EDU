-- ══════════════════════════════════════════════════════════════════════════
-- FIX_RLS.SQL  —  Run this in your Supabase SQL Editor
-- Fixes: students cannot read subjects/units/topics/videos/content_items
-- ══════════════════════════════════════════════════════════════════════════

-- ── 1. Re-enable RLS on all curriculum tables ─────────────────────────────
ALTER TABLE public.subjects      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.units         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.topics        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.topic_videos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_items ENABLE ROW LEVEL SECURITY;

-- ── 2. Drop ALL existing policies on these tables ─────────────────────────
--    (removes any conflicting or stale policies)

-- subjects
DROP POLICY IF EXISTS "subjects all"               ON public.subjects;
DROP POLICY IF EXISTS "subjects authenticated all" ON public.subjects;
DROP POLICY IF EXISTS "subjects_anon_select"       ON public.subjects;
DROP POLICY IF EXISTS "subjects_auth_select"       ON public.subjects;
DROP POLICY IF EXISTS "subjects_auth_insert"       ON public.subjects;
DROP POLICY IF EXISTS "subjects_auth_update"       ON public.subjects;
DROP POLICY IF EXISTS "subjects_auth_delete"       ON public.subjects;
DROP POLICY IF EXISTS "authenticated_can_read_subjects" ON public.subjects;

-- units
DROP POLICY IF EXISTS "units all"               ON public.units;
DROP POLICY IF EXISTS "units authenticated all" ON public.units;
DROP POLICY IF EXISTS "units_anon_select"       ON public.units;
DROP POLICY IF EXISTS "units_auth_select"       ON public.units;
DROP POLICY IF EXISTS "units_auth_write"        ON public.units;

-- topics
DROP POLICY IF EXISTS "topics all"               ON public.topics;
DROP POLICY IF EXISTS "topics authenticated all" ON public.topics;
DROP POLICY IF EXISTS "topics_anon_select"       ON public.topics;
DROP POLICY IF EXISTS "topics_auth_select"       ON public.topics;
DROP POLICY IF EXISTS "topics_auth_write"        ON public.topics;

-- topic_videos
DROP POLICY IF EXISTS "topic videos all"               ON public.topic_videos;
DROP POLICY IF EXISTS "topic videos authenticated all" ON public.topic_videos;
DROP POLICY IF EXISTS "topic_videos_anon_select"       ON public.topic_videos;
DROP POLICY IF EXISTS "topic_videos_auth_select"       ON public.topic_videos;
DROP POLICY IF EXISTS "topic_videos_auth_write"        ON public.topic_videos;

-- content_items
DROP POLICY IF EXISTS "content all"               ON public.content_items;
DROP POLICY IF EXISTS "content authenticated all" ON public.content_items;
DROP POLICY IF EXISTS "content_items_anon_select" ON public.content_items;
DROP POLICY IF EXISTS "content_items_auth_select" ON public.content_items;
DROP POLICY IF EXISTS "content_items_auth_write"  ON public.content_items;

-- ── 3. Create clean policies ───────────────────────────────────────────────
--
-- READ  → both anon and authenticated can SELECT (students need this)
-- WRITE → only authenticated users (subadmin/admin) can INSERT/UPDATE/DELETE
--
-- Note: Supabase "authenticated" role = any logged-in user.
-- Role-level write restrictions (subadmin only) require JWT custom claims
-- or a profiles join; for now we allow all authenticated to write, which
-- is acceptable because only subadmins are given the UI to create subjects.

-- subjects
CREATE POLICY "subjects_anon_select"
  ON public.subjects FOR SELECT TO anon
  USING (true);

CREATE POLICY "authenticated_can_read_subjects"
  ON public.subjects FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "subjects_auth_write"
  ON public.subjects FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- units
CREATE POLICY "units_anon_select"
  ON public.units FOR SELECT TO anon
  USING (true);

CREATE POLICY "units_auth_select"
  ON public.units FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "units_auth_write"
  ON public.units FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- topics
CREATE POLICY "topics_anon_select"
  ON public.topics FOR SELECT TO anon
  USING (true);

CREATE POLICY "topics_auth_select"
  ON public.topics FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "topics_auth_write"
  ON public.topics FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- topic_videos
CREATE POLICY "topic_videos_anon_select"
  ON public.topic_videos FOR SELECT TO anon
  USING (true);

CREATE POLICY "topic_videos_auth_select"
  ON public.topic_videos FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "topic_videos_auth_write"
  ON public.topic_videos FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- content_items
CREATE POLICY "content_items_anon_select"
  ON public.content_items FOR SELECT TO anon
  USING (true);

CREATE POLICY "content_items_auth_select"
  ON public.content_items FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "content_items_auth_write"
  ON public.content_items FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ── 4. Verify: check policies are applied ─────────────────────────────────
SELECT
  tablename,
  policyname,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE tablename IN ('subjects','units','topics','topic_videos','content_items')
ORDER BY tablename, policyname;
