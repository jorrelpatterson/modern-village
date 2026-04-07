-- ═══════════════════════════════════════════════════
-- Admin VA Roles
-- 2026-04-07
-- ═══════════════════════════════════════════════════

-- Add admin_role to profiles
-- Values: 'super' (full access), 'marketing' (leads, campaigns, social), 
--         'billing' (claims, payers), 'content' (blog, social, community moderation)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS admin_role text DEFAULT 'super';
