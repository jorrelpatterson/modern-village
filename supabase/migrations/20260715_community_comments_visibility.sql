-- ═══════════════════════════════════════════════════
-- HIPAA §164.514(d) — Restrict community_comments reads to authenticated users
-- 2026-07-15
-- The 20260406 parent-toolkit migration set community_comments SELECT to USING(true),
-- so ANY anon-key caller could read every comment. A live anon-key probe on 2026-07-15
-- confirmed comment rows were readable unauthenticated. Parents' comments routinely
-- describe their child's behavior/health, so anonymous readability is a disclosure.
--
-- Community is a logged-in feature; scope reads to authenticated users (matches how the
-- feed is presented). A later tightening could further limit visibility to comments on
-- approved/visible posts.
-- ═══════════════════════════════════════════════════

ALTER TABLE public.community_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone views comments" ON public.community_comments;
DROP POLICY IF EXISTS "Authenticated users view comments" ON public.community_comments;
CREATE POLICY "Authenticated users view comments"
  ON public.community_comments FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- ═══════════════════════════════════════════════════
-- END migration
-- ═══════════════════════════════════════════════════
