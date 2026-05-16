ALTER TABLE sites
  ADD COLUMN IF NOT EXISTS public_share_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS public_share_token   text    UNIQUE DEFAULT gen_random_uuid()::text;
