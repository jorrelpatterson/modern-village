-- ═══════════════════════════════════════════════════
-- Seed Test Data for All 4 Test Accounts
-- 2026-04-07
-- ═══════════════════════════════════════════════════
-- Run AFTER test accounts exist and medical billing migration is done.
-- Safe to re-run (cleans old test data first).

DO $$
DECLARE
  v_parent_id uuid;
  v_provider_id uuid;
  v_caregiver_id uuid;
  v_teacher_id uuid;
  v_child1_id uuid; -- Maya (parent kid 1)
  v_child2_id uuid; -- Elijah (parent kid 2)
  v_child3_id uuid; -- Aiden (provider client)
  v_child4_id uuid; -- Sophia (provider client)
  v_child5_id uuid; -- Jayden (provider client)
  v_sn1 uuid; v_sn2 uuid; v_sn3 uuid; v_sn4 uuid; v_sn5 uuid;
  v_sn6 uuid; v_sn7 uuid; v_sn8 uuid; v_sn9 uuid; v_sn10 uuid;
  v_sn11 uuid; v_sn12 uuid;
  v_payer1_id uuid;
  v_payer2_id uuid;
BEGIN

-- Get test account IDs
SELECT id INTO v_parent_id FROM public.profiles WHERE email = 'testparent@modernvillage.app';
SELECT id INTO v_provider_id FROM public.profiles WHERE email = 'testprovider@modernvillage.app';
SELECT id INTO v_caregiver_id FROM public.profiles WHERE email = 'testcaregiver@modernvillage.app';
SELECT id INTO v_teacher_id FROM public.profiles WHERE email = 'testteacher@modernvillage.app';

IF v_parent_id IS NULL THEN RAISE EXCEPTION 'Test parent not found'; END IF;
IF v_provider_id IS NULL THEN RAISE EXCEPTION 'Test provider not found'; END IF;
IF v_caregiver_id IS NULL THEN RAISE EXCEPTION 'Test caregiver not found'; END IF;
IF v_teacher_id IS NULL THEN RAISE EXCEPTION 'Test teacher not found'; END IF;

-- ─── Clean old test data (safe re-run) ───
DELETE FROM public.claims WHERE provider_id = v_provider_id;
DELETE FROM public.payer_enrollments WHERE provider_id = v_provider_id;
DELETE FROM public.session_notes WHERE provider_id = v_provider_id;
DELETE FROM public.care_notes WHERE author_id IN (v_parent_id, v_provider_id, v_caregiver_id, v_teacher_id);
DELETE FROM public.behavior_logs WHERE user_id IN (v_parent_id, v_provider_id);
DELETE FROM public.child_access WHERE user_id IN (v_provider_id, v_caregiver_id, v_teacher_id);
DELETE FROM public.children WHERE user_id IN (v_parent_id, v_provider_id);

-- ═══════════════════════════════════════════════════
-- CHILDREN
-- ═══════════════════════════════════════════════════

-- Parent's 2 kids
INSERT INTO public.children (user_id, name, age, diagnosis, gender)
VALUES (v_parent_id, 'Maya Patterson', '6', ARRAY['Autism','ADHD'], 'female')
RETURNING id INTO v_child1_id;

INSERT INTO public.children (user_id, name, age, diagnosis, gender)
VALUES (v_parent_id, 'Elijah Patterson', '4', ARRAY['Speech Delay','Sensory Processing Disorder'], 'male')
RETURNING id INTO v_child2_id;

-- Provider's 3 additional direct clients
INSERT INTO public.children (user_id, name, age, diagnosis, gender)
VALUES (v_provider_id, 'Aiden Chen', '8', ARRAY['Autism Level 2'], 'male')
RETURNING id INTO v_child3_id;

INSERT INTO public.children (user_id, name, age, diagnosis, gender)
VALUES (v_provider_id, 'Sophia Rivera', '5', ARRAY['ADHD','Anxiety'], 'female')
RETURNING id INTO v_child4_id;

INSERT INTO public.children (user_id, name, age, diagnosis, gender)
VALUES (v_provider_id, 'Jayden Williams', '7', ARRAY['Autism','Intellectual Disability'], 'male')
RETURNING id INTO v_child5_id;

