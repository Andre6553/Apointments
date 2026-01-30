-- Allow staff to update any appointment within their own organization
-- This is needed for Workload Balancer identifying and shifting appointments
DROP POLICY IF EXISTS "Staff can update points assigned to them" ON appointments;

-- New generic "Staff Update" policy
CREATE POLICY "Staff can update organization appointments"
ON appointments FOR UPDATE
USING (
  auth.uid() IN (
    SELECT id FROM profiles 
    WHERE business_id = (
      SELECT business_id FROM profiles WHERE id = appointments.assigned_profile_id
    )
  )
)
WITH CHECK (
  auth.uid() IN (
    SELECT id FROM profiles 
    WHERE business_id = (
      SELECT business_id FROM profiles WHERE id = appointments.assigned_profile_id
    )
  )
);
