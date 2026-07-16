-- ═══════════════════════════════════════════════════
-- HIPAA §164.312(b) — Audit controls: row-change triggers on PHI tables
-- 2026-07-15
-- Writes an audit_logs row for every modification (INSERT/UPDATE/DELETE) of the
-- sensitive clinical tables, capturing actor (auth.uid()), action, table, and row id.
-- Depends on 20260715_audit_logs.sql (the audit_logs sink).
--
-- SCOPE: Postgres cannot trigger on SELECT, so this covers MODIFICATION auditing only.
-- READ auditing (who viewed which record) must be done at the app/worker layer — the
-- parent_lookup RPC already logs there; broader read-audit is a follow-up.
--
-- VOLUME: the highest-frequency tables (trials, behavior_recordings, behavior_logs) are
-- audited on UPDATE/DELETE only — routine appends aren't logged per-row (they'd bloat the
-- sink), but tampering/deletion of clinical data IS. Lower-volume clinical records get
-- full INSERT/UPDATE/DELETE coverage.
--
-- The trigger never blocks the underlying write: an audit-insert failure is downgraded to
-- a WARNING so clinical data capture is never lost to an audit-sink problem.
-- ═══════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.audit_row_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    INSERT INTO public.audit_logs(actor_id, action, target_table, target_id, detail)
    VALUES (
      auth.uid(),
      lower(TG_TABLE_NAME) || '.' || lower(TG_OP),
      TG_TABLE_NAME,
      (to_jsonb(CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END) ->> 'id'),
      NULL
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'audit_row_change failed for %.%: %', TG_TABLE_NAME, TG_OP, SQLERRM;
  END;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

-- Full coverage (INSERT/UPDATE/DELETE) — lower-volume clinical records
DROP TRIGGER IF EXISTS trg_audit_children ON public.children;
CREATE TRIGGER trg_audit_children AFTER INSERT OR UPDATE OR DELETE ON public.children
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

DROP TRIGGER IF EXISTS trg_audit_conversations ON public.conversations;
CREATE TRIGGER trg_audit_conversations AFTER INSERT OR UPDATE OR DELETE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

DROP TRIGGER IF EXISTS trg_audit_session_notes ON public.session_notes;
CREATE TRIGGER trg_audit_session_notes AFTER INSERT OR UPDATE OR DELETE ON public.session_notes
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

DROP TRIGGER IF EXISTS trg_audit_care_notes ON public.care_notes;
CREATE TRIGGER trg_audit_care_notes AFTER INSERT OR UPDATE OR DELETE ON public.care_notes
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

DROP TRIGGER IF EXISTS trg_audit_practice_clients ON public.practice_clients;
CREATE TRIGGER trg_audit_practice_clients AFTER INSERT OR UPDATE OR DELETE ON public.practice_clients
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

-- Modification-only coverage (UPDATE/DELETE) — higher-volume or append-heavy tables
DROP TRIGGER IF EXISTS trg_audit_sessions ON public.sessions;
CREATE TRIGGER trg_audit_sessions AFTER UPDATE OR DELETE ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

DROP TRIGGER IF EXISTS trg_audit_trials ON public.trials;
CREATE TRIGGER trg_audit_trials AFTER UPDATE OR DELETE ON public.trials
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

DROP TRIGGER IF EXISTS trg_audit_behavior_recordings ON public.behavior_recordings;
CREATE TRIGGER trg_audit_behavior_recordings AFTER UPDATE OR DELETE ON public.behavior_recordings
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

DROP TRIGGER IF EXISTS trg_audit_behavior_logs ON public.behavior_logs;
CREATE TRIGGER trg_audit_behavior_logs AFTER UPDATE OR DELETE ON public.behavior_logs
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

-- ═══════════════════════════════════════════════════
-- END migration
-- ═══════════════════════════════════════════════════
