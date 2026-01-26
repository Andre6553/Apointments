-- Refine Client RLS to allow "Permission by Association"
-- A provider can see a client if:
-- 1. They are the owner_id (Standard)
-- 2. They are the assigned provider for ANY appointment with that client (New: Allows Forwards to work)
-- 3. They are an Admin in the business (Standard)

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
        )
    )
);

-- Also ensure transfer_requests are visible to involved parties
DROP POLICY IF EXISTS "Transfer requests isolation" ON transfer_requests;
CREATE POLICY "Transfer requests isolation" ON public.transfer_requests
FOR ALL USING (
    sender_id = auth.uid() OR receiver_id = auth.uid() OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'Admin'
);
