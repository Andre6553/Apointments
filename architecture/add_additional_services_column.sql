-- Add additional_services column to appointments table
ALTER TABLE appointments 
ADD COLUMN IF NOT EXISTS additional_services JSONB DEFAULT '[]'::jsonb;
