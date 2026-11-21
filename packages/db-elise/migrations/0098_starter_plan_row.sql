INSERT INTO "platform_master_plans" ("key", "label", "monthly_price_usd", "included_credit_usd", "max_members", "credit_markup", "carry_cap_usd", "key_source", "monthly_scan_allowance", "hosted_scans_allowed", "enabled") VALUES
  ('starter', 'Starter', 15.00, 0.00, 2, 1.0, NULL, 'account', NULL, false, false)
ON CONFLICT ("key") DO NOTHING;
