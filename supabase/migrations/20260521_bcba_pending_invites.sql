-- ═══════════════════════════════════════════════════
-- BCBA Data Collection — Pending email invites
-- 2026-05-21
-- Lets BCBAs invite teammates by email before the teammate has
-- a Modern Village account. When the teammate signs up (or signs
-- in with that email), the practice_members row is auto-claimed.
-- ═══════════════════════════════════════════════════

-- Drop NOT NULL on user_id (pending rows have user_id = NULL and pending_email set)
ALTER TABLE public.practice_members
  ALTER COLUMN user_id DROP NOT NULL;

-- New column for pending-email invites
ALTER TABLE public.practice_members
  ADD COLUMN IF NOT EXISTS pending_email text;

-- Replace the old (practice_id, user_id) unique constraint with partial indexes
-- so we can have both: one linked row per user per practice, AND one pending
-- email-only row per email per practice.
ALTER TABLE public.practice_members
  DROP CONSTRAINT IF EXISTS practice_members_practice_id_user_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_practice_members_user_unique
  ON public.practice_members(practice_id, user_id)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_practice_members_pending_unique
  ON public.practice_members(practice_id, lower(pending_email))
  WHERE pending_email IS NOT NULL AND user_id IS NULL;

-- Fast lookup of pending invites by email (used at sign-in to auto-claim)
CREATE INDEX IF NOT EXISTS idx_practice_members_pending_email
  ON public.practice_members(lower(pending_email))
  WHERE pending_email IS NOT NULL AND user_id IS NULL;

-- ─── RLS for pending invitees ────────────────────────

-- Invitee can read their own pending row by matching the JWT email
CREATE POLICY "Pending invitee reads own pending row" ON public.practice_members
  FOR SELECT USING (
    user_id IS NULL
    AND pending_email IS NOT NULL
    AND lower(pending_email) = lower((auth.jwt()->>'email')::text)
  );

-- Invitee can claim their pending row (set user_id = themselves)
CREATE POLICY "Pending invitee claims own pending row" ON public.practice_members
  FOR UPDATE USING (
    user_id IS NULL
    AND pending_email IS NOT NULL
    AND lower(pending_email) = lower((auth.jwt()->>'email')::text)
  )
  WITH CHECK (
    user_id = auth.uid()
  );

-- ═══════════════════════════════════════════════════
-- END migration
-- ═══════════════════════════════════════════════════
