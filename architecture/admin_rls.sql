-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Users can only see their own clients." ON clients;
DROP POLICY IF EXISTS "Users can see appointments where they are assigned or origin." ON appointments;

-- Create enhanced policies for Clients
CREATE POLICY "Clients management policy" ON clients
FOR ALL USING (
    auth.uid() = owner_id 
    OR 
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'Admin')
);

-- Create enhanced policies for Appointments
CREATE POLICY "Appointments management policy" ON appointments
FOR ALL USING (
    auth.uid() = assigned_profile_id 
    OR 
    auth.uid() = shifted_from_id
    OR 
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'Admin')
);
