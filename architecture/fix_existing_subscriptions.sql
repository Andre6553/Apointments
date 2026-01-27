-- Ensure all existing profiles with a business_id have a subscription record
INSERT INTO subscriptions (profile_id, business_id, tier, role, expires_at)
SELECT 
    id as profile_id, 
    business_id, 
    'trial' as tier, 
    CASE WHEN role = 'Admin' THEN 'Admin' ELSE 'Provider' END as role,
    NOW() + INTERVAL '10 days' as expires_at
FROM profiles
WHERE business_id IS NOT NULL
ON CONFLICT (profile_id, business_id) DO NOTHING;
