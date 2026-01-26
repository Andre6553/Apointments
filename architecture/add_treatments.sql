-- 1. Add currency_symbol to profiles
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS currency_symbol TEXT DEFAULT '$';

-- 2. Create treatments table
CREATE TABLE IF NOT EXISTS treatments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    duration_minutes INTEGER NOT NULL DEFAULT 30,
    cost NUMERIC(10, 2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(profile_id, name)
);

-- Enable RLS for treatments
ALTER TABLE treatments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own treatments." 
ON treatments FOR ALL USING (auth.uid() = profile_id);

-- 3. Update appointments for revenue tracking
ALTER TABLE appointments
ADD COLUMN IF NOT EXISTS treatment_name TEXT,
ADD COLUMN IF NOT EXISTS cost NUMERIC(10, 2) DEFAULT 0;

-- Backfill: Refresh existing views if any (not needed for basic table add)
