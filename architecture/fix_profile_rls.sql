-- 1. Drop existing profile policies to avoid conflicts
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Profiles are viewable by business members" ON profiles;
DROP POLICY IF EXISTS "Admins can manage business staff" ON profiles;

-- 2. Viewing Policy: See your colleagues or yourself
CREATE POLICY "Profiles view policy" ON profiles
FOR SELECT USING (
    business_id = (SELECT business_id FROM profiles WHERE id = auth.uid())
    OR id = auth.uid()
);

-- 3. Admin Management Policy: Admins can update staff in their business
-- Specifically allows them to set business_id to NULL (removing them)
CREATE POLICY "Admin staff management policy" ON profiles
FOR UPDATE USING (
    EXISTS (
        SELECT 1 FROM profiles AS admins 
        WHERE admins.id = auth.uid() 
        AND (admins.role ILIKE 'Admin')
        AND admins.business_id = profiles.business_id
    )
) WITH CHECK (
    -- Can only move them into your business or remove them (NULL)
    (business_id = (SELECT business_id FROM profiles WHERE id = auth.uid()) OR business_id IS NULL)
);

-- 4. User Self-Update Policy 
CREATE POLICY "User self-update policy" ON profiles
FOR UPDATE USING (auth.uid() = id)
WITH CHECK (
    auth.uid() = id 
    AND (
        -- Protect sensitive fields from self-escalation
        (business_id IS NOT DISTINCT FROM (SELECT business_id FROM profiles WHERE id = auth.uid()))
        AND (role IS NOT DISTINCT FROM (SELECT role FROM profiles WHERE id = auth.uid()))
    )
);
