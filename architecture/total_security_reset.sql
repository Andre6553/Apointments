-- FINAL SECURITY HARDENING: Appointments, Clients, Profiles
-- This script wipes all existing policies and reapplies the correct ones from scratch

-- 1. APPOINTMENTS
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments FORCE ROW LEVEL SECURITY;
DO $$ 
DECLARE 
    pol record;
BEGIN
    FOR pol IN (SELECT policyname FROM pg_policies WHERE tablename = 'appointments') 
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.appointments', pol.policyname);
    END LOOP;
END $$;

CREATE POLICY "strict_appointment_isolation" ON public.appointments
FOR ALL USING (
    business_id = public.get_my_business_id() AND (
        assigned_profile_id = auth.uid() OR 
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND role = 'Admin' 
            AND business_id = public.appointments.business_id
        ) OR
        EXISTS (
            SELECT 1 FROM public.transfer_requests
            WHERE appointment_id = public.appointments.id 
            AND receiver_id = auth.uid() 
            AND status = 'pending'
        )
    )
);

-- 2. CLIENTS
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients FORCE ROW LEVEL SECURITY;
DO $$ 
DECLARE 
    pol record;
BEGIN
    FOR pol IN (SELECT policyname FROM pg_policies WHERE tablename = 'clients') 
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.clients', pol.policyname);
    END LOOP;
END $$;

CREATE POLICY "strict_client_isolation" ON public.clients
FOR ALL USING (
    business_id = public.get_my_business_id() AND (
        owner_id = auth.uid() OR 
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND role = 'Admin'
            AND business_id = public.clients.business_id
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

-- 3. PROFILES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;
DO $$ 
DECLARE 
    pol record;
BEGIN
    FOR pol IN (SELECT policyname FROM pg_policies WHERE tablename = 'profiles') 
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles', pol.policyname);
    END LOOP;
END $$;

-- Provider can see themselves or anyone in their business
CREATE POLICY "strict_profile_isolation" ON public.profiles
FOR SELECT USING (
    id = auth.uid() OR (
        business_id IS NOT NULL AND 
        business_id = public.get_my_business_id()
    )
);

-- Admin can manage anyone in their business
CREATE POLICY "strict_profile_management" ON public.profiles
FOR UPDATE USING (
    id = auth.uid() OR (
        business_id = public.get_my_business_id() AND 
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND role = 'Admin'
        )
    )
);

-- 4. TRANSFER REQUESTS
ALTER TABLE public.transfer_requests ENABLE ROW LEVEL SECURITY;
DO $$ 
DECLARE 
    pol record;
BEGIN
    FOR pol IN (SELECT policyname FROM pg_policies WHERE tablename = 'transfer_requests') 
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.transfer_requests', pol.policyname);
    END LOOP;
END $$;

CREATE POLICY "strict_transfer_isolation" ON public.transfer_requests
FOR ALL USING (
    sender_id = auth.uid() OR 
    receiver_id = auth.uid() OR 
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role = 'Admin' 
        AND business_id = (SELECT business_id FROM public.profiles WHERE id = auth.uid())
    )
);
