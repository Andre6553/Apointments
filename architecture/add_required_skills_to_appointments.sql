-- Migration: Add Required Skills and Treatment ID to Appointments
-- This allows "tagging" each appointment with its specific skill requirements.

-- 1. Add treatment_id for relational tracking
ALTER TABLE appointments 
ADD COLUMN IF NOT EXISTS treatment_id UUID REFERENCES treatments(id);

-- 2. Add required_skills JSONB for historical snapshotting/tagging
ALTER TABLE appointments 
ADD COLUMN IF NOT EXISTS required_skills JSONB DEFAULT '[]'::jsonb;

-- Commentary for clarity
COMMENT ON COLUMN appointments.required_skills IS 'Snapshot of skill codes required for this session e.g. ["COL"]';
