-- Schedule the Edge Function to run every 10 minutes
-- Note: Requires pg_cron extension to be enabled in Supabase Dashboard
-- If net extension is not enabled, this will fail.

-- Enable extensions if possible (usually requires superuser, might fail if not)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule the job
-- This calls the Edge Function using pg_net
SELECT cron.schedule(
    'process-whatsapp-reminders', -- Job name
    '*/10 * * * *',              -- Every 10 minutes
    $$
    SELECT
        net.http_post(
            url:='https://wxwparezjiourhlvyalw.supabase.co/functions/v1/process-scheduled-tasks',
            headers:='{"Content-Type": "application/json", "Authorization": "Bearer [YOUR_SERVICE_ROLE_KEY]"}'::jsonb,
            body:='{}'::jsonb
        ) as request_id;
    $$
);

-- Note: The User needs to replace [YOUR_SERVICE_ROLE_KEY] with the actual key in the dashboard or I can try to interpolate it if we run it via script.
-- However, putting secrets in SQL migrations is risky.
-- Better approach: The backend redundancy is "optional" until they deploy the edge function.
-- I will provide this SQL but warn about the Key.
