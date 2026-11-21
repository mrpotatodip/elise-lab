import { useSyncExternalStore } from "react";
import { readGettingStartedFlag, writeGettingStartedFlag, type GettingStartedFlag } from "../utils";

const listeners = new Set<() => void>();

const subscribe = (onChange: () => void) => {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
};

export function useGettingStartedFlag(accountId: string, flag: GettingStartedFlag) {
  const value = useSyncExternalStore(
    subscribe,
    () => readGettingStartedFlag(accountId, flag),
    () => false,
  );
  const set = (next: boolean) => {
    writeGettingStartedFlag(accountId, flag, next);
    listeners.forEach((listener) => listener());
  };
  return [value, set] as const;
}
