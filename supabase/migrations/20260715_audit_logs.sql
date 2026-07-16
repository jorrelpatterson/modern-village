-- ═══════════════════════════════════════════════════
-- HIPAA §164.312(b) — Audit controls: the phi_audit_log table
-- 2026-07-15
-- Named phi_audit_log (NOT audit_logs) on purpose: a client-side audit_logs table
-- already exists in prod (written best-effort by app.html's auditLog() with columns
-- user_id/action/resource_type/resource_id/details). This is a SEPARATE, dedicated,
-- server-side sink that DB triggers and SECURITY DEFINER RPCs write to — tamper-
-- resistant and not dependent on the client. The two coexist.
--
-- Access model: RLS ENABLED with NO client policies, so anon/authenticated can neither
-- read nor write it directly. Rows are written only by SECURITY DEFINER functions (owned
-- by postgres, which bypasses RLS on its own tables) or the service key. Reads are
-- service-key / dashboard only. This keeps the audit trail itself tamper-resistant.
--
-- Note: audit rows legitimately contain identifiers (e.g. the email a BCBA looked up) —
-- that is the point of an access log. Treat this table with the same backup/retention
-- protections as PHI (6-year retention).
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.phi_audit_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id     uuid,               -- auth.uid() of the actor (null = system/cron)
  action       text NOT NULL,      -- e.g. 'parent_lookup', 'session_note.delete'
  target_table text,               -- table the action touched
  target_id    text,               -- row id (text so it fits uuid or composite keys)
  detail       jsonb,              -- minimal context; may contain identifiers by design
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.phi_audit_log ENABLE ROW LEVEL SECURITY;
-- Intentionally NO policies: clients are fully blocked (RLS on + no policy).
-- Writers are SECURITY DEFINER functions / the service key, both of which bypass RLS.

CREATE INDEX IF NOT EXISTS idx_phi_audit_log_actor  ON public.phi_audit_log(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_phi_audit_log_action ON public.phi_audit_log(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_phi_audit_log_target ON public.phi_audit_log(target_table, target_id);

-- ═══════════════════════════════════════════════════
-- END migration
-- ═══════════════════════════════════════════════════
