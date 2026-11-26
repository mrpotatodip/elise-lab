-- The old disabled Solo row (platform key, $15 of credit, $29 a month) becomes the new Solo: one person, the Account's own key, flat price. No Subscription points to it. It stays disabled until its Stripe prices are on the row.
UPDATE "platform_master_plans" SET
  "monthly_price_usd" = 6.00,
  "yearly_price_usd" = 60.00,
  "included_credit_usd" = 0.00,
  "credit_markup" = 1.0,
  "carry_cap_usd" = NULL,
  "key_source" = 'account',
  "monthly_scan_allowance" = NULL,
  "hosted_scans_allowed" = false,
  "max_members" = 1,
  "stripe_price_id" = NULL,
  "stripe_yearly_price_id" = NULL,
  "enabled" = false,
  "updated_at" = now()
WHERE "key" = 'solo';
