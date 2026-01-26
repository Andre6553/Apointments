-- FIX: Tighten Profile RLS to prevent cross-tenant leakage
-- This is critical to ensure organizations are completely invisible to each other

-- First, drop all existing policies on profiles to start fresh
DROP POLICY IF EXISTS "Profiles view policy" ON public.profiles;
DROP POLICY IF EXISTS "Admin staff management policy" ON public.profiles;
DROP POLICY IF EXISTS "Admin profile view policy" ON public.profiles;

-- 1. SELECT Policy:
-- - You can ALWAYS see your own profile
-- - You can see profiles in the SAME business as you
-- - (Crucial) You CANNOT see profiles from other businesses
-- - (Crucial) You CANNOT see "homeless" profiles (business_id is NULL) unless they are YOU
CREATE POLICY "Tenant Profile Isolation" ON public.profiles
FOR SELECT USING (
    id = auth.uid() OR (
        business_id IS NOT NULL AND 
        business_id = public.get_my_business_id()
    )
);

-- 2. UPDATE Policy:
-- - You can update your own profile
-- - Admins can update profiles WITHIN their own business
CREATE POLICY "Tenant Profile Management" ON public.profiles
FOR UPDATE USING (
    id = auth.uid() OR (
        business_id = public.get_my_business_id() AND 
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND role = 'Admin'
        )
    )
) WITH CHECK (
    id = auth.uid() OR (
        business_id = public.get_my_business_id() AND 
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND role = 'Admin'
        )
    )
);

-- Note: The RPC `find_profile_by_email` still works for Admins to search "homeless" users 
-- because it is SECURITY DEFINER, but it won't leak "homeless" users into the general UI.
