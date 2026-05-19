-- ═══════════════════════════════════════════════════
-- Modern Village Starter Library — seed
-- 2026-05-18
-- Placeholder content. Ariana's authored target drop will REPLACE these rows.
-- ═══════════════════════════════════════════════════

INSERT INTO public.curriculum_libraries (id, name, publisher, license_type, version, active)
VALUES (
  '00000000-0000-0000-0000-00000000a000',
  'Modern Village Starter Library',
  'Modern Village',
  'modern_village_authored',
  '0.1-placeholder',
  true
) ON CONFLICT (id) DO NOTHING;

-- 5 placeholder targets across domains. Replace with Ariana's content before launch.
INSERT INTO public.curriculum_targets (
  id, library_id, name, operational_definition, target_type,
  default_data_collection_config, default_mastery_criteria,
  domain, suggested_age_min, suggested_age_max
) VALUES
  (
    '00000000-0000-0000-0000-00000000a001',
    '00000000-0000-0000-0000-00000000a000',
    'Manding for preferred item',
    'When motivation is present (preferred item visible but unavailable), child independently requests the item using 1-3 word vocal mand within 10 seconds.',
    'discrete_trial',
    '{"trials_per_session": 10}'::jsonb,
    '{"response_pct": 80, "consecutive_sessions": 3, "first_trial_independent": true}'::jsonb,
    'communication', 2, 6
  ),
  (
    '00000000-0000-0000-0000-00000000a002',
    '00000000-0000-0000-0000-00000000a000',
    'Brushing teeth — full task analysis',
    'Independently completes all 9 steps of toothbrushing with no prompts from caregiver, ending with rinsing and putting toothbrush back in holder.',
    'task_analysis',
    '{"prompt_levels": ["independent","gestural","verbal","model","partial_physical","full_physical"]}'::jsonb,
    '{"steps_independent_pct": 100, "consecutive_sessions": 2}'::jsonb,
    'adaptive_living', 3, 10
  ),
  (
    '00000000-0000-0000-0000-00000000a003',
    '00000000-0000-0000-0000-00000000a000',
    'Aggression — open-hand hitting toward others',
    'Any instance of open-hand contact with another person''s body with force sufficient to make an audible sound or leave a visible mark. Recorded as frequency count per session.',
    'frequency',
    '{}'::jsonb,
    '{"target_count_per_session": 0, "consecutive_sessions": 5}'::jsonb,
    'replacement_behaviors', 2, 17
  ),
  (
    '00000000-0000-0000-0000-00000000a004',
    '00000000-0000-0000-0000-00000000a000',
    'Tolerating transition between activities',
    'When given a 2-minute warning and a transition cue, child moves to next activity within 30 seconds without protest behavior (vocal protest, dropping to floor, hitting, throwing).',
    'duration',
    '{}'::jsonb,
    '{"max_duration_seconds": 30, "consecutive_trials": 5}'::jsonb,
    'social', 3, 12
  ),
  (
    '00000000-0000-0000-0000-00000000a005',
    '00000000-0000-0000-0000-00000000a000',
    'Parent — using token economy at home',
    'During a 30-minute observation, parent delivers token within 5 seconds of target behavior, with verbal labeling, on at least 80% of opportunities.',
    'interval',
    '{"interval_seconds": 300, "interval_type": "partial"}'::jsonb,
    '{"interval_correct_pct": 80, "consecutive_sessions": 3}'::jsonb,
    'parent_skills', null, null
  )
ON CONFLICT (id) DO NOTHING;

-- Task analysis steps for the toothbrushing target
INSERT INTO public.curriculum_target_steps (curriculum_target_id, sequence, name) VALUES
  ('00000000-0000-0000-0000-00000000a002', 1, 'Pick up toothbrush'),
  ('00000000-0000-0000-0000-00000000a002', 2, 'Wet toothbrush under tap'),
  ('00000000-0000-0000-0000-00000000a002', 3, 'Apply pea-sized toothpaste'),
  ('00000000-0000-0000-0000-00000000a002', 4, 'Brush top teeth (30 sec)'),
  ('00000000-0000-0000-0000-00000000a002', 5, 'Brush bottom teeth (30 sec)'),
  ('00000000-0000-0000-0000-00000000a002', 6, 'Brush tongue (5 sec)'),
  ('00000000-0000-0000-0000-00000000a002', 7, 'Spit into sink'),
  ('00000000-0000-0000-0000-00000000a002', 8, 'Rinse mouth with water'),
  ('00000000-0000-0000-0000-00000000a002', 9, 'Return toothbrush to holder')
ON CONFLICT (curriculum_target_id, sequence) DO NOTHING;
