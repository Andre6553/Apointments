
-- 1. Correct Appointment RLS to allow Transfers and Admin access
-- Existing policies are too restrictive.

-- Drop old policies
DROP POLICY IF EXISTS "Users can see appointments where they are assigned or origin." ON appointments;

-- New SELECT/UPDATE/FOR ALL policy
-- Users can manage appointments if:
-- a) They are the assigned provider
-- b) They are the origin provider (shifted_from)
-- c) They are the target of a PENDING transfer request for this appointment
-- d) They are an Admin (Andre)

CREATE POLICY "Appointments Management Policy" 
ON appointments FOR ALL USING (
    -- 1. Assigned or Origin
    auth.uid() = assigned_profile_id 
    OR auth.uid() = shifted_from_id
    -- 2. Target of a pending transfer (Receiver needs to see it to accept it)
    OR EXISTS (
        SELECT 1 FROM transfer_requests 
        WHERE transfer_requests.appointment_id = appointments.id 
        AND transfer_requests.receiver_id = auth.uid() 
        AND transfer_requests.status = 'pending'
    )
    -- 3. Admin Bypass
    OR EXISTS (
        SELECT 1 FROM profiles 
        WHERE profiles.id = auth.uid() AND (profiles.role = 'Admin' OR profiles.full_name ILIKE '%Andre%')
    )
);

-- 2. Ensure appointments are in realtime
ALTER PUBLICATION supabase_realtime ADD TABLE appointments;
-- Ignore error if already added
