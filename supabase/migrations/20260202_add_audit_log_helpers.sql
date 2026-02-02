
-- Helper to get table size
CREATE OR REPLACE FUNCTION get_table_size(table_name text)
RETURNS text AS $$
BEGIN
    RETURN pg_size_pretty(pg_total_relation_size(table_name));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper to get table row count
CREATE OR REPLACE FUNCTION get_table_count(table_name text)
RETURNS bigint AS $$
DECLARE
    row_count bigint;
BEGIN
    EXECUTE 'SELECT count(*) FROM ' || quote_ident(table_name) INTO row_count;
    RETURN row_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper to get recent audit logs (bypassing RLS)
CREATE OR REPLACE FUNCTION get_recent_audit_logs(log_limit int DEFAULT 50000)
RETURNS SETOF audit_logs AS $$
BEGIN
    RETURN QUERY SELECT * FROM audit_logs ORDER BY ts DESC LIMIT log_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper to purge audit logs (keep recent N days or all)
CREATE OR REPLACE FUNCTION purge_audit_logs(keep_last_n_days int DEFAULT 0)
RETURNS void AS $$
BEGIN
    IF keep_last_n_days > 0 THEN
        DELETE FROM audit_logs WHERE ts < now() - (keep_last_n_days || ' days')::interval;
    ELSE
        TRUNCATE TABLE audit_logs;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper to get total database size
CREATE OR REPLACE FUNCTION get_project_db_size()
RETURNS text AS $$
BEGIN
    RETURN pg_size_pretty(pg_database_size(current_database()));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
