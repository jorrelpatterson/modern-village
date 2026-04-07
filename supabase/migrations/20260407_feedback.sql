-- ═══════════════════════════════════════════════════
-- User Feedback System
-- 2026-04-07
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.user_feedback (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  user_email text,
  user_name text,
  user_role text,
  feedback_type text NOT NULL DEFAULT 'feedback',  -- 'bug', 'improvement', 'feedback', 'question'
  page text,  -- which page/tab they were on
  content text NOT NULL,
  screenshot_url text,
  status text DEFAULT 'new',  -- 'new', 'reviewed', 'in_progress', 'fixed', 'wont_fix', 'duplicate'
  admin_notes text,
  priority text,  -- 'critical', 'high', 'medium', 'low'
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.user_feedback ENABLE ROW LEVEL SECURITY;

-- Users can submit feedback
CREATE POLICY "Users submit feedback"
  ON public.user_feedback FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Users can read their own feedback
CREATE POLICY "Users read own feedback"
  ON public.user_feedback FOR SELECT
  USING (auth.uid() = user_id);

-- Admins manage all feedback
CREATE POLICY "Admins manage feedback"
  ON public.user_feedback FOR ALL
  USING (public.is_admin());

CREATE INDEX IF NOT EXISTS idx_feedback_status ON public.user_feedback(status);
CREATE INDEX IF NOT EXISTS idx_feedback_type ON public.user_feedback(feedback_type);
