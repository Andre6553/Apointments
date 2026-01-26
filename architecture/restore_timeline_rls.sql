-- RESTORE VISIBILITY: Timeline Data (Working Hours, Breaks, Treatments)
-- These tables had RLS enabled but no policies, hiding data from the UI

-- 1. WORKING HOURS
DO $$ 
DECLARE 
    pol record;
BEGIN
    FOR pol IN (SELECT policyname FROM pg_policies WHERE tablename = 'working_hours') 
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.working_hours', pol.policyname);
    END LOOP;
END $$;

CREATE POLICY "strict_working_hours_isolation" ON public.working_hours
FOR ALL USING (
    profile_id = auth.uid() OR 
    (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'Admin') AND
        (SELECT business_id FROM public.profiles WHERE id = public.working_hours.profile_id) = public.get_my_business_id()
    )
);

-- 2. BREAKS
DO $$ 
DECLARE 
    pol record;
BEGIN
    FOR pol IN (SELECT policyname FROM pg_policies WHERE tablename = 'breaks') 
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.breaks', pol.policyname);
    END LOOP;
END $$;

CREATE POLICY "strict_breaks_isolation" ON public.breaks
FOR ALL USING (
    profile_id = auth.uid() OR 
    (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'Admin') AND
        (SELECT business_id FROM public.profiles WHERE id = public.breaks.profile_id) = public.get_my_business_id()
    )
);

-- 3. TREATMENTS
DO $$ 
DECLARE 
    pol record;
BEGIN
    FOR pol IN (SELECT policyname FROM pg_policies WHERE tablename = 'treatments') 
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.treatments', pol.policyname);
    END LOOP;
END $$;

CREATE POLICY "strict_treatments_isolation" ON public.treatments
FOR ALL USING (
    profile_id = auth.uid() OR 
    (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'Admin') AND
        (SELECT business_id FROM public.profiles WHERE id = public.treatments.profile_id) = public.get_my_business_id()
    )
);
