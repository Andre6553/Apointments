-- Allow Admins to update the owner_id of any client within their business
DROP POLICY IF EXISTS "Admin client management policy" ON public.clients;
CREATE POLICY "Admin client management policy" ON public.clients
FOR UPDATE USING (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role = 'Admin'
        AND business_id = public.clients.business_id
    )
) WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role = 'Admin'
        AND business_id = public.clients.business_id
    )
);
