
-- Add logging_enabled column to business_settings for Org-Wide control
ALTER TABLE business_settings 
ADD COLUMN IF NOT EXISTS logging_enabled BOOLEAN DEFAULT FALSE;
