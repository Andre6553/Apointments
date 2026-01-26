SELECT 
    schemaname, 
    tablename, 
    policyname, 
    qual 
FROM pg_policies 
WHERE tablename = 'profiles';

SELECT pg_get_functiondef(p.oid) 
FROM pg_proc p 
JOIN pg_namespace n ON p.pronamespace = n.oid 
WHERE n.nspname = 'public' AND p.proname = 'get_my_business_id';
