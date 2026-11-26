// -----
// A Stripe subscription as the engine needs it, read fresh from
// Stripe on every webhook. status is Stripe's own word; the
// webhook maps it. accountId is the Account the checkout stamped
// into the subscription's metadata, null if it has none.
// -----
export type StripeSubscription = {
  id: string;
  customerId: string;
  status: string;
  priceId: string | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  accountId: string | null;
};

export type CheckoutInput = {
  customerId: string;
  accountId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
};

// -----
// The only door to Stripe. The real one calls Stripe's REST API
// with the Worker's secret key; the tests pass an in-memory one.
// -----
export type StripeGateway = {
  findCustomer: (input: { accountId: string }) => Promise<{ id: string } | null>;
  createCustomer: (input: { name: string; email: string | null; accountId: string }) => Promise<{ id: string }>;
  createCheckoutSession: (input: CheckoutInput) => Promise<{ url: string }>;
  createPortalSession: (input: { customerId: string; returnUrl: string }) => Promise<{ url: string }>;
  changeSubscriptionPrice: (input: { subscriptionId: string; priceId: string }) => Promise<void>;
  retrieveSubscription: (subscriptionId: string) => Promise<StripeSubscription>;
};
