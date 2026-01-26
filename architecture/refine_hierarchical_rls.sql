-- Refine Appointments RLS for Hierarchy
DROP POLICY IF EXISTS "Business-wide appointment access" ON appointments;

CREATE POLICY "Appointments hierarchical access" ON appointments
FOR ALL USING (
    -- 1. Admins see everything in the business
    EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = auth.uid() 
        AND (role ILIKE 'Admin')
        AND business_id = appointments.business_id
    )
    OR
    -- 2. Providers see only their own assigned appointments
    (
        auth.uid() = assigned_profile_id 
        OR 
        auth.uid() = shifted_from_id
    )
);

-- Refine Clients RLS for Hierarchy
DROP POLICY IF EXISTS "Business-wide client access" ON clients;

CREATE POLICY "Clients hierarchical access" ON clients
FOR ALL USING (
    -- 1. Admins see everything in the business
    EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = auth.uid() 
        AND (role ILIKE 'Admin')
        AND business_id = clients.business_id
    )
    OR
    -- 2. Providers see only their own clients
    auth.uid() = owner_id
);
