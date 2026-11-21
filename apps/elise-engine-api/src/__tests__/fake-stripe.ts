import type { StripeGateway, StripeSubscription } from "#/modules/stripe/types";

// -----
// Stripe in memory: it hands out customers and URLs, remembers
// what a test asked for, and answers retrieveSubscription from
// the subscriptions the test put in.
// -----
export const fakeStripe = () => {
  const subscriptions = new Map<string, StripeSubscription>();
  const customers: { id: string; name: string; email: string | null; accountId: string }[] = [];
  const checkouts: { customerId: string; accountId: string; priceId: string; successUrl: string; cancelUrl: string }[] = [];
  const portals: { customerId: string; returnUrl: string }[] = [];

  const gateway: StripeGateway = {
    createCustomer: async (input) => {
      const customer = { id: `cus_fake_${customers.length + 1}`, ...input };
      customers.push(customer);
      return { id: customer.id };
    },
    createCheckoutSession: async (input) => {
      checkouts.push(input);
      return { url: `https://checkout.stripe.test/${input.customerId}` };
    },
    createPortalSession: async (input) => {
      portals.push(input);
      return { url: `https://billing.stripe.test/${input.customerId}` };
    },
    retrieveSubscription: async (subscriptionId) => {
      const found = subscriptions.get(subscriptionId);
      if (!found) throw new Error(`no fake subscription ${subscriptionId}`);
      return found;
    },
  };

  return { gateway, subscriptions, customers, checkouts, portals };
};
