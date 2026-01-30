-- Create Appointment Logs table for auditing
CREATE TABLE IF NOT EXISTS appointment_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL,
    actor_id UUID REFERENCES auth.users(id),
    action_type TEXT NOT NULL, -- 'DELETE', 'RESCHEDULE', 'CANCEL'
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE appointment_logs ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can insert logs for their business" ON appointment_logs
    FOR INSERT WITH CHECK (
        business_id IN (
            SELECT business_id FROM profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "Admins can view logs for their business" ON appointment_logs
    FOR SELECT USING (
        business_id IN (
            SELECT business_id FROM profiles WHERE id = auth.uid()
        )
        AND (
            SELECT role FROM profiles WHERE id = auth.uid()
        ) IN ('Admin', 'MasterAdmin', 'Owner')
    );
