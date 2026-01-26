-- Refine Appointment RLS for Provider-Level Isolation + Transfer Visibility
-- Rule:
-- 1. Admins see all appointments in their business
-- 2. Providers see ONLY their own appointments
-- 3. Providers see appointments that are currently being TRANSFERRED to them

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
) WITH CHECK (
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
