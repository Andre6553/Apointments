ALTER TABLE profiles 
ADD COLUMN is_online BOOLEAN DEFAULT false;

-- Allow users to update their own online status (covered by existing policy, but good to note)
-- "Users can update own profile." ON profiles FOR UPDATE USING (auth.uid() = id);
