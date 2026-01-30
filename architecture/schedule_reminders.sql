-- Extensions assumed enabled via Dashboard

-- Schedule the cron job to run every minute
-- Note: Replace PROJECT_REF and ANON_KEY with actual values if not using env vars safely
-- But since we are running this as a migration, we will use a dedicated function to keep it clean.

CREATE OR REPLACE FUNCTION trigger_process_reminders()
RETURNS void AS $$
DECLARE
  project_url text := 'https://wxwparezjiourhlvyalw.supabase.co';
  anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind4d3BhcmV6amlvdXJobHZ5YWx3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwNTY0MjgsImV4cCI6MjA4NDYzMjQyOH0.Y_oEM71fU4nczqueY8nEPkOW2z0-rW_ISFIwaZfiM-0';
BEGIN
  PERFORM net.http_post(
      url := project_url || '/functions/v1/process-reminders',
      headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || anon_key
      )
  );
END;
$$ LANGUAGE plpgsql;

-- Schedule it (Cron syntax: * * * * * = every minute)
SELECT cron.schedule(
  'process-reminders-job', -- unique name
  '* * * * *',             -- every minute
  'SELECT trigger_process_reminders()'
);
