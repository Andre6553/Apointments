-- 1. Create Businesses Table
CREATE TABLE IF NOT EXISTS businesses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    owner_id UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Add business_id to Profiles, Clients, and Appointments
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES businesses(id);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES businesses(id);
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES businesses(id);

-- 3. Create a Default Business (for existing data migration)
-- This ensures no data is lost during the shift
DO $$
DECLARE
    default_business_id UUID;
BEGIN
    INSERT INTO businesses (name) VALUES ('Default Business') RETURNING id INTO default_business_id;
    
    UPDATE profiles SET business_id = default_business_id WHERE business_id IS NULL;
    UPDATE clients SET business_id = default_business_id WHERE business_id IS NULL;
    UPDATE appointments SET business_id = default_business_id WHERE business_id IS NULL;
END $$;

-- 4. Multi-Tenant RLS Policies (Isolation Layer)
-- Drop existing restrictive policies first
DROP POLICY IF EXISTS "Clients management policy" ON clients;
DROP POLICY IF EXISTS "Appointments management policy" ON appointments;

-- New Business-Isolated Policies
CREATE POLICY "Business-wide client access" ON clients
FOR ALL USING (
    business_id = (SELECT business_id FROM profiles WHERE id = auth.uid())
);

CREATE POLICY "Business-wide appointment access" ON appointments
FOR ALL USING (
    business_id = (SELECT business_id FROM profiles WHERE id = auth.uid())
);

-- 5. Automatic Association Trigger
CREATE OR REPLACE FUNCTION stamp_business_id()
RETURNS trigger AS $$
BEGIN
  IF NEW.business_id IS NULL THEN
    NEW.business_id := (SELECT business_id FROM profiles WHERE id = auth.uid());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_stamp_client_business ON clients;
CREATE TRIGGER tr_stamp_client_business BEFORE INSERT ON clients FOR EACH ROW EXECUTE FUNCTION stamp_business_id();

DROP TRIGGER IF EXISTS tr_stamp_appointment_business ON appointments;
CREATE TRIGGER tr_stamp_appointment_business BEFORE INSERT ON appointments FOR EACH ROW EXECUTE FUNCTION stamp_business_id();
