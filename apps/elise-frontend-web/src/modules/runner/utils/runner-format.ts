import { RUNNER_OFFLINE_AFTER_MS, type RUNNER_STATE_COPY } from "../constants";
import type { Runner } from "../schemas";

const WHEN = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });

export const runnerWhen = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : `${WHEN.format(date)} UTC`;
};

export const runnerShownState = (runner: Runner, nowMs: number): keyof typeof RUNNER_STATE_COPY => {
  if (runner.state !== "connected") return runner.state;
  const seenMs = runner.lastSeenAt === null ? Number.NaN : Date.parse(runner.lastSeenAt);
  return Number.isNaN(seenMs) || nowMs - seenMs > RUNNER_OFFLINE_AFTER_MS ? "offline" : "connected";
};

// -----
// Who added the Runner. An older engine sends no name, and a
// person with no name on record gives null: then the line is
// left out rather than guessed.
// -----
export const runnerAddedBy = (runner: Runner): string | null => (runner.createdByName ? `Added by ${runner.createdByName}.` : null);

// -----
// The muted line under a Runner's name: what to do next, or
// when it was last seen. Only facts the engine sent.
// -----
export const runnerDetail = (runner: Runner): string => {
  if (runner.state === "waiting" && runner.expiresAt !== null) return `Run elise-runner pair with the code before ${runnerWhen(runner.expiresAt)}.`;
  if (runner.state === "expired") return "The code ran out before the app used it. Remove this and add the computer again.";
  return runner.lastSeenAt === null ? "Not seen yet." : `Last seen ${runnerWhen(runner.lastSeenAt)}.`;
};
