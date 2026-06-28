-- Portal auth (admin_accounts / sub_admin_accounts) uses the anon API role.
-- Grant anon SELECT + INSERT + UPDATE + DELETE on academic tables so Admin/SubAdmin
-- CRUD works without Supabase Auth sessions.

-- subjects
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "subjects_anon_all" ON public.subjects;
CREATE POLICY "subjects_anon_all"
  ON public.subjects FOR ALL TO anon
  USING (true) WITH CHECK (true);

-- units
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "units_anon_all" ON public.units;
CREATE POLICY "units_anon_all"
  ON public.units FOR ALL TO anon
  USING (true) WITH CHECK (true);

-- topics
ALTER TABLE public.topics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "topics_anon_all" ON public.topics;
CREATE POLICY "topics_anon_all"
  ON public.topics FOR ALL TO anon
  USING (true) WITH CHECK (true);

-- topic_videos
ALTER TABLE public.topic_videos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "topic_videos_anon_all" ON public.topic_videos;
CREATE POLICY "topic_videos_anon_all"
  ON public.topic_videos FOR ALL TO anon
  USING (true) WITH CHECK (true);

-- content_items
ALTER TABLE public.content_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "content_items_anon_all" ON public.content_items;
CREATE POLICY "content_items_anon_all"
  ON public.content_items FOR ALL TO anon
  USING (true) WITH CHECK (true);

-- universities, regulations, branches (catalog)
ALTER TABLE public.universities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "universities_anon_all" ON public.universities;
CREATE POLICY "universities_anon_all"
  ON public.universities FOR ALL TO anon
  USING (true) WITH CHECK (true);

ALTER TABLE public.regulations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "regulations_anon_all" ON public.regulations;
CREATE POLICY "regulations_anon_all"
  ON public.regulations FOR ALL TO anon
  USING (true) WITH CHECK (true);

ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "branches_anon_all" ON public.branches;
CREATE POLICY "branches_anon_all"
  ON public.branches FOR ALL TO anon
  USING (true) WITH CHECK (true);
