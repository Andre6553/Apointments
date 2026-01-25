-- Add indexes to optimize common filtering and join patterns
-- 1. Appointments: Optimize by provider, date, and status
CREATE INDEX IF NOT EXISTS idx_appointments_assigned_profile_id ON appointments(assigned_profile_id);
CREATE INDEX IF NOT EXISTS idx_appointments_scheduled_start ON appointments(scheduled_start);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);
CREATE INDEX IF NOT EXISTS idx_appointments_shifted_from_id ON appointments(shifted_from_id);

-- Composite index for the specific query in checkConflicts
CREATE INDEX IF NOT EXISTS idx_appointments_validation 
ON appointments(assigned_profile_id, status, scheduled_start);

-- 2. Clients: Optimize owner lookups
CREATE INDEX IF NOT EXISTS idx_clients_owner_id ON clients(owner_id);

-- 3. Breaks: Optimize provider lookups
CREATE INDEX IF NOT EXISTS idx_breaks_profile_id ON breaks(profile_id);
CREATE INDEX IF NOT EXISTS idx_breaks_day_of_week ON breaks(day_of_week);

-- 4. Working Hours: Optimize provider lookups
CREATE INDEX IF NOT EXISTS idx_working_hours_profile_id ON working_hours(profile_id);
CREATE INDEX IF NOT EXISTS idx_working_hours_day_of_week ON working_hours(day_of_week);

-- Analyze tables to update statistics
ANALYZE appointments;
ANALYZE clients;
ANALYZE breaks;
ANALYZE working_hours;
