-- 1. Create a SECURITY DEFINER function for staff lookup
-- This allows admins to find users by email even if they aren't in their business yet
CREATE OR REPLACE FUNCTION public.find_profile_by_email(email_query TEXT)
RETURNS JSONB AS $$
DECLARE
    v_profile JSONB;
BEGIN
    -- Only allow Admins to perform this search
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role = 'Admin'
    ) THEN
        RAISE EXCEPTION 'Only Administrators can search for profiles.';
    END IF;

    SELECT jsonb_build_object(
        'id', id,
        'full_name', full_name,
        'role', role,
        'email', email
    ) INTO v_profile
    FROM public.profiles
    WHERE email = email_query
    LIMIT 1;

    RETURN v_profile;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Update Profiles UPDATE policy
-- Allow Admins to link users who have NO business_id yet
DROP POLICY IF EXISTS "Admin staff management policy" ON public.profiles;
CREATE POLICY "Admin staff management policy" ON public.profiles
FOR UPDATE USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'Admin'
) WITH CHECK (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'Admin'
);

-- Note: The SELECT policy remains restrictive, but the RPC handles the initial lookup.
