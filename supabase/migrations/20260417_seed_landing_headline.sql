-- ═══════════════════════════════════════════════════
-- Seed: landing_headline slot (the first production slot)
-- 2026-04-17
-- ═══════════════════════════════════════════════════

INSERT INTO public.experiment_slots (id, description, field_type, deploy_mode, reward_metric, challenger_prompt, min_sends_per_variant, confidence_threshold)
VALUES (
  'landing_headline',
  'H1 headline on screener.html — first thing visitors see.',
  'text',
  'auto',
  '{
    "view": 0,
    "click": 1,
    "screener_complete": 5,
    "signup": 20,
    "pro_subscribe": 100
  }'::jsonb,
  'You optimize landing page headlines for Modern Village, an ABA-powered AI coaching platform for neurodivergent families. The visitor is typically a mother in her 30s, exhausted, searching at 11pm for answers about her child. Brand voice: warm, peer-to-peer, empathetic, never clinical. Avoid words like disorder, deficit, abnormal. The winning headline is: "{{winner}}" ({{win_probability}}% confidence over losing variants). Write ONE new challenger headline that tests a different emotional angle but keeps the winner''s warmth and specificity. Max 65 characters. Respond with ONLY the headline text, no quotes, no preamble.',
  50,
  0.90
)
ON CONFLICT (id) DO NOTHING;

-- Three seed variants based on proven hooks from the acquisition funnel doc
INSERT INTO public.experiment_variants (slot_id, variant_key, content, generated_by, status, activated_at)
VALUES
  ('landing_headline', 'a', 'You''re not failing. The system wasn''t built for your child.', 'seed', 'active', now()),
  ('landing_headline', 'b', 'Free autism + ADHD screener — built by a BCBA, for parents', 'seed', 'active', now()),
  ('landing_headline', 'c', '3 strategies that work whether or not your child has a diagnosis', 'seed', 'active', now())
ON CONFLICT (slot_id, variant_key) DO NOTHING;
