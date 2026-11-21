// -----
// Stripe's REST API
// -----
export const STRIPE_API_BASE_URL = "https://api.stripe.com/v1";
export const STRIPE_API_VERSION = "2025-04-30.basil";

// -----
// The webhook
// -----
export const STRIPE_WEBHOOK_SIGNATURE_TOLERANCE_SECONDS = 300;
export const STRIPE_WEBHOOK_SUBSCRIPTION_EVENTS: readonly string[] = ["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"];
export const STRIPE_WEBHOOK_SESSION_EVENTS: readonly string[] = ["checkout.session.completed", "invoice.payment_failed"];
export const STRIPE_NOT_CONFIGURED_MESSAGE = "Stripe is not configured";

// -----
// A stored Subscription in one of these statuses is still the Account's
// plan, so an event for a different Stripe subscription must not replace it.
// -----
export const STRIPE_SUBSCRIPTION_LIVE_STATUSES = ["active", "past_due", "unpaid"] as const;
