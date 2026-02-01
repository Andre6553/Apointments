
-- Add heartbeat column to track when the local 'engine' was last active
ALTER TABLE business_settings 
ADD COLUMN IF NOT EXISTS last_heartbeat TIMESTAMPTZ;

-- Policy (re-affirm access, though existing policy should cover updates)
-- No changes needed to policy if it allows "ALL" or "UPDATE" based on business_id.
