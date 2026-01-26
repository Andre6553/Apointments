-- 1. Create a SECURITY DEFINER function to bypass RLS when looking up the current user's business_id
-- This is the standard way to fix "Recursive RLS" in Supabase
CREATE OR REPLACE FUNCTION public.get_my_business_id()
RETURNS UUID AS $$
    SELECT business_id FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 2. Update Profiles Policy
DROP POLICY IF EXISTS "Profiles view policy" ON profiles;
DROP POLICY IF EXISTS "Profiles view policy" ON public.profiles;
CREATE POLICY "Profiles view policy" ON public.profiles
FOR SELECT USING (
    id = auth.uid() OR business_id = public.get_my_business_id()
);

-- 3. Update Businesses Policy
DROP POLICY IF EXISTS "Business view policy" ON businesses;
DROP POLICY IF EXISTS "Business view policy" ON public.businesses;
CREATE POLICY "Business view policy" ON public.businesses
FOR SELECT USING (
    id = public.get_my_business_id() OR owner_id = auth.uid()
);

-- 4. Update Clients Policy
DROP POLICY IF EXISTS "Clients are viewable by business members" ON clients;
DROP POLICY IF EXISTS "Business-wide client access" ON clients;
CREATE POLICY "Business-wide client access" ON public.clients
FOR ALL USING (
    business_id = public.get_my_business_id()
);

-- 5. Update Appointments Policy
DROP POLICY IF EXISTS "Appointments are viewable by business members" ON appointments;
DROP POLICY IF EXISTS "Business-wide appointment access" ON appointments;
CREATE POLICY "Business-wide appointment access" ON public.appointments
FOR ALL USING (
    business_id = public.get_my_business_id()
);
