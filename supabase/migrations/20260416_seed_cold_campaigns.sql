-- ═══════════════════════════════════════════════════
-- Seed cold B2B campaigns (BCBA, District, RC) as drafts
-- 2026-04-16
-- All subjects/bodies are placeholders — edit in admin before activation
-- ═══════════════════════════════════════════════════

DO $$
DECLARE
  v_bcba_steps jsonb;
  v_district_steps jsonb;
  v_rc_steps jsonb;
BEGIN
  -- BCBA: documentation pain → marketplace upside → break-up
  v_bcba_steps := jsonb_build_array(
    jsonb_build_object('step', 0, 'day', 0, 'variants', jsonb_build_array(
      jsonb_build_object('id', 'a', 'subject', '[DRAFT BCBA #1A] Quick question about your documentation workflow', 'body_html', '<p>Hi {NAME}, [DRAFT — edit in admin]</p>'),
      jsonb_build_object('id', 'b', 'subject', '[DRAFT BCBA #1B] How much time do you spend on session notes?', 'body_html', '<p>Hi {NAME}, [DRAFT — edit in admin]</p>')
    )),
    jsonb_build_object('step', 1, 'day', 3, 'variants', jsonb_build_array(
      jsonb_build_object('id', 'a', 'subject', '[DRAFT BCBA #2A] What if 60% of your notes wrote themselves?', 'body_html', '<p>Hi {NAME}, [DRAFT — edit in admin]</p>')
    )),
    jsonb_build_object('step', 2, 'day', 7, 'variants', jsonb_build_array(
      jsonb_build_object('id', 'a', 'subject', '[DRAFT BCBA #3A] AI-generated clinical narrative — 90 sec demo', 'body_html', '<p>Hi {NAME}, [DRAFT — edit in admin]</p>')
    )),
    jsonb_build_object('step', 3, 'day', 10, 'variants', jsonb_build_array(
      jsonb_build_object('id', 'a', 'subject', '[DRAFT BCBA #4A] Superbills + insurance billing in one click', 'body_html', '<p>Hi {NAME}, [DRAFT — edit in admin]</p>')
    )),
    jsonb_build_object('step', 4, 'day', 14, 'variants', jsonb_build_array(
      jsonb_build_object('id', 'a', 'subject', '[DRAFT BCBA #5A] Why Ariana built this (BCBA testimonial)', 'body_html', '<p>Hi {NAME}, [DRAFT — edit in admin]</p>')
    )),
    jsonb_build_object('step', 5, 'day', 21, 'variants', jsonb_build_array(
      jsonb_build_object('id', 'a', 'subject', '[DRAFT BCBA #6A] Earn from the marketplace — set your own rates', 'body_html', '<p>Hi {NAME}, [DRAFT — edit in admin]</p>')
    )),
    jsonb_build_object('step', 6, 'day', 28, 'variants', jsonb_build_array(
      jsonb_build_object('id', 'a', 'subject', '[DRAFT BCBA #7A] Free 30-day Pro trial — no card', 'body_html', '<p>Hi {NAME}, [DRAFT — edit in admin]</p>')
    )),
    jsonb_build_object('step', 7, 'day', 35, 'variants', jsonb_build_array(
      jsonb_build_object('id', 'a', 'subject', '[DRAFT BCBA #8A] Final value drop — 5 strategies you can use today', 'body_html', '<p>Hi {NAME}, [DRAFT — edit in admin]</p>')
    )),
    jsonb_build_object('step', 8, 'day', 45, 'variants', jsonb_build_array(
      jsonb_build_object('id', 'a', 'subject', '[DRAFT BCBA #9A] Closing the loop — should I stop reaching out?', 'body_html', '<p>Hi {NAME}, [DRAFT — edit in admin]</p>')
    ))
  );

  v_district_steps := jsonb_build_array(
    jsonb_build_object('step', 0, 'day', 0, 'variants', jsonb_build_array(
      jsonb_build_object('id', 'a', 'subject', '[DRAFT District #1A] How parent engagement reduces IEP disputes', 'body_html', '<p>Hi {NAME}, [DRAFT — edit in admin]</p>')
    )),
    jsonb_build_object('step', 1, 'day', 3, 'variants', jsonb_build_array(
      jsonb_build_object('id', 'a', 'subject', '[DRAFT District #2A] Parent toolkit for your SpEd families', 'body_html', '<p>Hi {NAME}, [DRAFT — edit in admin]</p>')
    )),
    jsonb_build_object('step', 2, 'day', 7, 'variants', jsonb_build_array(
      jsonb_build_object('id', 'a', 'subject', '[DRAFT District #3A] Pricing breakdown — $3-8 per student per year', 'body_html', '<p>Hi {NAME}, [DRAFT — edit in admin]</p>')
    )),
    jsonb_build_object('step', 3, 'day', 10, 'variants', jsonb_build_array(
      jsonb_build_object('id', 'a', 'subject', '[DRAFT District #4A] Pomona USD case study (in progress)', 'body_html', '<p>Hi {NAME}, [DRAFT — edit in admin]</p>')
    )),
    jsonb_build_object('step', 4, 'day', 14, 'variants', jsonb_build_array(
      jsonb_build_object('id', 'a', 'subject', '[DRAFT District #5A] SELPA fit — does this work for your structure?', 'body_html', '<p>Hi {NAME}, [DRAFT — edit in admin]</p>')
    )),
    jsonb_build_object('step', 5, 'day', 21, 'variants', jsonb_build_array(
      jsonb_build_object('id', 'a', 'subject', '[DRAFT District #6A] 5-min coordinator dashboard demo', 'body_html', '<p>Hi {NAME}, [DRAFT — edit in admin]</p>')
    )),
    jsonb_build_object('step', 6, 'day', 28, 'variants', jsonb_build_array(
      jsonb_build_object('id', 'a', 'subject', '[DRAFT District #7A] Pilot proposal — 3 schools, no upfront cost', 'body_html', '<p>Hi {NAME}, [DRAFT — edit in admin]</p>')
    )),
    jsonb_build_object('step', 7, 'day', 35, 'variants', jsonb_build_array(
      jsonb_build_object('id', 'a', 'subject', '[DRAFT District #8A] Final pitch — what would it take?', 'body_html', '<p>Hi {NAME}, [DRAFT — edit in admin]</p>')
    )),
    jsonb_build_object('step', 8, 'day', 45, 'variants', jsonb_build_array(
      jsonb_build_object('id', 'a', 'subject', '[DRAFT District #9A] Should I stop reaching out?', 'body_html', '<p>Hi {NAME}, [DRAFT — edit in admin]</p>')
    ))
  );

  v_rc_steps := jsonb_build_array(
    jsonb_build_object('step', 0, 'day', 0, 'variants', jsonb_build_array(
      jsonb_build_object('id', 'a', 'subject', '[DRAFT RC #1A] Family Support Services — digital companion', 'body_html', '<p>Hi {NAME}, [DRAFT — edit in admin]</p>')
    )),
    jsonb_build_object('step', 1, 'day', 3, 'variants', jsonb_build_array(
      jsonb_build_object('id', 'a', 'subject', '[DRAFT RC #2A] Caregiver mental health pillar — for your families', 'body_html', '<p>Hi {NAME}, [DRAFT — edit in admin]</p>')
    )),
    jsonb_build_object('step', 2, 'day', 7, 'variants', jsonb_build_array(
      jsonb_build_object('id', 'a', 'subject', '[DRAFT RC #3A] Waitlist relief framing', 'body_html', '<p>Hi {NAME}, [DRAFT — edit in admin]</p>')
    )),
    jsonb_build_object('step', 3, 'day', 10, 'variants', jsonb_build_array(
      jsonb_build_object('id', 'a', 'subject', '[DRAFT RC #4A] Why a BCBA built Modern Village', 'body_html', '<p>Hi {NAME}, [DRAFT — edit in admin]</p>')
    )),
    jsonb_build_object('step', 4, 'day', 14, 'variants', jsonb_build_array(
      jsonb_build_object('id', 'a', 'subject', '[DRAFT RC #5A] 1-on-1 demo offer for your team', 'body_html', '<p>Hi {NAME}, [DRAFT — edit in admin]</p>')
    )),
    jsonb_build_object('step', 5, 'day', 21, 'variants', jsonb_build_array(
      jsonb_build_object('id', 'a', 'subject', '[DRAFT RC #6A] Small pilot proposal — 50 families', 'body_html', '<p>Hi {NAME}, [DRAFT — edit in admin]</p>')
    )),
    jsonb_build_object('step', 6, 'day', 28, 'variants', jsonb_build_array(
      jsonb_build_object('id', 'a', 'subject', '[DRAFT RC #7A] Outcome data sharing approach', 'body_html', '<p>Hi {NAME}, [DRAFT — edit in admin]</p>')
    )),
    jsonb_build_object('step', 7, 'day', 35, 'variants', jsonb_build_array(
      jsonb_build_object('id', 'a', 'subject', '[DRAFT RC #8A] Final pitch — what would help your decision?', 'body_html', '<p>Hi {NAME}, [DRAFT — edit in admin]</p>')
    )),
    jsonb_build_object('step', 8, 'day', 45, 'variants', jsonb_build_array(
      jsonb_build_object('id', 'a', 'subject', '[DRAFT RC #9A] Closing the loop', 'body_html', '<p>Hi {NAME}, [DRAFT — edit in admin]</p>')
    ))
  );

  INSERT INTO public.campaigns (name, subject_a, body_html, status, is_sequence, cohort, subdomain, daily_cap, sequence_steps)
  VALUES
    ('BCBA Cold Sequence', 'placeholder', '<p>placeholder</p>', 'draft', true, 'bcba', 'bcba.outreach.modernvillage.app', 50, v_bcba_steps),
    ('District Cold Sequence', 'placeholder', '<p>placeholder</p>', 'draft', true, 'district', 'district.outreach.modernvillage.app', 50, v_district_steps),
    ('Regional Center Cold Sequence', 'placeholder', '<p>placeholder</p>', 'draft', true, 'rc', 'rc.outreach.modernvillage.app', 50, v_rc_steps);
END $$;
