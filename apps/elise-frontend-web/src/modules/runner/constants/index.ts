// -----
// How often the list asks again while a pairing code is waiting.
// -----
export const RUNNER_WAITING_POLL_MS = 4_000;

// -----
// The terminal command that connects a Runner through the browser.
// -----
export const RUNNER_LOGIN_COMMAND = "elise-runner login";

// -----
// What the person reads for each state of a Runner. Raw values
// (`waiting`) are never labels.
// -----
export const RUNNER_STATE_COPY = {
  waiting: { label: "Waiting for pairing", variant: "info" },
  expired: { label: "Code expired", variant: "neutral" },
  connected: { label: "Connected", variant: "success" },
  offline: { label: "Not running", variant: "neutral" },
} as const;

// -----
// A paired Runner that is running asks for work every few seconds. One not
// seen for this long is shown as not running, though it stays paired.
// -----
export const RUNNER_OFFLINE_AFTER_MS = 5 * 60_000;
