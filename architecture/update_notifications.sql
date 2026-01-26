ALTER TABLE appointments ADD COLUMN IF NOT EXISTS notifications_sent INTEGER DEFAULT 0;

-- Check clients table columns
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'clients';