-- ═══════════════════════════════════════════════════
-- CHILD ACCESS
-- ═══════════════════════════════════════════════════

-- Provider sees all 5 kids
INSERT INTO public.child_access (child_id, user_id, role, access_level, granted_by) VALUES
  (v_child1_id, v_provider_id, 'provider', 'clinical', v_parent_id),
  (v_child2_id, v_provider_id, 'provider', 'clinical', v_parent_id),
  (v_child3_id, v_provider_id, 'provider', 'clinical', v_provider_id),
  (v_child4_id, v_provider_id, 'provider', 'clinical', v_provider_id),
  (v_child5_id, v_provider_id, 'provider', 'clinical', v_provider_id);

-- Caregiver sees Maya
INSERT INTO public.child_access (child_id, user_id, role, access_level, granted_by)
VALUES (v_child1_id, v_caregiver_id, 'caregiver', 'daily', v_parent_id);

-- Teacher sees Elijah
INSERT INTO public.child_access (child_id, user_id, role, access_level, granted_by)
VALUES (v_child2_id, v_teacher_id, 'teacher', 'school', v_parent_id);

-- ═══════════════════════════════════════════════════
-- BEHAVIOR LOGS
-- ═══════════════════════════════════════════════════

-- Maya — meltdowns trending down (improving)
INSERT INTO public.behavior_logs (user_id, logged_by, logged_by_name, student_name, behavior_type, notes, severity, logged_at) VALUES
(v_parent_id, v_parent_id, 'Test Parent', 'Maya Patterson', 'meltdown', 'Meltdown at grocery store — overwhelmed by noise and lights. Lasted 15 minutes.', 4, now() - interval '28 days'),
(v_parent_id, v_parent_id, 'Test Parent', 'Maya Patterson', 'meltdown', 'Meltdown before school — refused to get dressed. Transition difficulty.', 3, now() - interval '25 days'),
(v_parent_id, v_parent_id, 'Test Parent', 'Maya Patterson', 'elopement', 'Ran out of classroom during fire drill practice. Sensory overload.', 4, now() - interval '22 days'),
(v_parent_id, v_parent_id, 'Test Parent', 'Maya Patterson', 'aggression', 'Hit sibling during play — frustrated about sharing toys.', 3, now() - interval '18 days'),
(v_parent_id, v_parent_id, 'Test Parent', 'Maya Patterson', 'meltdown', 'Brief meltdown at dinner — lasted 5 min. Recovered faster than usual.', 2, now() - interval '14 days'),
(v_parent_id, v_caregiver_id, 'Test Caregiver', 'Maya Patterson', 'stimming', 'Increased hand flapping at park — seemed happy, not distressed.', 1, now() - interval '10 days'),
(v_parent_id, v_parent_id, 'Test Parent', 'Maya Patterson', 'meltdown', 'Minor frustration at homework. Used breathing technique from therapy. Only 3 min.', 2, now() - interval '7 days'),
(v_parent_id, v_parent_id, 'Test Parent', 'Maya Patterson', 'positive', 'Used words to express frustration instead of hitting. Progress!', 1, now() - interval '3 days'),
(v_parent_id, v_parent_id, 'Test Parent', 'Maya Patterson', 'positive', 'Successfully navigated a schedule change without a meltdown.', 1, now() - interval '1 day');

-- Elijah — speech and sensory
INSERT INTO public.behavior_logs (user_id, logged_by, logged_by_name, student_name, behavior_type, notes, severity, logged_at) VALUES
(v_parent_id, v_parent_id, 'Test Parent', 'Elijah Patterson', 'sensory', 'Refused to wear new shirt — tags bothering him. Cut all tags out.', 2, now() - interval '26 days'),
(v_parent_id, v_parent_id, 'Test Parent', 'Elijah Patterson', 'communication', 'Pointed at cup instead of asking for water. Working on verbal requests.', 2, now() - interval '20 days'),
(v_parent_id, v_teacher_id, 'Test Teacher', 'Elijah Patterson', 'sensory', 'Covered ears during music class. Moved to quiet corner successfully.', 2, now() - interval '16 days'),
(v_parent_id, v_parent_id, 'Test Parent', 'Elijah Patterson', 'communication', 'Said "more juice please" unprompted! First 3-word sentence this week.', 1, now() - interval '12 days'),
(v_parent_id, v_parent_id, 'Test Parent', 'Elijah Patterson', 'meltdown', 'Meltdown when tablet died. Transitions from preferred activities still hard.', 3, now() - interval '8 days'),
(v_parent_id, v_parent_id, 'Test Parent', 'Elijah Patterson', 'positive', 'Used PECS card to request snack at daycare. Teacher was thrilled.', 1, now() - interval '4 days'),
(v_parent_id, v_parent_id, 'Test Parent', 'Elijah Patterson', 'communication', 'Waved goodbye to neighbor and said "bye bye." Spontaneous social greeting!', 1, now() - interval '1 day');

