-- Session 16: Onboarding Flow
-- Add onboarding columns to sites table

ALTER TABLE sites 
ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE;

ALTER TABLE sites 
ADD COLUMN IF NOT EXISTS onboarding_state JSONB DEFAULT '{}';
