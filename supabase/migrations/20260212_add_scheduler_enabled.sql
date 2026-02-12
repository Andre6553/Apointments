-- Add Enabled Toggle for Scheduled Reminders
ALTER TABLE business_settings
ADD COLUMN IF NOT EXISTS whatsapp_reminder_enabled BOOLEAN DEFAULT false;

-- Add index to filter by enabled businesses quickly (for the Edge Function)
CREATE INDEX IF NOT EXISTS idx_business_settings_enabled ON business_settings (whatsapp_reminder_enabled) WHERE whatsapp_reminder_enabled = true;