-- Aiden
INSERT INTO public.behavior_logs (user_id, logged_by, logged_by_name, student_name, behavior_type, notes, severity, logged_at) VALUES
(v_provider_id, v_provider_id, 'Test Provider', 'Aiden Chen', 'elopement', 'Left group activity to go to computer. Needs visual schedule reminders.', 3, now() - interval '21 days'),
(v_provider_id, v_provider_id, 'Test Provider', 'Aiden Chen', 'stimming', 'Repetitive questioning about train schedules — special interest. Redirected after 10 min.', 2, now() - interval '15 days'),
(v_provider_id, v_provider_id, 'Test Provider', 'Aiden Chen', 'aggression', 'Pushed peer who touched his project. Needs personal space boundaries work.', 3, now() - interval '9 days'),
(v_provider_id, v_provider_id, 'Test Provider', 'Aiden Chen', 'positive', 'Initiated conversation with peer about trains. Maintained 3 exchanges!', 1, now() - interval '4 days');

-- Sophia
INSERT INTO public.behavior_logs (user_id, logged_by, logged_by_name, student_name, behavior_type, notes, severity, logged_at) VALUES
(v_provider_id, v_provider_id, 'Test Provider', 'Sophia Rivera', 'inattention', 'Could not sit still during structured play. Needed 4 redirections in 15 min.', 3, now() - interval '24 days'),
(v_provider_id, v_provider_id, 'Test Provider', 'Sophia Rivera', 'anxiety', 'Crying before session — worried about making mistakes. Used calming strategies.', 3, now() - interval '17 days'),
(v_provider_id, v_provider_id, 'Test Provider', 'Sophia Rivera', 'inattention', 'Better focus with fidget tool. Completed 20 min task with only 1 prompt.', 2, now() - interval '10 days'),
(v_provider_id, v_provider_id, 'Test Provider', 'Sophia Rivera', 'positive', 'Self-advocated: "I need a break." Amazing progress on self-regulation!', 1, now() - interval '3 days');

-- Jayden
INSERT INTO public.behavior_logs (user_id, logged_by, logged_by_name, student_name, behavior_type, notes, severity, logged_at) VALUES
(v_provider_id, v_provider_id, 'Test Provider', 'Jayden Williams', 'self-injury', 'Head banging when frustrated during matching task. Redirected to sensory bin.', 4, now() - interval '23 days'),
(v_provider_id, v_provider_id, 'Test Provider', 'Jayden Williams', 'communication', 'Used AAC device to request "break" — first independent use!', 1, now() - interval '16 days'),
(v_provider_id, v_provider_id, 'Test Provider', 'Jayden Williams', 'self-injury', 'Brief hand biting during transition. Shorter duration than last week.', 3, now() - interval '9 days'),
(v_provider_id, v_provider_id, 'Test Provider', 'Jayden Williams', 'positive', 'Completed morning routine checklist independently for the first time.', 1, now() - interval '2 days');

-- ═══════════════════════════════════════════════════
-- SESSION NOTES
-- ═══════════════════════════════════════════════════

-- Maya — 3 sessions
INSERT INTO public.session_notes (provider_id, child_id, session_date, duration_minutes, cpt_code, session_type, goals_addressed, interventions, client_response, next_steps, billing_status, shared_with_parent, created_at)
VALUES (v_provider_id, v_child1_id, now()::date - 21, 60, '97153', 'Direct therapy', ARRAY['Reduce meltdown frequency','Improve emotional regulation'], 'DTT for emotion identification. Visual emotion chart. Deep breathing with timer. Role-played frustration scenarios.', 'Identified 4 emotions correctly. Used breathing technique once independently when frustrated with puzzle.', 'Continue emotion identification. Introduce social stories for transitions.', 'submitted', true, now() - interval '21 days')
RETURNING id INTO v_sn1;

