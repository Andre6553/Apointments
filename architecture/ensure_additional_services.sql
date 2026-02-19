-- Add additional_services column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'appointments'
        AND column_name = 'additional_services'
    ) THEN
        ALTER TABLE appointments
        ADD COLUMN additional_services JSONB DEFAULT '[]'::jsonb;
    END IF;
END $$;
