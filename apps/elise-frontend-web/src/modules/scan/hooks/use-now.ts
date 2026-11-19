import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  const timer = setInterval(onChange, 1000);
  return () => clearInterval(timer);
}

// -----
// The clock in milliseconds, rounded to the second, so a "5s ago" label
// counts up on its own. 0 on the server: nothing time-relative renders there.
// -----
export function useNow() {
  return useSyncExternalStore(
    subscribe,
    () => Math.floor(Date.now() / 1000) * 1000,
    () => 0,
  );
}
