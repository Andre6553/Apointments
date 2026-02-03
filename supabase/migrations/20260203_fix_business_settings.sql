
-- Add missing columns to business_settings
ALTER TABLE business_settings 
ADD COLUMN IF NOT EXISTS virtual_assistant_enabled BOOLEAN DEFAULT FALSE;

ALTER TABLE business_settings 
ADD COLUMN IF NOT EXISTS last_heartbeat TIMESTAMPTZ;

-- Re-verify RLS allows access
-- (Existing policy "Allow access to own business settings" should cover new columns automatically)
