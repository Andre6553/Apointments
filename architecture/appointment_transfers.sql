-- Notifications Table
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    type TEXT NOT NULL, -- 'transfer_request', 'transfer_accepted', 'transfer_rejected', etc.
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    data JSONB DEFAULT '{}'::jsonb, -- Store appointment_id, sender_id, etc.
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Transfer Requests Table
CREATE TABLE IF NOT EXISTS transfer_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_id UUID REFERENCES appointments(id) ON DELETE CASCADE NOT NULL,
    sender_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    receiver_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policies
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE transfer_requests ENABLE ROW LEVEL SECURITY;

-- Notifications: Only the user who owns the notification can see/read/update it
CREATE POLICY "Users can manage their own notifications" ON notifications
    FOR ALL USING (auth.uid() = user_id);

-- Transfer Requests: Sender and Receiver can see the request
CREATE POLICY "Involved parties can see transfer requests" ON transfer_requests
    FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- Transfer Requests: Only the receiver can update the status (accept/reject)
CREATE POLICY "Only receiver can update request status" ON transfer_requests
    FOR UPDATE USING (auth.uid() = receiver_id);

-- Transfer Requests: Only sender or receiver can create (though usually sender)
CREATE POLICY "Involved parties can create transfer requests" ON transfer_requests
    FOR INSERT WITH CHECK (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_transfer_requests_appointment_id ON transfer_requests(appointment_id);
CREATE INDEX IF NOT EXISTS idx_transfer_requests_receiver_id ON transfer_requests(receiver_id);
CREATE INDEX IF NOT EXISTS idx_transfer_requests_status ON transfer_requests(status);
