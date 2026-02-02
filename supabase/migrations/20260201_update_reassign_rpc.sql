-- Update reassign_appointment RPC to support requires_attention flag
-- for when providers change their working hours and need to transfer appointments

CREATE OR REPLACE FUNCTION reassign_appointment(
    appt_id UUID,
    new_provider_id UUID,
    note_text TEXT,
    flag_attention BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER -- Runs with superuser privileges to bypass RLS
AS $$
DECLARE
    v_business_id UUID;
    v_requester_business_id UUID;
    v_old_provider_id UUID;
BEGIN
    -- 1. Get the appointment's business_id and current provider
    SELECT business_id, assigned_profile_id INTO v_business_id, v_old_provider_id
    FROM appointments
    WHERE id = appt_id;

    IF v_business_id IS NULL THEN
        RAISE EXCEPTION 'Appointment not found';
    END IF;

    -- 2. Get the requester's business_id
    SELECT business_id INTO v_requester_business_id
    FROM profiles
    WHERE id = auth.uid();

    -- 3. Security Check: Requester must be in the same business
    IF v_requester_business_id IS NULL OR v_requester_business_id <> v_business_id THEN
        RAISE EXCEPTION 'Permission denied: You can only reassign appointments within your organization.';
    END IF;

    -- 4. Perform the Update
    UPDATE appointments
    SET 
        assigned_profile_id = new_provider_id,
        shifted_from_id = v_old_provider_id,
        status = 'pending',
        notes = COALESCE(notes, '') || E'\n' || note_text,
        requires_attention = flag_attention
    WHERE id = appt_id;

    RETURN jsonb_build_object('success', true);
END;
$$;
