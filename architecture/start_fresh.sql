-- 1. Break the circular links in profiles first
UPDATE profiles SET business_id = NULL WHERE id IS NOT NULL;

-- 2. Now we can clear data safely
DELETE FROM transfer_requests WHERE id IS NOT NULL;
DELETE FROM appointments WHERE id IS NOT NULL;
DELETE FROM treatments WHERE id IS NOT NULL;
DELETE FROM clients WHERE id IS NOT NULL;

-- 3. Clear businesses
DELETE FROM businesses WHERE id IS NOT NULL;

-- 4. Clear other profiles
DELETE FROM profiles WHERE email != 'andre.ecprint@gmail.com';

-- 5. Re-initialize Andre
DO $$
DECLARE
    v_user_id UUID;
    v_business_id UUID;
BEGIN
    SELECT id INTO v_user_id FROM profiles WHERE email = 'andre.ecprint@gmail.com';
    
    IF v_user_id IS NOT NULL THEN
        -- Create a fresh business
        INSERT INTO businesses (name, owner_id)
        VALUES ('Abigails Nail Salon', v_user_id)
        RETURNING id INTO v_business_id;
        
        -- Reset Andre to Admin and link to fresh business
        UPDATE profiles 
        SET role = 'Admin', 
            business_id = v_business_id
        WHERE id = v_user_id;
    END IF;
END $$;
