-- FIX: Infinite Recursion in profiles policy
-- The problem was querying the profiles table inside the profiles policy
-- We use SECURITY DEFINER to break the loop

-- 1. Create a secure helper that bypasses RLS (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.get_my_business_id()
RETURNS UUID AS $$
BEGIN
    RETURN (SELECT business_id FROM public.profiles WHERE id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Re-apply the isolation policies using the helper
-- This helper is "safe" because it's SECURITY DEFINER, stopping the loop

DROP POLICY IF EXISTS "Tenant Profile Isolation" ON public.profiles;
CREATE POLICY "Tenant Profile Isolation" ON public.profiles
FOR SELECT USING (
    id = auth.uid() OR (
        business_id IS NOT NULL AND 
        business_id = public.get_my_business_id()
    )
);

-- Re-apply Management Policy as well for consistency
DROP POLICY IF EXISTS "Tenant Profile Management" ON public.profiles;
CREATE POLICY "Tenant Profile Management" ON public.profiles
FOR UPDATE USING (
    id = auth.uid() OR (
        business_id = public.get_my_business_id() AND 
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND role = 'Admin'
        )
    )
) WITH CHECK (
    id = auth.uid() OR (
        business_id = public.get_my_business_id() AND 
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND role = 'Admin'
        )
    )
);

-- Ensure other tables use the helper too
DROP POLICY IF EXISTS "Granular appointment access policy" ON public.appointments;
CREATE POLICY "Granular appointment access policy" ON public.appointments
FOR ALL USING (
    business_id = public.get_my_business_id() AND (
        assigned_profile_id = auth.uid() OR 
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND role = 'Admin'
        ) OR
        EXISTS (
            SELECT 1 FROM public.transfer_requests
            WHERE appointment_id = public.appointments.id 
            AND receiver_id = auth.uid() 
            AND status = 'pending'
        )
    )
);

DROP POLICY IF EXISTS "Granular client access policy" ON public.clients;
CREATE POLICY "Granular client access policy" ON public.clients
FOR ALL USING (
    business_id = public.get_my_business_id() AND (
        owner_id = auth.uid() OR 
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND role = 'Admin'
        ) OR
        EXISTS (
            SELECT 1 FROM public.appointments
            WHERE client_id = public.clients.id AND assigned_profile_id = auth.uid()
        ) OR
        EXISTS (
            SELECT 1 FROM public.transfer_requests tr
            JOIN public.appointments a ON tr.appointment_id = a.id
            WHERE a.client_id = public.clients.id 
            AND tr.receiver_id = auth.uid() 
            AND tr.status = 'pending'
        )
    )
);
