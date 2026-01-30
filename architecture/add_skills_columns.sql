
-- Migration: Add Skills Support
-- 1. Add 'skills' to profiles (List of codes the provider HAS)
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS skills JSONB DEFAULT '[]'::jsonb;

-- 2. Add 'required_skills' to treatments (List of codes the treatment NEEDS)
ALTER TABLE treatments 
ADD COLUMN IF NOT EXISTS required_skills JSONB DEFAULT '[]'::jsonb;

-- 3. Add a commentary helper for safety
COMMENT ON COLUMN profiles.skills IS 'Array of skill codes e.g. ["HC", "COL"]';
COMMENT ON COLUMN treatments.required_skills IS 'Array of required skill codes e.g. ["COL"]';
