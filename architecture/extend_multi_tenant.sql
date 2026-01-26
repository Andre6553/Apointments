-- 1. Add business_id to remaining tables
ALTER TABLE public.treatments ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES businesses(id);
ALTER TABLE public.working_hours ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES businesses(id);
ALTER TABLE public.breaks ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES businesses(id);

-- 2. Update existing rows (if any) to match their profile's business
UPDATE public.treatments t SET business_id = p.business_id FROM public.profiles p WHERE t.profile_id = p.id AND t.business_id IS NULL;
UPDATE public.working_hours w SET business_id = p.business_id FROM public.profiles p WHERE w.profile_id = p.id AND w.business_id IS NULL;
UPDATE public.breaks b SET business_id = p.business_id FROM public.profiles p WHERE b.profile_id = p.id AND b.business_id IS NULL;

-- 3. RLS for Treatments
ALTER TABLE public.treatments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Treatments view policy" ON treatments;
CREATE POLICY "Treatments view policy" ON treatments
FOR SELECT USING (
    business_id = public.get_my_business_id()
);
DROP POLICY IF EXISTS "Treatments management policy" ON treatments;
CREATE POLICY "Treatments management policy" ON treatments
FOR ALL USING (
    profile_id = auth.uid()
) WITH CHECK (
    profile_id = auth.uid() AND business_id = public.get_my_business_id()
);

-- 4. RLS for Working Hours
ALTER TABLE public.working_hours ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Working hours view policy" ON working_hours;
CREATE POLICY "Working hours view policy" ON working_hours
FOR SELECT USING (
    business_id = public.get_my_business_id()
);
DROP POLICY IF EXISTS "Working hours manage policy" ON working_hours;
CREATE POLICY "Working hours manage policy" ON working_hours
FOR ALL USING (
    profile_id = auth.uid()
) WITH CHECK (
    profile_id = auth.uid() AND business_id = public.get_my_business_id()
);

-- 5. RLS for Breaks
ALTER TABLE public.breaks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Breaks view policy" ON breaks;
CREATE POLICY "Breaks view policy" ON breaks
FOR SELECT USING (
    business_id = public.get_my_business_id()
);
DROP POLICY IF EXISTS "Breaks manage policy" ON breaks;
CREATE POLICY "Breaks manage policy" ON breaks
FOR ALL USING (
    profile_id = auth.uid()
) WITH CHECK (
    profile_id = auth.uid() AND business_id = public.get_my_business_id()
);

-- 6. Triggers for Automatic Association (like we did for clients/appointments)
CREATE OR REPLACE FUNCTION stamp_business_id_generic()
RETURNS trigger AS $$
BEGIN
  IF NEW.business_id IS NULL THEN
    NEW.business_id := (SELECT business_id FROM public.profiles WHERE id = auth.uid());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_stamp_treatment_business ON treatments;
CREATE TRIGGER tr_stamp_treatment_business BEFORE INSERT ON treatments FOR EACH ROW EXECUTE FUNCTION stamp_business_id_generic();

DROP TRIGGER IF EXISTS tr_stamp_working_hours_business ON working_hours;
CREATE TRIGGER tr_stamp_working_hours_business BEFORE INSERT ON working_hours FOR EACH ROW EXECUTE FUNCTION stamp_business_id_generic();

DROP TRIGGER IF EXISTS tr_stamp_breaks_business ON breaks;
CREATE TRIGGER tr_stamp_breaks_business BEFORE INSERT ON breaks FOR EACH ROW EXECUTE FUNCTION stamp_business_id_generic();
