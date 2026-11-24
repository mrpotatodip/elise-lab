// -----
// After Stripe's checkout returns, the page re-reads the Plan until
// the webhook has made it active, then stops
// -----
export const PLAN_CONFIRM_POLL_MS = 3000;
export const PLAN_CONFIRM_POLL_MAX = 20;

export const PLAN_REFUND_LINE = "A refund can be asked for within 14 days of the first yearly charge.";
export const PLAN_YEARLY_BACK_LINE =
  "Going back to monthly means cancelling at the end of the year, then subscribing monthly.";

export const PLAN_POINTS = [
  "A flat price, with no Elise charge per scan.",
  "Scans run through a Runner on your own AI subscription.",
  "Every Runner, scan, report and finding in one dashboard.",
] as const;
