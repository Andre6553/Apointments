SELECT p.email, p.role, p.business_id, b.name as business_name 
FROM profiles p 
LEFT JOIN businesses b ON p.business_id = b.id 
WHERE p.email = 'andre.ecprint@gmail.com';

-- Also check if there are any businesses at all
SELECT * FROM businesses;
