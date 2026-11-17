import { useSyncExternalStore } from "react";

const TICK_MS = 1000;

const listeners = new Set<() => void>();
let now = Date.now();
let timer: ReturnType<typeof setInterval> | undefined;

const subscribe = (onChange: () => void) => {
  listeners.add(onChange);
  if (listeners.size === 1) {
    timer = setInterval(() => {
      now = Date.now();
      for (const listener of listeners) listener();
    }, TICK_MS);
  }
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0) clearInterval(timer);
  };
};

// -----
// With no subscriber the timer is stopped, so the first render after a
// pause would read a stale time. Reading refreshes it then, at most once a
// tick, so two reads in one render still return the same value.
// -----
const read = () => {
  if (listeners.size === 0 && Date.now() - now >= TICK_MS) now = Date.now();
  return now;
};

export const useNow = () => useSyncExternalStore(subscribe, read, read);
