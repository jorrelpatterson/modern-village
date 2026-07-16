-- ═══════════════════════════════════════════════════
-- Admin minimum-necessary (2/3): clinical PHI → super admins only
-- 2026-07-15  (§164.514(d) minimum necessary, §164.308(a)(3)-(4) workforce access)
-- The 20260406 admin_read_all migration lets ANY is_admin account read children's
-- diagnoses, behavior logs, AI conversations, and clinical notes. A marketing /
-- content / sub_admin VA has no clinical need for those. Restrict the ADMIN read
-- path on the clinical tables to admin_role() = 'super'.
--
-- SCOPE / what this does NOT do (tracked for a follow-up that needs admin-panel UI
-- testing): profiles contact-list, community moderation, bookings, invites,
-- child_access, and the operational tables (claims, leads, campaigns, feedback,
-- social) keep their existing any-admin policies. This batch closes the highest-
-- severity gap — non-super admins reading CLINICAL PHI — without risking the parts
-- of admin.html that can only be verified by running it. Depends on the admin_role()
-- helper + backfill (migration 1/3) and is bypassable until admin_role is locked (3/3).
--
-- Only the ADMIN "view all" policies are touched. The owner-scoped paths (a parent
-- reading their own child, a practice member reading their client's child, a provider
-- reading their own notes) are separate policies and are left intact.
-- ═══════════════════════════════════════════════════

DROP POLICY IF EXISTS "Admins view all children" ON public.children;
CREATE POLICY "Admins view all children" ON public.children
  FOR SELECT USING (public.admin_role() = 'super');

DROP POLICY IF EXISTS "Admins view all behavior_logs" ON public.behavior_logs;
CREATE POLICY "Admins view all behavior_logs" ON public.behavior_logs
  FOR SELECT USING (public.admin_role() = 'super');

DROP POLICY IF EXISTS "Admins view all conversations" ON public.conversations;
CREATE POLICY "Admins view all conversations" ON public.conversations
  FOR SELECT USING (public.admin_role() = 'super');

DROP POLICY IF EXISTS "Admins view all session_notes" ON public.session_notes;
CREATE POLICY "Admins view all session_notes" ON public.session_notes
  FOR SELECT USING (public.admin_role() = 'super');

DROP POLICY IF EXISTS "Admins view all care_notes" ON public.care_notes;
CREATE POLICY "Admins view all care_notes" ON public.care_notes
  FOR SELECT USING (public.admin_role() = 'super');

-- Screener leads carry a child's M-CHAT-R score/risk (clinical). Super only for now;
-- a marketing "contact-only" view (email/name/status, no score) is a follow-up.
DROP POLICY IF EXISTS "Admins read screener leads" ON public.screener_leads;
CREATE POLICY "Admins read screener leads" ON public.screener_leads
  FOR SELECT USING (public.admin_role() = 'super');

DROP POLICY IF EXISTS "Admins update screener leads" ON public.screener_leads;
CREATE POLICY "Admins update screener leads" ON public.screener_leads
  FOR UPDATE USING (public.admin_role() = 'super');

-- ═══════════════════════════════════════════════════
-- END migration
-- ═══════════════════════════════════════════════════
