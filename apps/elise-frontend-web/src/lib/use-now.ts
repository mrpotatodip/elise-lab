import { useSyncExternalStore } from "react";

const TICK_MS = 1000;

const listeners = new Set<() => void>();
let now = Date.now();
let timer: ReturnType<typeof setInterval> | undefined;

const subscribe = (onChange: () => void) => {
  listeners.add(onChange);
  if (listeners.size === 1) {
    now = Date.now();
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

const read = () => now;

export const useNow = () => useSyncExternalStore(subscribe, read, read);
