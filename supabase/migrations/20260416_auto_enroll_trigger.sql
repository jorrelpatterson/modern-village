-- ═══════════════════════════════════════════════════
-- Auto-enroll new leads into matching cold sequence
-- 2026-04-16
-- ═══════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.auto_enroll_lead_in_cold_sequence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cohort text;
  v_campaign_id uuid;
BEGIN
  -- Determine cohort from explicit field or lead_type
  v_cohort := COALESCE(NEW.cohort, NEW.lead_type);

  -- Only auto-enroll for cold cohorts
  IF v_cohort NOT IN ('bcba', 'district', 'rc') THEN
    RETURN NEW;
  END IF;

  -- Skip if no email or unsubscribed/bounced
  IF NEW.email IS NULL OR NEW.unsubscribed = true OR NEW.bounced = true THEN
    RETURN NEW;
  END IF;

  -- Find the active campaign for this cohort
  SELECT id INTO v_campaign_id FROM public.campaigns
    WHERE cohort = v_cohort AND status = 'active' AND is_sequence = true
    LIMIT 1;
  IF v_campaign_id IS NULL THEN
    RETURN NEW; -- no active campaign yet, skip silently
  END IF;

  -- Enqueue Day 0 send (idempotent via unique constraint)
  INSERT INTO public.email_send_queue (campaign_id, lead_id, cohort, sequence_step, scheduled_for)
  VALUES (v_campaign_id, NEW.id, v_cohort, 0, now())
  ON CONFLICT (campaign_id, lead_id, sequence_step) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_enroll_lead ON public.leads;
CREATE TRIGGER trg_auto_enroll_lead
  AFTER INSERT ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_enroll_lead_in_cold_sequence();
