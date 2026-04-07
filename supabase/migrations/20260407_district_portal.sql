-- ═══════════════════════════════════════════════════
-- District Admin Portal
-- 2026-04-07
-- ═══════════════════════════════════════════════════

-- Districts table
CREATE TABLE IF NOT EXISTS public.districts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  city text,
  state text,
  student_count integer,
  sped_student_count integer,
  contact_name text,
  contact_email text,
  contact_phone text,
  pilot_status text DEFAULT 'prospect',  -- 'prospect', 'pilot', 'active', 'churned'
  pilot_start_date date,
  pilot_end_date date,
  contract_value decimal(10,2),
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.districts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage districts"
  ON public.districts FOR ALL
  USING (public.is_admin());

-- District coordinators table (links a user to a district)
CREATE TABLE IF NOT EXISTS public.district_coordinators (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  district_id uuid REFERENCES public.districts(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  role text DEFAULT 'coordinator',  -- 'coordinator', 'admin'
  created_at timestamptz DEFAULT now(),
  UNIQUE(district_id, user_id)
);

ALTER TABLE public.district_coordinators ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coordinators read own"
  ON public.district_coordinators FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins manage coordinators"
  ON public.district_coordinators FOR ALL
  USING (public.is_admin());

-- District schools table
CREATE TABLE IF NOT EXISTS public.district_schools (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  district_id uuid REFERENCES public.districts(id) ON DELETE CASCADE NOT NULL,
  school_name text NOT NULL,
  school_code text,
  address text,
  city text,
  principal_name text,
  principal_email text,
  teacher_count integer DEFAULT 0,
  student_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.district_schools ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coordinators read own district schools"
  ON public.district_schools FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.district_coordinators
      WHERE district_id = district_schools.district_id
      AND user_id = auth.uid()
    )
  );

CREATE POLICY "Admins manage schools"
  ON public.district_schools FOR ALL
  USING (public.is_admin());

-- Link profiles to districts (for teachers and parents in a district)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS district_id uuid REFERENCES public.districts(id);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.district_schools(id);

-- District-scoped view policy: coordinators can see aggregate profile data for their district
CREATE OR REPLACE FUNCTION public.user_is_district_coordinator(dist_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.district_coordinators
    WHERE district_id = dist_id AND user_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_districts_status ON public.districts(pilot_status);
CREATE INDEX IF NOT EXISTS idx_district_coords_user ON public.district_coordinators(user_id);
CREATE INDEX IF NOT EXISTS idx_district_coords_district ON public.district_coordinators(district_id);
CREATE INDEX IF NOT EXISTS idx_district_schools_district ON public.district_schools(district_id);
CREATE INDEX IF NOT EXISTS idx_profiles_district ON public.profiles(district_id);
CREATE INDEX IF NOT EXISTS idx_profiles_school ON public.profiles(school_id);
