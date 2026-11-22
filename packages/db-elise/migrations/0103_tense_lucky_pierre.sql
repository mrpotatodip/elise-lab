ALTER TABLE "platform_master_plans" ADD COLUMN "yearly_price_usd" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "platform_master_plans" ADD COLUMN "stripe_yearly_price_id" text;--> statement-breakpoint
ALTER TABLE "tenant_subscriptions" ADD COLUMN "billing_interval" text;--> statement-breakpoint
ALTER TABLE "platform_master_plans" ADD CONSTRAINT "platform_master_plans_yearly_price" CHECK ("platform_master_plans"."yearly_price_usd" is null or "platform_master_plans"."yearly_price_usd" >= 0);--> statement-breakpoint
ALTER TABLE "tenant_subscriptions" ADD CONSTRAINT "tenant_subscriptions_billing_interval" CHECK ("tenant_subscriptions"."billing_interval" is null or "tenant_subscriptions"."billing_interval" in ('month', 'year'));
--> statement-breakpoint
UPDATE "tenant_subscriptions" SET "billing_interval" = 'month' WHERE "source" = 'stripe';--> statement-breakpoint
UPDATE "platform_master_plans" SET "yearly_price_usd" = 150.00 WHERE "key" = 'starter';--> statement-breakpoint
UPDATE "platform_master_plans" SET "yearly_price_usd" = 350.00 WHERE "key" = 'runner';
