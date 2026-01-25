-- Allow receivers to VIEW appointments that are being transferred to them
CREATE POLICY "Receivers can view incoming transfers" ON appointments
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM transfer_requests
    WHERE transfer_requests.appointment_id = appointments.id
    AND transfer_requests.receiver_id = auth.uid()
    AND transfer_requests.status = 'pending'
  )
);
