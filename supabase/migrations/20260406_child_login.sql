-- ═══════════════════════════════════════════════════
-- Child/Teen Login Migration
-- 2026-04-06
-- ═══════════════════════════════════════════════════

-- Add login fields to children table
ALTER TABLE public.children
  ADD COLUMN IF NOT EXISTS login_username text UNIQUE,
  ADD COLUMN IF NOT EXISTS login_pin text;

-- Create child_checkins table for mood tracking
CREATE TABLE IF NOT EXISTS public.child_checkins (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  child_id uuid REFERENCES public.children(id) ON DELETE CASCADE NOT NULL,
  mood text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.child_checkins ENABLE ROW LEVEL SECURITY;

-- Children can read/write their own checkins (via parent's child_access)
CREATE POLICY "Connected users view child checkins"
  ON public.child_checkins FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.child_access ca
      WHERE ca.child_id = child_checkins.child_id
      AND ca.user_id = auth.uid()
      AND ca.revoked_at IS NULL
    )
  );

CREATE POLICY "Connected users create child checkins"
  ON public.child_checkins FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.child_access ca
      WHERE ca.child_id = child_checkins.child_id
      AND ca.user_id = auth.uid()
      AND ca.revoked_at IS NULL
    )
  );
