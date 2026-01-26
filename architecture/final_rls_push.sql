-- Final Robust RLS for Businesses
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Business view policy" ON businesses;
CREATE POLICY "Business view policy" ON businesses
FOR SELECT USING (
    owner_id = auth.uid() OR 
    id IN (SELECT business_id FROM profiles WHERE id = auth.uid())
);

-- Ensure profiles view is also robust
DROP POLICY IF EXISTS "Profiles view policy" ON profiles;
CREATE POLICY "Profiles view policy" ON profiles
FOR SELECT USING (
    id = auth.uid() OR 
    business_id IN (SELECT p.business_id FROM profiles p WHERE p.id = auth.uid())
);