INSERT INTO public.session_notes (provider_id, child_id, session_date, duration_minutes, cpt_code, session_type, goals_addressed, interventions, client_response, next_steps, billing_status, shared_with_parent, created_at)
VALUES (v_provider_id, v_child1_id, now()::date - 14, 60, '97153', 'Direct therapy', ARRAY['Improve emotional regulation','Reduce aggression toward sibling'], 'NET for sharing scenarios. Token economy for gentle hands. Social story about sharing.', 'Responded well to token board. Shared toy 3/5 trials. Needed 2 prompts for gentle hands.', 'Add sharing goals to home program. Send token board template to parents.', 'paid', true, now() - interval '14 days')
RETURNING id INTO v_sn2;

INSERT INTO public.session_notes (provider_id, child_id, session_date, duration_minutes, cpt_code, session_type, goals_addressed, interventions, client_response, next_steps, billing_status, shared_with_parent, created_at)
VALUES (v_provider_id, v_child1_id, now()::date - 7, 60, '97153', 'Direct therapy', ARRAY['Improve emotional regulation','Transition tolerance'], 'Schedule changes with visual timer. First-then board for non-preferred activities. Reinforcement for flexibility.', 'Excellent session! Tolerated 2 unplanned transitions without meltdown. Said "I don''t like that but okay."', 'Begin fading visual supports. Parent training on transition strategies.', 'draft', true, now() - interval '7 days')
RETURNING id INTO v_sn3;

-- Elijah — 2 sessions
INSERT INTO public.session_notes (provider_id, child_id, session_date, duration_minutes, cpt_code, session_type, goals_addressed, interventions, client_response, next_steps, billing_status, shared_with_parent, created_at)
VALUES (v_provider_id, v_child2_id, now()::date - 18, 45, '97153', 'Direct therapy', ARRAY['Increase verbal requests','Reduce sensory avoidance'], 'Mand training with preferred items. Sensory diet (deep pressure, swinging). PECS introduction for 5 items.', 'Made 6 verbal requests with model prompt. Tolerated deep pressure vest 10 min. Matched 3/5 PECS cards.', 'Continue mand training. Send PECS cards home. Recommend OT evaluation.', 'paid', true, now() - interval '18 days')
RETURNING id INTO v_sn4;

INSERT INTO public.session_notes (provider_id, child_id, session_date, duration_minutes, cpt_code, session_type, goals_addressed, interventions, client_response, next_steps, billing_status, shared_with_parent, created_at)
VALUES (v_provider_id, v_child2_id, now()::date - 4, 45, '97153', 'Direct therapy', ARRAY['Increase verbal requests','Social greetings'], 'Natural environment teaching for greetings. Embedded mand opportunities. Peer interaction with sibling.', 'Said "hi" unprompted! Made 10 verbal requests (up from 6). Used PECS for 2 novel items.', 'Increase social opportunities. Begin "please" and "thank you." Fade gestural prompts.', 'pending', true, now() - interval '4 days')
RETURNING id INTO v_sn5;

-- Aiden — 3 sessions
INSERT INTO public.session_notes (provider_id, child_id, session_date, duration_minutes, cpt_code, session_type, goals_addressed, interventions, client_response, next_steps, billing_status, shared_with_parent, created_at)
VALUES (v_provider_id, v_child3_id, now()::date - 20, 60, '97153', 'Direct therapy', ARRAY['Improve social reciprocity','Reduce elopement'], 'Structured social skills group. Visual boundary markers. Social stories about staying with group. Trains as reinforcer.', 'Stayed in group 35 min (target: 30). Initiated one comment to peer about trains. 1 redirect for elopement.', 'Increase group tolerance to 45 min. Practice conversational turn-taking.', 'submitted', false, now() - interval '20 days')
RETURNING id INTO v_sn6;

