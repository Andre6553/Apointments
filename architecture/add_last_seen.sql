-- Add last_seen to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ DEFAULT NOW();

-- Update last_seen whenever is_online is set to true
CREATE OR REPLACE FUNCTION update_last_seen()
RETURNS trigger AS $$
BEGIN
  IF NEW.is_online = true THEN
    NEW.last_seen := NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_update_last_seen ON profiles;
CREATE TRIGGER tr_update_last_seen
BEFORE UPDATE OF is_online ON profiles
FOR EACH ROW
EXECUTE FUNCTION update_last_seen();
