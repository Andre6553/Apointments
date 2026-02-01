
-- Create a table to store per-business configuration
CREATE TABLE IF NOT EXISTS business_settings (
    business_id UUID PRIMARY KEY,
    demo_mode_enabled BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Turn on RLS
ALTER TABLE business_settings ENABLE ROW LEVEL SECURITY;

-- Allow read/write for authenticated users belonging to that business
CREATE POLICY "Allow access to own business settings" ON business_settings
    FOR ALL
    USING (business_id IN (
        SELECT business_id FROM profiles WHERE id = auth.uid()
    ))
    WITH CHECK (business_id IN (
        SELECT business_id FROM profiles WHERE id = auth.uid()
    ));

-- Grant access
GRANT ALL ON business_settings TO authenticated;
GRANT ALL ON business_settings TO service_role;
