SELECT p.*, b.name as business_name, s.tier as sub_tier
FROM profiles p
LEFT JOIN businesses b ON p.business_id = b.id
LEFT JOIN subscriptions s ON p.id = s.profile_id
WHERE p.email LIKE 'test_admin%';
