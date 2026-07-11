-- 20260711_security_hardening.sql
-- Security hardening from the 2026-07-11 full-app audit.
--
-- ⚠️ REVIEW BEFORE APPLYING. This migration DROPs and recreates existing policies
--    and references helper functions that live in the Supabase dashboard / earlier
--    migrations. Apply it on a branch/staging project first, inside a transaction,
--    and confirm each helper name matches your live schema:
--      SELECT proname FROM pg_proc WHERE proname LIKE '%child_access%' OR proname LIKE '%practice%';
--      SELECT relname, relrowsecurity FROM pg_class WHERE relname IN
--        ('conversations','daily_checkins','bookings','children','behavior_logs',
--         'saved_strategies','profiles','community_posts');
--      SELECT * FROM pg_policies WHERE tablename IN ('child_access','invites','sessions','children');
--
-- Each block is independent — you can apply the SAFE ones now and stage the rest.

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1a. [SAFE / APPLY NOW] Block a user from promoting themselves to admin.
--     Only blocks CHANGING is_admin, only for non-service-role callers. The
--     worker's /admin/create-va uses the service key, so admin creation still
--     works; no normal client flow ever changes is_admin, so nothing breaks.
--     This closes the catastrophic path (self-promote to admin -> read all PHI).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.protect_admin_flag()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_admin is distinct from old.is_admin
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'is_admin can only be changed by the server';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_admin_flag on public.profiles;
create trigger trg_protect_admin_flag
  before update on public.profiles
  for each row execute function public.protect_admin_flag();

-- 1b. [DO NOT APPLY YET — needs app changes first] The same lock SHOULD also cover
--     admin_role, subscription_status, subscription_expires_at, provider_verified,
--     provider_listed, and role — but the app currently writes some of those from
--     the client (provider signup sets role; the subscription flow sets
--     subscription_status; the admin UI changes admin_role). Move those writes into
--     the worker (service key) FIRST, then extend protect_admin_flag() to cover them.
--     Applying the broad lock before that will break provider signup + subscription.

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. [SAFE / ADDITIVE] Give real (non-admin) BCBAs/RBTs a read path to `children`.
--    Without this, every practice query embedding children(...) returns null for
--    a customer BCBA — the roster shows "(unnamed)" and client detail throws.
--    The current is_admin test accounts (Jorrel/Ariana/Mika) mask the outage.
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "Practice members read their clients' children" on public.children;
create policy "Practice members read their clients' children"
  on public.children for select
  using (
    exists (
      select 1 from public.practice_clients pc
      where pc.child_id = children.id
        and public.is_practice_member(pc.practice_id)
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. [VERIFY] child_access self-grant (CRITICAL). The current INSERT policy only
--    checks auth.uid() = granted_by, so any user can grant themselves 'full'
--    access to ANY child (the master key to that family's PHI). Require that the
--    granter already has full access. The auto_grant_parent_access trigger
--    (SECURITY DEFINER) still bootstraps the parent-creates-child case.
--    VERIFY the helper name/signature before applying.
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "Parents grant access" on public.child_access;
create policy "Parents grant access"
  on public.child_access for insert
  with check (
    auth.uid() = granted_by
    and public.user_has_child_access_level(child_id, auth.uid(), array['full'])
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. [VERIFY] invites world-readable (CRITICAL). "Anyone reads invite by token"
--    is FOR SELECT USING (true) with no TO clause → any anon-key caller can read
--    every invite's email, token, and child_id. Replace with owner/invitee scope.
--    NOTE: token-based acceptance by a not-yet-logged-in user should go through a
--    SECURITY DEFINER RPC (accept_invite_by_token) rather than a broad SELECT.
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "Anyone reads invite by token" on public.invites;
drop policy if exists "Invitee or inviter reads invite" on public.invites;
create policy "Invitee or inviter reads invite"
  on public.invites for select
  using (
    invited_by = auth.uid()
    or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. [VERIFY] Pending practice-invite claim escalation. The claim UPDATE only
--    pins user_id in WITH CHECK, so an invitee can set role='owner_bcba',
--    active=true, or repoint practice_id. Pin the mutable fields to their prior
--    values so a claim can only attach the caller's user_id.
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "Pending invitee claims own pending row" on public.practice_members;
create policy "Pending invitee claims own pending row"
  on public.practice_members for update
  using (
    user_id is null
    and lower(pending_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
  with check (
    user_id = auth.uid()
    and active = false
  );
-- (role and practice_id cannot be referenced against OLD in WITH CHECK; the
--  active=false pin plus a worker-side activation step is the safe path. If you
--  prefer, revoke this UPDATE policy entirely and accept invites via the worker
--  service key in /accept-invite instead.)

commit;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. [VERIFY EACH — DO NOT RUN BLIND] Base PHI tables may not have RLS ENABLED.
--    Adding a policy does NOT enable RLS. If any of these are currently disabled,
--    every anon-key caller can read every family's data. FIRST confirm each table
--    already has correct owner-scoped policies (query above), THEN enable RLS —
--    enabling RLS on a table that has NO policy blocks ALL access.
--
--    alter table public.conversations   enable row level security;
--    alter table public.daily_checkins  enable row level security;
--    alter table public.bookings        enable row level security;
--    alter table public.children        enable row level security;
--    alter table public.behavior_logs   enable row level security;
--    alter table public.saved_strategies enable row level security;
--    alter table public.profiles        enable row level security;
--    alter table public.community_posts enable row level security;
--
-- 7. [VERIFY] sessions is FOR ALL USING (is_practice_member(...)), so any member
--    can UPDATE/DELETE any session (forge cosign fields, or DELETE a cosigned
--    session and cascade-delete its trials). Split into member INSERT/UPDATE of
--    own sessions + BCBA-only cosign updates + no DELETE (use a 'cancelled'
--    status). Draft the replacement against your live policy names before running.
-- ─────────────────────────────────────────────────────────────────────────────
