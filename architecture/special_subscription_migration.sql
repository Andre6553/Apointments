-- Add Special Subscription Fields to Businesses Table

ALTER TABLE businesses 
ADD COLUMN IF NOT EXISTS special_plan_active BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS special_plan_price DECIMAL(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS special_plan_limit INTEGER DEFAULT 5;

-- Comment on columns for clarity
COMMENT ON COLUMN businesses.special_plan_active IS 'If true, enables the special manually-billing subscription for this organization.';
COMMENT ON COLUMN businesses.special_plan_price IS 'The custom price set by Master Admin for this special plan.';
COMMENT ON COLUMN businesses.special_plan_limit IS 'The number of providers (sorted by seniority) who get free access under this plan.';
