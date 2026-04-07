-- Ensure profile email stays in sync with auth email
-- This trigger fires when a new user is created via Supabase Auth
-- and ensures the profile row has the email set

CREATE OR REPLACE FUNCTION public.sync_profile_email()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.profiles 
  SET email = NEW.email 
  WHERE id = NEW.id AND (email IS NULL OR email = '');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_profile_email ON auth.users;
CREATE TRIGGER trg_sync_profile_email
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_email();

-- Backfill: sync all missing emails now
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id
AND (p.email IS NULL OR p.email = '');
