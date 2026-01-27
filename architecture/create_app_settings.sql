-- Create app_settings table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.app_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Allow everyone to read settings (needed for subscription page)
DROP POLICY IF EXISTS "Anyone can read app_settings" ON public.app_settings;
CREATE POLICY "Anyone can read app_settings" ON public.app_settings
    FOR SELECT USING (true);

-- Only master admin can update settings
DROP POLICY IF EXISTS "Master admin can update app_settings" ON public.app_settings;
CREATE POLICY "Master admin can update app_settings" ON public.app_settings
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() 
            AND role = 'MasterAdmin'
        )
    );

-- Insert default pricing if not exists
INSERT INTO public.app_settings (key, value) 
VALUES 
    ('pricing_admin', '{"monthly": 5, "yearly": 55}'::jsonb),
    ('pricing_provider', '{"monthly": 3, "yearly": 33}'::jsonb)
ON CONFLICT (key) DO NOTHING;
