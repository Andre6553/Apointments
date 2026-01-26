-- Enable RLS on businesses
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;

-- Business View Policy: Admins/Staff can see their own business
DROP POLICY IF EXISTS "Business view policy" ON businesses;
CREATE POLICY "Business view policy" ON businesses
FOR SELECT USING (
    id = (SELECT business_id FROM profiles WHERE id = auth.uid())
    OR owner_id = auth.uid()
);

-- Profiles View Policy (Robust version)
DROP POLICY IF EXISTS "Profiles view policy" ON profiles;
CREATE POLICY "Profiles view policy" ON profiles
FOR SELECT USING (
    id = auth.uid() OR 
    business_id = (SELECT p.business_id FROM profiles p WHERE p.id = auth.uid())
);
