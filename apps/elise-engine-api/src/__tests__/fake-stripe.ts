import type { StripeGateway, StripeSubscription } from "#/modules/stripe/types";

// -----
// Stripe in memory: it hands out customers and URLs, remembers
// what a test asked for, and answers retrieveSubscription from
// the subscriptions the test put in.
// -----
// -----
// A test's yearly price ids contain "_year" (price_runner_year_test);
// every other id is a monthly price.
// -----
const intervalOf = (priceId: string): "month" | "year" => (priceId.includes("_year") ? "year" : "month");

export const fakeStripe = () => {
  const subscriptions = new Map<string, StripeSubscription>();
  const customers: { id: string; name: string; email: string | null; accountId: string }[] = [];
  const checkouts: {
    customerId: string;
    accountId: string;
    priceId: string;
    interval: "month" | "year";
    successUrl: string;
    cancelUrl: string;
  }[] = [];
  const portals: { customerId: string; returnUrl: string }[] = [];
  const changes: { subscriptionId: string; priceId: string; interval: "month" | "year" }[] = [];

  const gateway: StripeGateway = {
    findCustomer: async ({ accountId }) => {
      const found = customers.find((customer) => customer.accountId === accountId);
      return found ? { id: found.id } : null;
    },
    createCustomer: async (input) => {
      const customer = { id: `cus_fake_${customers.length + 1}`, ...input };
      customers.push(customer);
      return { id: customer.id };
    },
    createCheckoutSession: async (input) => {
      checkouts.push({ ...input, interval: intervalOf(input.priceId) });
      return { url: `https://checkout.stripe.test/${input.customerId}` };
    },
    createPortalSession: async (input) => {
      portals.push(input);
      return { url: `https://billing.stripe.test/${input.customerId}` };
    },
    changeSubscriptionPrice: async (input) => {
      changes.push({ ...input, interval: intervalOf(input.priceId) });
    },
    retrieveSubscription: async (subscriptionId) => {
      const found = subscriptions.get(subscriptionId);
      if (!found) throw new Error(`no fake subscription ${subscriptionId}`);
      return found;
    },
  };

  return { gateway, subscriptions, customers, checkouts, portals, changes };
};
