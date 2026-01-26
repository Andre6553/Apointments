-- Refine Client RLS for Provider-Level Isolation + Transfer Visibility
-- Rule:
-- 1. Admins see all clients in their business
-- 2. Providers see ONLY their own clients
-- 3. Providers see clients linked to appointments currently being TRANSFERRED to them

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
) WITH CHECK (
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
