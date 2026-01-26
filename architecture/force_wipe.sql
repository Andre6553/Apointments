-- Drop triggers
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS tr_new_admin_business ON public.profiles;

-- Force wipe everything
UPDATE public.profiles SET business_id = NULL WHERE id IS NOT NULL;
DELETE FROM public.appointments WHERE id IS NOT NULL;
DELETE FROM public.transfer_requests WHERE id IS NOT NULL;
DELETE FROM public.clients WHERE id IS NOT NULL;
DELETE FROM public.treatments WHERE id IS NOT NULL;
DELETE FROM public.businesses WHERE id IS NOT NULL;
DELETE FROM public.profiles WHERE id IS NOT NULL;
