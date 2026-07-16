-- ═══════════════════════════════════════════════════
-- HIPAA §164.312(c)(1) — Integrity of signed clinical records
-- 2026-07-15
-- Two gaps let a member destroy or reopen locked clinical records:
--
--  (A) session_notes DELETE had NO signed_at guard. The 20260712 UPDATE lock made
--      signed notes un-editable, but a provider could still DELETE a signed SOAP
--      note outright (delete-and-recreate bypass) — and claims.session_note_id is
--      ON DELETE CASCADE, so the linked claim vanished with it.
--
--  (B) sessions used a single blanket "Provider writes own sessions" FOR ALL policy.
--      Any practice member (incl. an RBT) could therefore UPDATE any session —
--      forge cosigner_id/cosigned_at, or flip status 'cosigned' -> 'completed' to
--      REOPEN a locked session (defeating the 20260714 cosigned-insert lock, which
--      only checks the session's *current* status) — or DELETE a cosigned session
--      and cascade-delete all its trials/behavior_recordings.
--
-- Fixes:
--   • session_notes: DELETE only when the note is unsigned.
--   • sessions: replace FOR ALL with verb-scoped policies so a cosigned session is
--     immutable (USING excludes it from UPDATE), only BCBA-level members may perform
--     the cosign transition (WITH CHECK), and only BCBA-level members may DELETE a
--     not-yet-cosigned session.
--
-- The `OR is_admin()` bypass is kept for parity with every other BCBA-tier policy;
-- constraining admin god-mode over signed records is handled holistically in the
-- forthcoming admin-role (minimum-necessary) migration, not here.
-- ═══════════════════════════════════════════════════

-- ── (A) session_notes: block DELETE of signed notes ──
DROP POLICY IF EXISTS "Providers delete own notes" ON public.session_notes;
CREATE POLICY "Providers delete own notes"
  ON public.session_notes FOR DELETE
  USING (auth.uid() = provider_id AND signed_at IS NULL);

-- ── (B) sessions: split the blanket FOR ALL into verb-scoped policies ──
DROP POLICY IF EXISTS "Provider writes own sessions" ON public.sessions;

-- INSERT: any active member of the client's practice may open a session.
CREATE POLICY "Members insert sessions" ON public.sessions
  FOR INSERT WITH CHECK (
    public.is_practice_member((SELECT practice_id FROM public.practice_clients WHERE id = practice_client_id))
    OR public.is_admin()
  );

-- UPDATE: only non-cosigned sessions are targetable (USING) — a cosigned session is
-- immutable. The cosign transition (new status = 'cosigned') requires BCBA-level (WITH CHECK).
CREATE POLICY "Members update non-cosigned sessions" ON public.sessions
  FOR UPDATE
  USING (
    (
      public.is_practice_member((SELECT practice_id FROM public.practice_clients WHERE id = practice_client_id))
      AND status IS DISTINCT FROM 'cosigned'
    )
    OR public.is_admin()
  )
  WITH CHECK (
    (
      public.is_practice_member((SELECT practice_id FROM public.practice_clients WHERE id = practice_client_id))
      AND (
        status IS DISTINCT FROM 'cosigned'
        OR public.is_practice_bcba((SELECT practice_id FROM public.practice_clients WHERE id = practice_client_id))
      )
    )
    OR public.is_admin()
  );

-- DELETE: BCBA-level only, and never a cosigned (locked) session.
CREATE POLICY "BCBAs delete non-cosigned sessions" ON public.sessions
  FOR DELETE
  USING (
    (
      public.is_practice_bcba((SELECT practice_id FROM public.practice_clients WHERE id = practice_client_id))
      AND status IS DISTINCT FROM 'cosigned'
    )
    OR public.is_admin()
  );

-- ═══════════════════════════════════════════════════
-- END migration
-- ═══════════════════════════════════════════════════
