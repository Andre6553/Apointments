SELECT b.id, b.name, b.created_at, p.email, p.full_name
FROM businesses b
LEFT JOIN profiles p ON b.id = p.business_id AND p.role = 'Admin';
