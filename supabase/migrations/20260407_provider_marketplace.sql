-- ═══════════════════════════════════════════════════
-- Provider Marketplace v2
-- 2026-04-07
-- ═══════════════════════════════════════════════════

-- Add marketplace fields to provider profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS provider_bio text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS provider_specialties text[] DEFAULT '{}';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS provider_price_30 integer;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS provider_price_60 integer;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS provider_video_url text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS provider_experience text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS provider_families_served integer DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS provider_rating decimal(2,1) DEFAULT 5.0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS provider_review_count integer DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS provider_listed boolean DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS provider_color text DEFAULT 'var(--lavender)';

-- Provider reviews table (parents rate providers)
CREATE TABLE IF NOT EXISTS public.provider_reviews (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  reviewer_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review_text text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(provider_id, reviewer_id)
);

ALTER TABLE public.provider_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read provider reviews"
  ON public.provider_reviews FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Parents can create reviews"
  ON public.provider_reviews FOR INSERT
  WITH CHECK (auth.uid() = reviewer_id);

CREATE POLICY "Users can update own reviews"
  ON public.provider_reviews FOR UPDATE
  USING (auth.uid() = reviewer_id);

-- Seed Ariana's marketplace data
UPDATE public.profiles SET
  provider_bio = 'Ariana brings deep expertise in behavior analysis to every family she works with. She specializes in helping parents of neurodivergent children build structure, reduce stress, and celebrate progress. Her approach blends ABA strategies with practical warmth — because parents need both evidence and encouragement.',
  provider_specialties = ARRAY['Autism (ASD)', 'ADHD', 'Early Intervention', 'Social Skills', 'Parent Coaching'],
  provider_price_30 = 55,
  provider_price_60 = 95,
  provider_video_url = 'https://doxy.me/v2/check-in/arianaroberts/',
  provider_experience = '8 yrs',
  provider_families_served = 200,
  provider_rating = 5.0,
  provider_review_count = 48,
  provider_listed = true,
  provider_color = 'var(--lavender)'
WHERE email = 'arianaRpatterson@gmail.com' OR email = 'ArianaRPatterson@gmail.com';

-- Index for marketplace queries
CREATE INDEX IF NOT EXISTS idx_profiles_provider_listed ON public.profiles(provider_listed) WHERE provider_listed = true;
CREATE INDEX IF NOT EXISTS idx_provider_reviews_provider ON public.provider_reviews(provider_id);
