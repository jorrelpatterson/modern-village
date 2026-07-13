-- ═══════════════════════════════════════════════════
-- BCBA — lock signed SOAP notes against later edits
-- 2026-07-12
-- Backlog #16: "Providers update own notes" had no signed_at guard, so a
-- SOAP note could be edited via the API after it was signed. Signed clinical
-- notes are a legal record and must be immutable once signed.
--
-- The guard lives in USING (which rows you may target), NOT in WITH CHECK
-- (what the new row may look like). This is deliberate:
--   • USING  = auth.uid() = provider_id AND signed_at IS NULL
--       → you can only UPDATE rows that are yours AND currently unsigned;
--         a signed row is invisible to UPDATE, so it cannot be edited.
--   • WITH CHECK = auth.uid() = provider_id
--       → the new row must still be yours, but MAY set signed_at — so the
--         signing action itself (unsigned → signed) still succeeds.
-- If the guard were in WITH CHECK instead, signing (which sets signed_at)
-- would fail its own policy.
-- ═══════════════════════════════════════════════════

DROP POLICY IF EXISTS "Providers update own notes" ON public.session_notes;

CREATE POLICY "Providers update own notes"
  ON public.session_notes FOR UPDATE
  USING (auth.uid() = provider_id AND signed_at IS NULL)
  WITH CHECK (auth.uid() = provider_id);

-- ═══════════════════════════════════════════════════
-- END migration
-- ═══════════════════════════════════════════════════
