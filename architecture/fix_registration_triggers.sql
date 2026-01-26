-- 1. Correct the handle_new_user function (Ensure columns match)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, whatsapp)
  VALUES (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'role',
    new.raw_user_meta_data->>'whatsapp'
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Correct the handle_new_admin_business function
-- Switch to AFTER INSERT to avoid FK issues, then update the profile
CREATE OR REPLACE FUNCTION public.handle_new_admin_business()
RETURNS trigger AS $$
DECLARE
    v_business_id UUID;
BEGIN
  -- Only for Admins who don't have a business_id yet
  IF NEW.role = 'Admin' AND NEW.business_id IS NULL THEN
    -- Create the business
    INSERT INTO public.businesses (name, owner_id)
    VALUES (COALESCE(NEW.full_name, 'New Admin') || '''s Business', NEW.id)
    RETURNING id INTO v_business_id;

    -- Update the profile that was just created
    UPDATE public.profiles 
    SET business_id = v_business_id 
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Re-attach the trigger as AFTER INSERT
DROP TRIGGER IF EXISTS tr_new_admin_business ON public.profiles;
CREATE TRIGGER tr_new_admin_business
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_admin_business();
