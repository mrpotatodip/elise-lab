// -----
// After Stripe's checkout returns, the page re-reads the Plan until
// the webhook has made it active, then stops
// -----
export const PLAN_CONFIRM_POLL_MS = 3000;
export const PLAN_CONFIRM_POLL_MAX = 20;

export const PLAN_POINTS = [
  "A flat price, with no Elise charge per scan.",
  "Scans run through a Runner on your own AI subscription.",
  "Every Runner, scan, report and finding in one dashboard.",
] as const;
