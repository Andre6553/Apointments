-- 1. Enable RLS on businesses if not already
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;

-- 2. Businesses View Policy: Anyone in the business can see their own business
DROP POLICY IF EXISTS "Business view policy" ON businesses;
CREATE POLICY "Business view policy" ON businesses
FOR SELECT USING (
    id = (SELECT business_id FROM profiles WHERE id = auth.uid())
    OR owner_id = auth.uid()
);

-- 3. Treatments View Policy: Same logic
ALTER TABLE treatments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Treatments view policy" ON treatments;
CREATE POLICY "Treatments view policy" ON treatments
FOR SELECT USING (
    business_id = (SELECT business_id FROM profiles WHERE id = auth.uid())
);
