SELECT 
    tgname AS trigger_name,
    relname AS table_name,
    proname AS function_name,
    prosrc AS function_definition
FROM pg_trigger
JOIN pg_class ON pg_trigger.tgrelid = pg_class.oid
JOIN pg_proc ON pg_trigger.tgfoid = pg_proc.oid
WHERE relname IN ('users', 'profiles')
AND tgname NOT LIKE 'pg_%';
