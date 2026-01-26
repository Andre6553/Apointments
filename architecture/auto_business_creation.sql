-- Trigger to automatically create a business for new Admins if they don't have one
CREATE OR REPLACE FUNCTION public.handle_new_admin_business()
RETURNS trigger AS $$
DECLARE
    new_business_id UUID;
BEGIN
    -- Only for Admins who don't have a business_id yet
    IF (NEW.role = 'Admin' AND NEW.business_id IS NULL) THEN
        -- Create a new business named after the person for now
        INSERT INTO public.businesses (name, owner_id)
        VALUES (NEW.full_name || '''s Business', NEW.id)
        RETURNING id INTO new_business_id;
        
        -- Update the profile with the new business_id
        NEW.business_id := new_business_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger on the profiles table
DROP TRIGGER IF EXISTS tr_new_admin_business ON public.profiles;
CREATE TRIGGER tr_new_admin_business
    BEFORE INSERT ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_admin_business();
