-- Add WhatsApp configuration columns to business_settings
ALTER TABLE business_settings 
ADD COLUMN IF NOT EXISTS whatsapp_reminder_template TEXT DEFAULT 'Dear [Client Name] please remember your appointment on [Date] at [Time]\n\n‼️Please NOTE CANCELLATION less than 24 hours, FULL FEE will be charged.\n💅🏻EFT payments in Salon or Card machine. 3% yoco fee will be added\n💅🏻Please be on time\n💅🏻Please confirm',
ADD COLUMN IF NOT EXISTS whatsapp_reminder_start_day TEXT DEFAULT 'Wednesday',
ADD COLUMN IF NOT EXISTS whatsapp_reminder_end_day TEXT DEFAULT 'Saturday',
ADD COLUMN IF NOT EXISTS whatsapp_broadcast_template TEXT DEFAULT '';

-- Ensure the table is accessible (redundant if policy exists but good for safety)
GRANT ALL ON business_settings TO authenticated;
GRANT ALL ON business_settings TO service_role;
