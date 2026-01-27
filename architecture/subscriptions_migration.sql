-- Subscriptions Migration

-- 1. Create Subscriptions Table
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    business_id UUID REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
    tier TEXT DEFAULT 'trial' CHECK (tier IN ('trial', 'monthly', 'yearly')),
    role TEXT CHECK (role IN ('Admin', 'Provider')),
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled')),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(profile_id, business_id)
);

-- 2. Create Payment History Table
CREATE TABLE IF NOT EXISTS payment_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    business_id UUID REFERENCES businesses(id) ON DELETE SET NULL,
    amount DECIMAL(10, 2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',
    payment_status TEXT NOT NULL,
    payfast_payment_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Enable RLS
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_history ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies
-- Users can view their own subscriptions
CREATE POLICY "Users can view their own subscriptions" 
ON subscriptions FOR SELECT 
USING (auth.uid() = profile_id);

-- Admins can view all subscriptions for their business
CREATE POLICY "Admins can view all business subscriptions" 
ON subscriptions FOR SELECT 
USING (
    EXISTS (
        SELECT 1 FROM profiles 
        WHERE profiles.id = auth.uid() 
        AND profiles.business_id = subscriptions.business_id 
        AND profiles.role = 'Admin'
    )
);

-- Payment history viewable by the user who paid
CREATE POLICY "Users can view their own payment history" 
ON payment_history FOR SELECT 
USING (auth.uid() = profile_id);

-- 5. Trigger for New Trial
CREATE OR REPLACE FUNCTION create_trial_subscription()
RETURNS trigger AS $$
BEGIN
    INSERT INTO subscriptions (profile_id, business_id, tier, role, expires_at)
    VALUES (
        NEW.id, 
        NEW.business_id, 
        'trial', 
        CASE 
            WHEN NEW.role = 'Admin' THEN 'Admin' 
            ELSE 'Provider' 
        END,
        NOW() + INTERVAL '10 days'
    )
    ON CONFLICT (profile_id, business_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_create_trial ON profiles;
CREATE TRIGGER tr_create_trial 
AFTER INSERT OR UPDATE OF business_id ON profiles
FOR EACH ROW 
WHEN (NEW.business_id IS NOT NULL)
EXECUTE FUNCTION create_trial_subscription();

-- 6. Helper Function to Check Subscription Status
CREATE OR REPLACE FUNCTION check_subscription_active(target_profile_id UUID, target_business_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM subscriptions 
        WHERE profile_id = target_profile_id 
        AND business_id = target_business_id 
        AND expires_at > NOW() 
        AND status = 'active'
    );
END;
$$ LANGUAGE plpgsql;
