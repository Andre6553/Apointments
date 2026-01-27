-- Fix RLS Recursion

-- 1. Create a Security Definer function to check roles safely
CREATE OR REPLACE FUNCTION check_is_master_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND role = 'MasterAdmin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. Update Policies to use the function instead of subqueries
-- This prevents the "infinite recursion" error on the profiles table

-- Profiles
DROP POLICY IF EXISTS "MasterAdmin view all profiles" ON profiles;
CREATE POLICY "MasterAdmin view all profiles" ON profiles FOR ALL USING (
    check_is_master_admin()
);

-- Businesses
DROP POLICY IF EXISTS "MasterAdmin view all businesses" ON businesses;
CREATE POLICY "MasterAdmin view all businesses" ON businesses FOR ALL USING (
    check_is_master_admin()
);

-- Clients
DROP POLICY IF EXISTS "MasterAdmin view all clients" ON clients;
CREATE POLICY "MasterAdmin view all clients" ON clients FOR ALL USING (
    check_is_master_admin()
);

-- Appointments
DROP POLICY IF EXISTS "MasterAdmin view all appointments" ON appointments;
CREATE POLICY "MasterAdmin view all appointments" ON appointments FOR ALL USING (
    check_is_master_admin()
);

-- Subscriptions
DROP POLICY IF EXISTS "MasterAdmin view all subscriptions" ON subscriptions;
CREATE POLICY "MasterAdmin view all subscriptions" ON subscriptions FOR ALL USING (
    check_is_master_admin()
);

-- Payment History
DROP POLICY IF EXISTS "MasterAdmin view all payments" ON payment_history;
CREATE POLICY "MasterAdmin view all payments" ON payment_history FOR ALL USING (
    check_is_master_admin()
);

-- App Settings
DROP POLICY IF EXISTS "MasterAdmin manage settings" ON app_settings;
CREATE POLICY "MasterAdmin manage settings" ON app_settings FOR ALL USING (
    check_is_master_admin()
);