INSERT INTO public.session_notes (provider_id, child_id, session_date, duration_minutes, cpt_code, session_type, goals_addressed, interventions, client_response, next_steps, billing_status, shared_with_parent, created_at)
VALUES (v_provider_id, v_child3_id, now()::date - 13, 60, '97153', 'Direct therapy', ARRAY['Conversational turn-taking','Personal space awareness'], 'Video modeling for conversation. Hula hoop personal space activity. Train-themed social scripts.', 'Took 4 conversational turns (target: 3). Maintained personal space with visual reminder. Got upset when peer changed topic.', 'Work on topic flexibility. Continue fading personal space visuals.', 'paid', false, now() - interval '13 days')
RETURNING id INTO v_sn7;

INSERT INTO public.session_notes (provider_id, child_id, session_date, duration_minutes, cpt_code, session_type, goals_addressed, interventions, client_response, next_steps, billing_status, shared_with_parent, created_at)
VALUES (v_provider_id, v_child3_id, now()::date - 6, 60, '97153', 'Direct therapy', ARRAY['Topic flexibility','Conversational turn-taking'], 'Practiced 3 topics (trains, space, animals). Conversation card game. Reinforcement for asking about peer interests.', 'Asked peer "What do you like?" for the first time! Tolerated non-train topic 5 min. Significant progress.', 'Continue topic expansion. Generalize to school. Schedule school observation.', 'pending', false, now() - interval '6 days')
RETURNING id INTO v_sn8;

-- Sophia — 2 sessions
INSERT INTO public.session_notes (provider_id, child_id, session_date, duration_minutes, cpt_code, session_type, goals_addressed, interventions, client_response, next_steps, billing_status, shared_with_parent, created_at)
VALUES (v_provider_id, v_child4_id, now()::date - 17, 45, '97153', 'Direct therapy', ARRAY['Improve sustained attention','Reduce anxiety'], 'Gradual exposure to challenging tasks. Fidget tool. Break card system. Positive self-talk scripts. Timer for work intervals.', 'Completed 15 min focused task (up from 8). Used break card once appropriately. Cried briefly on error, recovered in 2 min.', 'Increase work intervals to 20 min. Error tolerance activities. Send break card to school.', 'paid', false, now() - interval '17 days')
RETURNING id INTO v_sn9;

INSERT INTO public.session_notes (provider_id, child_id, session_date, duration_minutes, cpt_code, session_type, goals_addressed, interventions, client_response, next_steps, billing_status, shared_with_parent, created_at)
VALUES (v_provider_id, v_child4_id, now()::date - 3, 45, '97153', 'Direct therapy', ARRAY['Self-advocacy skills','Reduce anxiety'], 'Role-play asking for breaks. Worry thermometer. "I need help" and "I need a break" scripts. Errorless teaching.', 'Said "I need a break" independently! Worry rating 3/10 vs. 7/10 last session. Completed task after break without tears.', 'Generalize self-advocacy to home. Begin peer interaction goals. Coordinate with school.', 'submitted', false, now() - interval '3 days')
RETURNING id INTO v_sn10;

-- Jayden — 2 sessions
INSERT INTO public.session_notes (provider_id, child_id, session_date, duration_minutes, cpt_code, session_type, goals_addressed, interventions, client_response, next_steps, billing_status, shared_with_parent, created_at)
VALUES (v_provider_id, v_child5_id, now()::date - 16, 90, '97153', 'Direct therapy', ARRAY['Reduce self-injurious behavior','Increase functional communication'], 'FCT teaching "break" via AAC. Sensory replacement (stress ball). Antecedent manipulation. Hand washing routine.', 'Used AAC "break" 3 times independently (was 0 last month). Head banging: 1 episode (down from 4). 3/5 hand washing steps.', 'Continue FCT. Add "help" and "all done" to AAC. Increase daily living targets.', 'denied', false, now() - interval '16 days')
RETURNING id INTO v_sn11;

INSERT INTO public.session_notes (provider_id, child_id, session_date, duration_minutes, cpt_code, session_type, goals_addressed, interventions, client_response, next_steps, billing_status, shared_with_parent, created_at)
VALUES (v_provider_id, v_child5_id, now()::date - 2, 90, '97153', 'Direct therapy', ARRAY['Increase functional communication','Daily living skills'], 'AAC expansion (break, help, more, all done). Morning routine with visual checklist. VR3 reinforcement for AAC use.', 'Used 3 different AAC buttons! Completed morning routine independently for first time. Zero SIB this session!', 'Celebrate with family. Add food requests to AAC. Begin toileting assessment.', 'pending', false, now() - interval '2 days')
RETURNING id INTO v_sn12;

