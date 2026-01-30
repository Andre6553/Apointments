-- Drop previous attempts
DROP POLICY IF EXISTS "Staff can update points assigned to them" ON appointments;
DROP POLICY IF EXISTS "Staff can update organization appointments" ON appointments;

-- Allow staff to update any appointment within their own organization
-- This is critical for Reassignment (changing assigned_profile_id)
CREATE POLICY "Staff can update organization appointments"
ON appointments FOR UPDATE
USING (
  business_id IN (
    SELECT business_id FROM profiles WHERE id = auth.uid()
  )
)
WITH CHECK (
  business_id IN (
    SELECT business_id FROM profiles WHERE id = auth.uid()
  )
);
