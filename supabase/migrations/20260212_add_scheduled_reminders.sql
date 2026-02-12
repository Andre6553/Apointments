-- Add columns for Scheduled Smart Reminders
ALTER TABLE business_settings
ADD COLUMN IF NOT EXISTS whatsapp_reminder_send_day TEXT, -- e.g. 'Friday'
ADD COLUMN IF NOT EXISTS whatsapp_reminder_send_time TIME, -- e.g. '10:00:00'
ADD COLUMN IF NOT EXISTS whatsapp_reminder_last_ran TIMESTAMPTZ; -- To track when it last executed

-- Index for faster lookup during automation checks (optional but good)
CREATE INDEX IF NOT EXISTS idx_business_settings_reminders ON business_settings (whatsapp_reminder_send_day, whatsapp_reminder_send_time);
