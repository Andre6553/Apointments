-- Add WhatsApp Opt-In column to clients table
ALTER TABLE clients ADD COLUMN IF NOT EXISTS whatsapp_opt_in BOOLEAN DEFAULT NULL;

-- Comment for clarity
COMMENT ON COLUMN clients.whatsapp_opt_in IS 'TRUE=Yes, FALSE=No, NULL=Not Set';