-- ═══════════════════════════════════════════════════
-- PAYER ENROLLMENTS
-- ═══════════════════════════════════════════════════

INSERT INTO public.payer_enrollments (provider_id, payer_name, payer_id, enrollment_status, credentialed_at, notes)
VALUES (v_provider_id, 'Blue Cross Blue Shield', 'BCBS-CA-4821', 'active', now() - interval '1 year', 'Primary payer — most clients')
RETURNING id INTO v_payer1_id;

INSERT INTO public.payer_enrollments (provider_id, payer_name, payer_id, enrollment_status, credentialed_at, notes)
VALUES (v_provider_id, 'Aetna', 'AETNA-7734', 'active', now() - interval '6 months', 'Recently credentialed')
RETURNING id INTO v_payer2_id;

INSERT INTO public.payer_enrollments (provider_id, payer_name, payer_id, enrollment_status, notes)
VALUES (v_provider_id, 'Tricare', 'TRICARE-WEST', 'pending', 'Application submitted — waiting for approval');

-- ═══════════════════════════════════════════════════
-- CLAIMS
-- ═══════════════════════════════════════════════════

-- Maya claims
INSERT INTO public.claims (session_note_id, provider_id, child_id, payer_name, payer_id, cpt_code, units, amount, status, submitted_at, created_at)
VALUES (v_sn1, v_provider_id, v_child1_id, 'Blue Cross Blue Shield', 'BCBS-CA-4821', '97153', 4, 120.00, 'submitted', now() - interval '20 days', now() - interval '21 days');

INSERT INTO public.claims (session_note_id, provider_id, child_id, payer_name, payer_id, cpt_code, units, amount, status, submitted_at, paid_at, paid_amount, created_at)
VALUES (v_sn2, v_provider_id, v_child1_id, 'Blue Cross Blue Shield', 'BCBS-CA-4821', '97153', 4, 120.00, 'paid', now() - interval '13 days', now() - interval '7 days', 108.00, now() - interval '14 days');

-- Elijah claims
INSERT INTO public.claims (session_note_id, provider_id, child_id, payer_name, payer_id, cpt_code, units, amount, status, submitted_at, paid_at, paid_amount, created_at)
VALUES (v_sn4, v_provider_id, v_child2_id, 'Blue Cross Blue Shield', 'BCBS-CA-4821', '97153', 3, 90.00, 'paid', now() - interval '17 days', now() - interval '10 days', 90.00, now() - interval '18 days');

INSERT INTO public.claims (session_note_id, provider_id, child_id, payer_name, payer_id, cpt_code, units, amount, status, created_at)
VALUES (v_sn5, v_provider_id, v_child2_id, 'Blue Cross Blue Shield', 'BCBS-CA-4821', '97153', 3, 90.00, 'pending', now() - interval '4 days');

-- Aiden claims (Aetna)
INSERT INTO public.claims (session_note_id, provider_id, child_id, payer_name, payer_id, cpt_code, units, amount, status, submitted_at, created_at)
VALUES (v_sn6, v_provider_id, v_child3_id, 'Aetna', 'AETNA-7734', '97153', 4, 140.00, 'submitted', now() - interval '19 days', now() - interval '20 days');

INSERT INTO public.claims (session_note_id, provider_id, child_id, payer_name, payer_id, cpt_code, units, amount, status, submitted_at, paid_at, paid_amount, created_at)
VALUES (v_sn7, v_provider_id, v_child3_id, 'Aetna', 'AETNA-7734', '97153', 4, 140.00, 'paid', now() - interval '12 days', now() - interval '5 days', 140.00, now() - interval '13 days');

INSERT INTO public.claims (session_note_id, provider_id, child_id, payer_name, payer_id, cpt_code, units, amount, status, created_at)
VALUES (v_sn8, v_provider_id, v_child3_id, 'Aetna', 'AETNA-7734', '97153', 4, 140.00, 'pending', now() - interval '6 days');

