-- ═══════════════════════════════════════════════════
-- HIPAA §164.312(b) — Audit controls: the audit_logs table
-- 2026-07-15
-- The schema had NO record of who read or changed PHI (only push/campaign
-- delivery logs existed). This creates the append-only audit sink that
-- SECURITY DEFINER RPCs and (in a later migration) row-level triggers write to.
--
-- Access model: RLS is ENABLED with NO client policies, so the anon/authenticated
-- roles can neither read nor write this table directly. Rows are written only by
-- SECURITY DEFINER functions (owned by postgres, which bypasses RLS on its own
-- tables) or the service key. Reads are service-key / dashboard only. This keeps
-- the audit trail itself tamper-resistant from the client.
--
-- Note: audit rows legitimately contain identifiers (e.g. the email a BCBA looked
-- up) — that is the point of an access log. The table is therefore sensitive and
-- must inherit the same backup/retention protections as PHI (6-year retention).
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id     uuid,               -- auth.uid() of the actor (null = system/cron)
  action       text NOT NULL,      -- e.g. 'parent_lookup', 'session_note.delete'
  target_table text,               -- table the action touched
  target_id    text,               -- row id (text so it fits uuid or composite keys)
  detail       jsonb,              -- minimal context; may contain identifiers by design
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
-- Intentionally NO policies: clients are fully blocked (RLS on + no policy).
-- Writers are SECURITY DEFINER functions / the service key, both of which bypass RLS.

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor  ON public.audit_logs(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON public.audit_logs(target_table, target_id);

-- ═══════════════════════════════════════════════════
-- END migration
-- ═══════════════════════════════════════════════════
