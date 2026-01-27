-- MasterAdmin Migration

-- 1. Add MasterAdmin to Role Constraints
-- First, identify and drop existing check constraints on role if they exist
DO $$
BEGIN
    -- Drop constraint on profiles if it exists
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_role_check') THEN
        ALTER TABLE profiles DROP CONSTRAINT profiles_role_check;
    END IF;
    
    -- Drop constraint on subscriptions if it exists
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_role_check') THEN
        ALTER TABLE subscriptions DROP CONSTRAINT subscriptions_role_check;
    END IF;
END $$;

-- 2. Add New Roles
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('Admin', 'Doctor', 'Nail Artist', 'Provider', 'MasterAdmin'));
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_role_check CHECK (role IN ('Admin', 'Provider', 'MasterAdmin'));

-- 3. App Settings Table for Global Config
CREATE TABLE IF NOT EXISTS app_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT UNIQUE NOT NULL,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert Default Prices
INSERT INTO app_settings (key, value) VALUES 
('pricing_admin', '{"monthly": 5, "yearly": 55}'),
('pricing_provider', '{"monthly": 3, "yearly": 33}')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- 4. MasterAdmin RLS Bypass
-- Profiles
DROP POLICY IF EXISTS "MasterAdmin view all profiles" ON profiles;
CREATE POLICY "MasterAdmin view all profiles" ON profiles FOR ALL USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'MasterAdmin'
);

-- Businesses
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "MasterAdmin view all businesses" ON businesses;
CREATE POLICY "MasterAdmin view all businesses" ON businesses FOR ALL USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'MasterAdmin'
);

-- Clients
DROP POLICY IF EXISTS "MasterAdmin view all clients" ON clients;
CREATE POLICY "MasterAdmin view all clients" ON clients FOR ALL USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'MasterAdmin'
);

-- Appointments
DROP POLICY IF EXISTS "MasterAdmin view all appointments" ON appointments;
CREATE POLICY "MasterAdmin view all appointments" ON appointments FOR ALL USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'MasterAdmin'
);

-- Subscriptions
DROP POLICY IF EXISTS "MasterAdmin view all subscriptions" ON subscriptions;
CREATE POLICY "MasterAdmin view all subscriptions" ON subscriptions FOR ALL USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'MasterAdmin'
);

-- Payment History
DROP POLICY IF EXISTS "MasterAdmin view all payments" ON payment_history;
CREATE POLICY "MasterAdmin view all payments" ON payment_history FOR ALL USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'MasterAdmin'
);

-- App Settings (MasterAdmin only)
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "MasterAdmin manage settings" ON app_settings;
CREATE POLICY "MasterAdmin manage settings" ON app_settings FOR ALL USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'MasterAdmin'
);

-- 5. Assign MasterAdmin Role to specified email
-- This will run if the user exists
UPDATE profiles SET role = 'MasterAdmin' WHERE email = 'apointmenttracker@gmail.com';
