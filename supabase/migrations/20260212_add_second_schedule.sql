-- Add columns for the Second Automated Schedule
ALTER TABLE business_settings
ADD COLUMN IF NOT EXISTS whatsapp_reminder_enabled_2 BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS whatsapp_reminder_send_day_2 TEXT,
ADD COLUMN IF NOT EXISTS whatsapp_reminder_send_time_2 TIME,
ADD COLUMN IF NOT EXISTS whatsapp_reminder_start_day_2 TEXT,
ADD COLUMN IF NOT EXISTS whatsapp_reminder_end_day_2 TEXT,
ADD COLUMN IF NOT EXISTS whatsapp_reminder_last_ran_2 TIMESTAMPTZ;

-- Create index for performance (since we query enabled=true often)
CREATE INDEX IF NOT EXISTS idx_business_settings_reminder_enabled_2 ON business_settings(whatsapp_reminder_enabled_2);
