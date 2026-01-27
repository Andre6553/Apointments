-- Add reminder_sent column to appointments table
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN DEFAULT FALSE;

-- Index for performance (querying pending reminders)
CREATE INDEX IF NOT EXISTS idx_appointments_reminder_check 
ON appointments(status, reminder_sent, scheduled_start);
