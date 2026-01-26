-- Add report protection toggle to profiles
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS report_protection_enabled BOOLEAN DEFAULT TRUE;

-- Update existing profiles to have it enabled by default
UPDATE profiles SET report_protection_enabled = TRUE WHERE report_protection_enabled IS NULL;
