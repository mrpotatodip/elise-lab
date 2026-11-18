INSERT INTO "platform_master_plans" ("key", "label", "monthly_price_usd", "included_credit_usd", "max_members", "credit_markup", "carry_cap_usd", "key_source", "monthly_scan_allowance", "enabled") VALUES
  ('runner', 'Runner', 35.00, 0.00, 5, 1.0, NULL, 'account', NULL, true)
ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE "platform_master_plans" SET "enabled" = false WHERE "key" <> 'runner';
