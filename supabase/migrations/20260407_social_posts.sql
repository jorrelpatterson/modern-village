-- ═══════════════════════════════════════════════════
-- Social Media Posts Table
-- 2026-04-07
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.social_posts (
  id serial PRIMARY KEY,
  title text NOT NULL,
  audience text NOT NULL DEFAULT 'parent',
  day_number integer NOT NULL,
  caption text,
  post_html text NOT NULL,
  status text DEFAULT 'ready',
  posted_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage social posts"
  ON public.social_posts FOR ALL
  USING (public.is_admin());
