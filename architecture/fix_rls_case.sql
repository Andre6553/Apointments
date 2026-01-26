-- Make Admin check case-insensitive and robust
DROP POLICY IF EXISTS "Appointments management policy" ON appointments;

CREATE POLICY "Appointments management policy" ON appointments
FOR ALL USING (
    auth.uid() = assigned_profile_id 
    OR 
    auth.uid() = shifted_from_id
    OR 
    EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = auth.uid() 
        AND (role ILIKE 'Admin')
    )
);

-- Do the same for clients
DROP POLICY IF EXISTS "Clients management policy" ON clients;
CREATE POLICY "Clients management policy" ON clients
FOR ALL USING (
    auth.uid() = owner_id 
    OR 
    EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = auth.uid() 
        AND (role ILIKE 'Admin')
    )
);
