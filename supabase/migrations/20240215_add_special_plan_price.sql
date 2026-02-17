-- Add special_plan_price to businesses table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'businesses' AND column_name = 'special_plan_price') THEN
        ALTER TABLE businesses ADD COLUMN special_plan_price numeric DEFAULT NULL;
    END IF;
END $$;
