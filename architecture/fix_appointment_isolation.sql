-- Tighten Appointment RLS for Provider-Level Isolation
-- Rule:
-- 1. Admins see all appointments in their business
-- 2. Providers see ONLY their own appointments within their business

DROP POLICY IF EXISTS "Business Isolation" ON public.appointments;
DROP POLICY IF EXISTS "Provider Isolation" ON public.appointments;

CREATE POLICY "Granular appointment access policy" ON public.appointments
FOR ALL USING (
    business_id = public.get_my_business_id() AND (
        assigned_profile_id = auth.uid() OR 
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND role = 'Admin'
        )
    )
) WITH CHECK (
    business_id = public.get_my_business_id() AND (
        assigned_profile_id = auth.uid() OR 
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND role = 'Admin'
        )
    )
);
