-- Allow Master Admin to do ANYTHING with subscriptions
DROP POLICY IF EXISTS "Master Admin manage all subscriptions" ON "public"."subscriptions";
CREATE POLICY "Master Admin manage all subscriptions"
ON "public"."subscriptions"
FOR ALL
USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'MasterAdmin'
);
