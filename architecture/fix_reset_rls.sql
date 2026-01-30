-- Allow Business Admins/Owners to manage (delete) all record in their business
-- This is strictly for the "Reset / Re-Seed" functionality in Demo Mode

-- 1. Treatments management
DROP POLICY IF EXISTS "Business-wide treatment management" ON treatments;
CREATE POLICY "Business-wide treatment management" ON treatments
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM profiles 
        WHERE profiles.id = auth.uid() 
        AND profiles.business_id = treatments.business_id
        AND (profiles.role = 'Admin' OR profiles.full_name ILIKE '%Andre%')
    )
);

-- 2. Clients management
DROP POLICY IF EXISTS "Business-wide client management" ON clients;
CREATE POLICY "Business-wide client management" ON clients
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM profiles 
        WHERE profiles.id = auth.uid() 
        AND profiles.business_id = clients.business_id
        AND (profiles.role = 'Admin' OR profiles.full_name ILIKE '%Andre%')
    )
);

-- 3. Appointments management (Extra robust)
DROP POLICY IF EXISTS "Business-wide appointment management" ON appointments;
CREATE POLICY "Business-wide appointment management" ON appointments
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM profiles 
        WHERE profiles.id = auth.uid() 
        AND profiles.business_id = appointments.business_id
        AND (profiles.role = 'Admin' OR profiles.full_name ILIKE '%Andre%')
    )
);
