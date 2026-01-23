-- Add whatsapp column to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS whatsapp TEXT;

-- Update the handle_new_user function to include whatsapp if it uses a trigger
-- Usually, the trigger function looks something like this:
/*
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
*/

-- Since I don't have the exact trigger function text, I'll provide a way to update it if it exists.
-- For now, adding the column is the first step.
