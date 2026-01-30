
-- Create a secure function to get busy providers
-- Returns list of provider IDs who have an exactly 'active' appointment right now
-- Security Definer bypasses RLS, ensuring Admins/staff can see who is busy without needing full table access

CREATE OR REPLACE FUNCTION get_busy_providers(
    p_business_id UUID
)
RETURNS TABLE (provider_id UUID) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT a.assigned_profile_id
    FROM appointments a
    JOIN profiles p ON a.assigned_profile_id = p.id
    WHERE a.status = 'active'
    AND p.business_id = p_business_id;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_busy_providers(UUID) TO authenticated;
