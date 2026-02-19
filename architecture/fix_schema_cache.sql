-- Ensure column exists
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

-- Reload schema cache specifically for PostgREST
NOTIFY pgrst, 'reload schema';
