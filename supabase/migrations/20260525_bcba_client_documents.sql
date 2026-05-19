-- ═══════════════════════════════════════════════════
-- BCBA Data Collection — Client Document Storage
-- 2026-05-25
-- Per-client document metadata. Files live in the Supabase Storage
-- bucket 'practice-client-documents' (created manually in Dashboard
-- with storage-level RLS policies — see end of file).
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.practice_client_documents (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  practice_client_id uuid REFERENCES public.practice_clients(id) ON DELETE CASCADE NOT NULL,
  uploaded_by uuid REFERENCES public.practice_members(id) ON DELETE SET NULL,
  file_path text NOT NULL,
    -- e.g. 'practice_id/client_id/uuid.pdf'
  file_name text NOT NULL,
    -- original filename as uploaded
  file_size bigint,
  mime_type text,
  category text,
    -- 'assessment' | 'bip' | 'treatment_plan' | 'progress_report' | 'insurance_auth' | 'parent_consent' | 'other'
  description text,
  uploaded_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_practice_client_documents_client
  ON public.practice_client_documents(practice_client_id, uploaded_at DESC);

CREATE INDEX IF NOT EXISTS idx_practice_client_documents_category
  ON public.practice_client_documents(practice_client_id, category)
  WHERE category IS NOT NULL;

ALTER TABLE public.practice_client_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read client documents" ON public.practice_client_documents
  FOR SELECT USING (
    public.is_practice_member((
      SELECT pc.practice_id FROM public.practice_clients pc WHERE pc.id = practice_client_id
    )) OR public.is_admin()
  );

CREATE POLICY "Members upload client documents" ON public.practice_client_documents
  FOR INSERT WITH CHECK (
    public.is_practice_member((
      SELECT pc.practice_id FROM public.practice_clients pc WHERE pc.id = practice_client_id
    )) OR public.is_admin()
  );

CREATE POLICY "BCBA deletes client documents" ON public.practice_client_documents
  FOR DELETE USING (
    public.is_practice_bcba((
      SELECT pc.practice_id FROM public.practice_clients pc WHERE pc.id = practice_client_id
    )) OR public.is_admin()
  );

CREATE POLICY "Members update document metadata" ON public.practice_client_documents
  FOR UPDATE USING (
    public.is_practice_member((
      SELECT pc.practice_id FROM public.practice_clients pc WHERE pc.id = practice_client_id
    )) OR public.is_admin()
  );

-- ─── STORAGE BUCKET POLICIES ────────────────────────
-- Storage object access scoped by file path. Path convention:
--   <practice_id>/<practice_client_id>/<uuid>.<ext>
-- The first path segment is the practice_id, which we extract and
-- check against the caller's active practice memberships.

-- Bucket must be created MANUALLY in Supabase Dashboard:
--   Storage → Create bucket → name 'practice-client-documents' → Private
-- Then run the following policies on storage.objects:

CREATE POLICY "Practice members read client doc files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'practice-client-documents'
    AND public.is_practice_member((split_part(name, '/', 1))::uuid)
  );

CREATE POLICY "Practice members upload client doc files"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'practice-client-documents'
    AND public.is_practice_member((split_part(name, '/', 1))::uuid)
  );

CREATE POLICY "BCBA deletes client doc files"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'practice-client-documents'
    AND public.is_practice_bcba((split_part(name, '/', 1))::uuid)
  );

-- ═══════════════════════════════════════════════════
-- END migration
-- ═══════════════════════════════════════════════════
