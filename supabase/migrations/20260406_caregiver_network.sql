-- ═══════════════════════════════════════════════════
-- Caregiver Network Migration
-- 2026-04-06
-- ═══════════════════════════════════════════════════

-- 1. CREATE care_notes table
CREATE TABLE IF NOT EXISTS public.care_notes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  child_id uuid REFERENCES public.children(id) ON DELETE CASCADE NOT NULL,
  author_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  author_name text NOT NULL DEFAULT 'Anonymous',
  author_role text NOT NULL DEFAULT 'parent',
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.care_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Connected users view notes"
  ON public.care_notes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.child_access ca
      WHERE ca.child_id = care_notes.child_id
      AND ca.user_id = auth.uid()
      AND ca.revoked_at IS NULL
    )
  );

CREATE POLICY "Connected users create notes"
  ON public.care_notes FOR INSERT
  WITH CHECK (
    auth.uid() = author_id
    AND EXISTS (
      SELECT 1 FROM public.child_access ca
      WHERE ca.child_id = care_notes.child_id
      AND ca.user_id = auth.uid()
      AND ca.revoked_at IS NULL
    )
  );

-- 2. CREATE care_note_comments table
CREATE TABLE IF NOT EXISTS public.care_note_comments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  note_id uuid REFERENCES public.care_notes(id) ON DELETE CASCADE NOT NULL,
  author_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  author_name text NOT NULL DEFAULT 'Anonymous',
  author_role text NOT NULL DEFAULT 'parent',
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.care_note_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Connected users view note comments"
  ON public.care_note_comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.care_notes cn
      JOIN public.child_access ca ON ca.child_id = cn.child_id
      WHERE cn.id = care_note_comments.note_id
      AND ca.user_id = auth.uid()
      AND ca.revoked_at IS NULL
    )
  );

CREATE POLICY "Connected users create note comments"
  ON public.care_note_comments FOR INSERT
  WITH CHECK (
    auth.uid() = author_id
    AND EXISTS (
      SELECT 1 FROM public.care_notes cn
      JOIN public.child_access ca ON ca.child_id = cn.child_id
      WHERE cn.id = care_note_comments.note_id
      AND ca.user_id = auth.uid()
      AND ca.revoked_at IS NULL
    )
  );

-- 3. ADD attribution columns to behavior_logs
ALTER TABLE public.behavior_logs
  ADD COLUMN IF NOT EXISTS logged_by uuid,
  ADD COLUMN IF NOT EXISTS logged_by_name text;
