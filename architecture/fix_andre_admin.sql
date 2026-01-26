-- 1. Ensure the user is an Admin
UPDATE profiles 
SET role = 'Admin' 
WHERE email = 'andre.ecprint@gmail.com';

-- 2. Check if this user has a business. If not, create one and link them.
DO $$
DECLARE
    v_user_id UUID;
    v_business_id UUID;
BEGIN
    SELECT id INTO v_user_id FROM profiles WHERE email = 'andre.ecprint@gmail.com';
    
    IF v_user_id IS NOT NULL THEN
        -- Check if they already have a business_id
        SELECT business_id INTO v_business_id FROM profiles WHERE id = v_user_id;
        
        IF v_business_id IS NULL THEN
            -- Create a new business for them
            INSERT INTO businesses (name, owner_id)
            VALUES ('Andre''s Organization', v_user_id)
            RETURNING id INTO v_business_id;
            
            -- link them
            UPDATE profiles SET business_id = v_business_id WHERE id = v_user_id;
        END IF;
    END IF;
END $$;

-- 3. Verify the final state
SELECT p.email, p.role, p.business_id, b.name as business_name 
FROM profiles p 
LEFT JOIN businesses b ON p.business_id = b.id 
WHERE p.email = 'andre.ecprint@gmail.com';
