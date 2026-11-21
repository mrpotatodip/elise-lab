import { useSyncExternalStore } from "react";
import { gettingStartedFlagKey, type GettingStartedFlag } from "../utils";

const listeners = new Set<() => void>();

const subscribe = (onChange: () => void) => {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
};

function readFlag(accountId: string, flag: GettingStartedFlag): boolean {
  try {
    return window.localStorage.getItem(gettingStartedFlagKey(accountId, flag)) === "1";
  } catch {
    return false;
  }
}

function writeFlag(accountId: string, flag: GettingStartedFlag, value: boolean): void {
  try {
    if (value) window.localStorage.setItem(gettingStartedFlagKey(accountId, flag), "1");
    else window.localStorage.removeItem(gettingStartedFlagKey(accountId, flag));
  } catch {
    return;
  }
}

export function useGettingStartedFlag(accountId: string, flag: GettingStartedFlag) {
  const value = useSyncExternalStore(
    subscribe,
    () => readFlag(accountId, flag),
    () => false,
  );
  const set = (next: boolean) => {
    writeFlag(accountId, flag, next);
    listeners.forEach((listener) => listener());
  };
  return [value, set] as const;
}
