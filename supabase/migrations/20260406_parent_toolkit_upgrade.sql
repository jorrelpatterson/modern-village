-- ═══════════════════════════════════════════════════
-- Parent Toolkit Upgrade Migration
-- 2026-04-06
-- ═══════════════════════════════════════════════════

-- 1. FIX community_comments — add missing columns
ALTER TABLE public.community_comments
  ADD COLUMN IF NOT EXISTS author_name text DEFAULT 'Anonymous',
  ADD COLUMN IF NOT EXISTS content text,
  ADD COLUMN IF NOT EXISTS parent_comment_id uuid REFERENCES public.community_comments(id),
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS flagged_words text[];

-- Migrate data from old 'text' column to new 'content' column
UPDATE public.community_comments
  SET content = text
  WHERE content IS NULL AND text IS NOT NULL;

-- Recreate RLS policies for community_comments
DROP POLICY IF EXISTS "Anyone views comments" ON public.community_comments;
DROP POLICY IF EXISTS "Users create own comments" ON public.community_comments;
DROP POLICY IF EXISTS "Users update own comments" ON public.community_comments;

CREATE POLICY "Anyone views comments"
  ON public.community_comments FOR SELECT USING (true);
CREATE POLICY "Users create own comments"
  ON public.community_comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own comments"
  ON public.community_comments FOR UPDATE USING (auth.uid() = user_id);

-- 2. CREATE routines table
CREATE TABLE IF NOT EXISTS public.routines (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  child_id uuid REFERENCES public.children(id) ON DELETE SET NULL,
  title text NOT NULL,
  steps jsonb NOT NULL DEFAULT '[]',
  source text DEFAULT 'manual',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.routines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own routines"
  ON public.routines FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users create own routines"
  ON public.routines FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own routines"
  ON public.routines FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own routines"
  ON public.routines FOR DELETE USING (auth.uid() = user_id);
