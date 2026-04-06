-- Fix: allow text column to be null since app now uses 'content' column
ALTER TABLE public.community_comments ALTER COLUMN text DROP NOT NULL;
