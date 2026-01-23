-- Create working_hours table for service providers
CREATE TABLE IF NOT EXISTS working_hours (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    day_of_week INTEGER CHECK (day_of_week BETWEEN 0 AND 6) NOT NULL, -- 0 = Sunday
    start_time TIME NOT NULL DEFAULT '08:00:00',
    end_time TIME NOT NULL DEFAULT '17:00:00',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(profile_id, day_of_week)
);

-- Enable RLS
ALTER TABLE working_hours ENABLE ROW LEVEL SECURITY;

-- Policies: Everyone can read available shifts (for booking), only owner can edit
CREATE POLICY "Working hours are viewable by everyone." ON working_hours FOR SELECT USING (true);
CREATE POLICY "Users can manage their own working hours." ON working_hours FOR ALL USING (auth.uid() = profile_id);

-- Add some default working hours for existing users (optional, can be done via UI later)
-- Example: 8 AM to 5 PM for all providers on weekdays
-- This would need a background script or manual entry.
