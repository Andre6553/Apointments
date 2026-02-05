-- Reset delay and optionally shift time when reassigning appointments
-- This helps prevent crisis loops in the Workload Balancer

CREATE OR REPLACE FUNCTION reassign_appointment(
    appt_id UUID,
    new_provider_id UUID,
    note_text TEXT,
    flag_attention BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_business_id UUID;
    v_requester_business_id UUID;
    v_old_provider_id UUID;
    v_scheduled_start TIMESTAMPTZ;
BEGIN
    -- 1. Get the appointment's business_id and current state
    SELECT business_id, assigned_profile_id, scheduled_start 
    INTO v_business_id, v_old_provider_id, v_scheduled_start
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
        RAISE EXCEPTION 'Permission denied';
    END IF;

    -- 4. Perform the Update
    -- Reset delay_minutes to 0
    -- Move scheduled_start to NOW if it was in the past (only for pending/active)
    UPDATE appointments
    SET 
        assigned_profile_id = new_provider_id,
        shifted_from_id = v_old_provider_id,
        status = 'pending',
        notes = COALESCE(notes, '') || E'\n' || note_text,
        requires_attention = flag_attention,
        delay_minutes = 0,
        scheduled_start = CASE 
            WHEN v_scheduled_start < NOW() THEN NOW() 
            ELSE v_scheduled_start 
        END
    WHERE id = appt_id;

    RETURN jsonb_build_object('success', true);
END;
$$;
