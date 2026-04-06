-- ═══════════════════════════════════════════════════
-- Test Accounts Setup
-- Run AFTER creating users in Supabase Auth dashboard
-- 1. Go to Supabase Dashboard > Authentication > Users > Create User
-- 2. Create 4 users:
--    testparent@modernvillage.app / TestParent123!
--    testprovider@modernvillage.app / TestProvider123!
--    testcaregiver@modernvillage.app / TestCaregiver123!
--    testteacher@modernvillage.app / TestTeacher123!
-- 3. Then run this SQL
-- ═══════════════════════════════════════════════════

-- Update parent profile
UPDATE public.profiles SET
  name = 'Test Parent',
  role = 'parent',
  subscription_status = 'pro'
WHERE email = 'testparent@modernvillage.app';

-- Create test child for parent
INSERT INTO public.children (user_id, name, age, diagnosis, gender)
SELECT id, 'Test Child', '6 yrs', ARRAY['Autism (ASD)', 'ADHD'], 'Male'
FROM public.profiles WHERE email = 'testparent@modernvillage.app'
ON CONFLICT DO NOTHING;

-- Update provider profile
UPDATE public.profiles SET
  name = 'Dr. Test Provider',
  role = 'provider',
  provider_verified = true,
  npi_number = '1234567890',
  license_type = 'BCBA',
  license_state = 'CA',
  license_number = 'BCBA-12345',
  cpt_codes = ARRAY['97151','97153','97155']
WHERE email = 'testprovider@modernvillage.app';

-- Update caregiver profile
UPDATE public.profiles SET
  name = 'Test Caregiver',
  role = 'caregiver'
WHERE email = 'testcaregiver@modernvillage.app';

-- Update teacher profile
UPDATE public.profiles SET
  name = 'Test Teacher',
  role = 'teacher'
WHERE email = 'testteacher@modernvillage.app';

-- Connect provider to test child (clinical access)
INSERT INTO public.child_access (child_id, user_id, role, access_level, granted_by)
SELECT c.id,
  (SELECT id FROM public.profiles WHERE email = 'testprovider@modernvillage.app'),
  'provider', 'clinical',
  (SELECT id FROM public.profiles WHERE email = 'testparent@modernvillage.app')
FROM public.children c
JOIN public.profiles p ON p.id = c.user_id
WHERE p.email = 'testparent@modernvillage.app'
AND c.name = 'Test Child'
ON CONFLICT DO NOTHING;

-- Connect caregiver to test child (daily access)
INSERT INTO public.child_access (child_id, user_id, role, access_level, granted_by)
SELECT c.id,
  (SELECT id FROM public.profiles WHERE email = 'testcaregiver@modernvillage.app'),
  'caregiver', 'daily',
  (SELECT id FROM public.profiles WHERE email = 'testparent@modernvillage.app')
FROM public.children c
JOIN public.profiles p ON p.id = c.user_id
WHERE p.email = 'testparent@modernvillage.app'
AND c.name = 'Test Child'
ON CONFLICT DO NOTHING;

-- Connect teacher to test child (school access)
INSERT INTO public.child_access (child_id, user_id, role, access_level, granted_by)
SELECT c.id,
  (SELECT id FROM public.profiles WHERE email = 'testteacher@modernvillage.app'),
  'teacher', 'school',
  (SELECT id FROM public.profiles WHERE email = 'testparent@modernvillage.app')
FROM public.children c
JOIN public.profiles p ON p.id = c.user_id
WHERE p.email = 'testparent@modernvillage.app'
AND c.name = 'Test Child'
ON CONFLICT DO NOTHING;
