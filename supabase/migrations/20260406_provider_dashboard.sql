-- ═══════════════════════════════════════════════════
-- Provider Dashboard Migration
-- 2026-04-06
-- ═══════════════════════════════════════════════════

-- 1. CREATE session_notes table
CREATE TABLE IF NOT EXISTS public.session_notes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  child_id uuid REFERENCES public.children(id) ON DELETE CASCADE NOT NULL,
  session_date date NOT NULL,
  duration_minutes integer NOT NULL,
  cpt_code text,
  session_type text NOT NULL,
  goals_addressed text[],
  interventions text,
  client_response text,
  next_steps text,
  ai_narrative text,
  shared_with_parent boolean DEFAULT true,
  billing_status text DEFAULT 'draft',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.session_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Providers view own notes"
  ON public.session_notes FOR SELECT
  USING (auth.uid() = provider_id);

CREATE POLICY "Providers create notes"
  ON public.session_notes FOR INSERT
  WITH CHECK (auth.uid() = provider_id);

CREATE POLICY "Providers update own notes"
  ON public.session_notes FOR UPDATE
  USING (auth.uid() = provider_id);

CREATE POLICY "Providers delete own notes"
  ON public.session_notes FOR DELETE
  USING (auth.uid() = provider_id);

CREATE POLICY "Parents view shared session notes"
  ON public.session_notes FOR SELECT
  USING (
    shared_with_parent = true
    AND EXISTS (
      SELECT 1 FROM public.child_access ca
      WHERE ca.child_id = session_notes.child_id
      AND ca.user_id = auth.uid()
      AND ca.access_level = 'full'
      AND ca.revoked_at IS NULL
    )
  );
