-- Add requires_attention column to appointments for flagging transferred appointments
-- that need admin attention (e.g., due to provider schedule changes)

ALTER TABLE appointments 
ADD COLUMN IF NOT EXISTS requires_attention BOOLEAN DEFAULT FALSE;

-- Optional: Add an index for quick lookups of flagged appointments
CREATE INDEX IF NOT EXISTS idx_appointments_requires_attention 
ON appointments(requires_attention) 
WHERE requires_attention = TRUE;
