-- ═══════════════════════════════════════════════════
-- Admin minimum-necessary (3/3): lock admin_role against client-side escalation
-- 2026-07-15
-- The role matrix in migration 2/3 is only meaningful if a non-super admin can't
-- simply set their own admin_role to 'super'. The 20260711 protect_admin_flag
-- trigger already blocks client is_admin changes but DEFERRED admin_role, because
-- the admin UI wrote it directly (updateVARole → sb.from('profiles').update).
--
-- PREREQUISITE (shipped alongside this migration): admin.html updateVARole/removeVA
-- now POST to the worker's /admin/set-role (service key). With no client flow left
-- that writes admin_role, we extend the trigger to freeze it for non-service callers.
--
-- Still intentionally NOT locked here (they are written client-side by provider
-- signup / the subscription flow and would break if frozen now): subscription_status,
-- subscription_expires_at, provider_verified, provider_listed, role. Move those into
-- the worker before extending this trigger further.
-- ═══════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.protect_admin_flag()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
begin
  if (new.is_admin is distinct from old.is_admin
      or new.admin_role is distinct from old.admin_role)
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'is_admin / admin_role can only be changed by the server';
  end if;
  return new;
end;
$$;

-- Trigger trg_protect_admin_flag already exists (20260711) and calls this function
-- by name, so CREATE OR REPLACE above is sufficient — no trigger change needed.

-- ═══════════════════════════════════════════════════
-- END migration
-- ═══════════════════════════════════════════════════
