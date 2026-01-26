SELECT 
    relname as table_name, 
    relrowsecurity as rls_enabled,
    relforcerowsecurity as force_rls
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND relname = 'appointments';
