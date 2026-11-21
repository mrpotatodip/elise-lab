// -----
// After Stripe's checkout returns, the page re-reads the Plan until
// the webhook has made it active, then stops
// -----
export const PLAN_CONFIRM_POLL_MS = 3000;
export const PLAN_CONFIRM_POLL_MAX = 20;
