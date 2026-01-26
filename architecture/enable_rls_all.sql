-- CRITICAL: Explicitly enable RLS on all tenant-aware tables
-- Policies alone are not enough if RLS is not ENABLED

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treatments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.working_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.breaks ENABLE ROW LEVEL SECURITY;

-- FORCE RLS for good measure (covers cases where user is owner)
ALTER TABLE public.appointments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.clients FORCE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;

-- 1. Tighten Appointment RLS (Provider-Level Isolation)
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

-- 2. Tighten Client RLS (Provider-Level Isolation)
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

-- 3. Tighten Profile RLS (Tenant-Level Isolation)
DROP POLICY IF EXISTS "Tenant Profile Isolation" ON public.profiles;
CREATE POLICY "Tenant Profile Isolation" ON public.profiles
FOR SELECT USING (
    id = auth.uid() OR (
        business_id IS NOT NULL AND 
        business_id = (SELECT business_id FROM public.profiles WHERE id = auth.uid())
    )
);
