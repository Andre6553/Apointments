-- Add UPDATE policy for businesses
-- Allows the owner (Admin) to update their own business name
DROP POLICY IF EXISTS "Business update policy" ON public.businesses;
CREATE POLICY "Business update policy" ON public.businesses
FOR UPDATE USING (
    owner_id = auth.uid()
) WITH CHECK (
    owner_id = auth.uid()
);

-- Also ensure Admins who are linked but not owners can potentially update (if that's desired)
-- For now, let's stick to owners as the most secure path.
