SELECT 
    schemaname, 
    tablename, 
    policyname, 
    qual 
FROM pg_policies 
WHERE tablename IN ('working_hours', 'breaks', 'treatments');
