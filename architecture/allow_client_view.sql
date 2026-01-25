-- Allow receivers to VIEW clients associated with incoming transfers
CREATE POLICY "Receivers can view clients of incoming transfers" ON clients
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM appointments a
    JOIN transfer_requests tr ON tr.appointment_id = a.id
    WHERE a.client_id = clients.id
    AND tr.receiver_id = auth.uid()
    AND tr.status = 'pending'
  )
);