-- Sophia claims
INSERT INTO public.claims (session_note_id, provider_id, child_id, payer_name, payer_id, cpt_code, units, amount, status, submitted_at, paid_at, paid_amount, created_at)
VALUES (v_sn9, v_provider_id, v_child4_id, 'Blue Cross Blue Shield', 'BCBS-CA-4821', '97153', 3, 90.00, 'paid', now() - interval '16 days', now() - interval '8 days', 81.00, now() - interval '17 days');

INSERT INTO public.claims (session_note_id, provider_id, child_id, payer_name, payer_id, cpt_code, units, amount, status, submitted_at, created_at)
VALUES (v_sn10, v_provider_id, v_child4_id, 'Blue Cross Blue Shield', 'BCBS-CA-4821', '97153', 3, 90.00, 'submitted', now() - interval '2 days', now() - interval '3 days');

-- Jayden claims (1 denied, 1 pending)
INSERT INTO public.claims (session_note_id, provider_id, child_id, payer_name, payer_id, cpt_code, units, amount, status, submitted_at, denied_reason, created_at)
VALUES (v_sn11, v_provider_id, v_child5_id, 'Blue Cross Blue Shield', 'BCBS-CA-4821', '97153', 6, 180.00, 'denied', now() - interval '15 days', 'Prior authorization expired. Resubmit with updated auth number.', now() - interval '16 days');

INSERT INTO public.claims (session_note_id, provider_id, child_id, payer_name, payer_id, cpt_code, units, amount, status, created_at)
VALUES (v_sn12, v_provider_id, v_child5_id, 'Blue Cross Blue Shield', 'BCBS-CA-4821', '97153', 6, 180.00, 'pending', now() - interval '2 days');

-- ═══════════════════════════════════════════════════
-- CARE NOTES (cross-team collaboration)
-- ═══════════════════════════════════════════════════

-- Maya notes
INSERT INTO public.care_notes (child_id, author_id, author_name, author_role, content, created_at) VALUES
(v_child1_id, v_parent_id, 'Test Parent', 'parent', 'Maya had a tough morning but used her breathing card before school. The visual timer is helping with transitions. She asked to see her schedule before leaving — this is new!', now() - interval '20 days'),
(v_child1_id, v_provider_id, 'Test Provider', 'provider', 'Session update: Maya making excellent progress on emotion regulation. Identified "frustrated" and used coping strategy independently. Recommend continuing visual emotion chart at home.', now() - interval '14 days'),
(v_child1_id, v_caregiver_id, 'Test Caregiver', 'caregiver', 'Picked up Maya from school. She told me she was "a little mad" when a friend took her crayon but didn''t hit. She asked for a hug instead. So proud!', now() - interval '10 days'),
(v_child1_id, v_parent_id, 'Test Parent', 'parent', 'Win! Maya navigated a surprise schedule change (dentist moved up) without a meltdown. She said "I don''t like surprises but it''s okay." Happy tears.', now() - interval '1 day');

-- Elijah notes
INSERT INTO public.care_notes (child_id, author_id, author_name, author_role, content, created_at) VALUES
(v_child2_id, v_parent_id, 'Test Parent', 'parent', 'Elijah started pointing at things and saying the word! Said "ball" and "cup" today without prompting. The speech work is paying off.', now() - interval '15 days'),
(v_child2_id, v_provider_id, 'Test Provider', 'provider', 'Great session. Verbal requests increasing — 8-10 spontaneous words per session vs. 2-3 a month ago. Recommending increasing session frequency.', now() - interval '4 days'),
(v_child2_id, v_teacher_id, 'Test Teacher', 'teacher', 'Elijah waved goodbye to classmates and said "bye bye"! Kids were so excited. Starting to participate in circle time. Using sensory corner for breaks.', now() - interval '2 days');

RAISE NOTICE 'Seed data created successfully!';
RAISE NOTICE 'Parent: 2 kids (Maya age 6, Elijah age 4)';
RAISE NOTICE 'Provider: 5 clients, 12 session notes, 11 claims, 3 payers';
RAISE NOTICE 'Caregiver: access to Maya';
RAISE NOTICE 'Teacher: access to Elijah';

END $$;
