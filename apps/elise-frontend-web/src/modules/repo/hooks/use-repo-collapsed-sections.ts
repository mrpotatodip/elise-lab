import { useMemo, useSyncExternalStore } from "react";
import { z } from "zod";

const STORAGE_KEY = "elise:repo-sections:collapsed";
const KeysSchema = z.array(z.string());
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const read = () => {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "[]";
  } catch {
    return "[]";
  }
};

export function useRepoCollapsedSections() {
  const raw = useSyncExternalStore(subscribe, read, () => "[]");
  const collapsed = useMemo(() => {
    try {
      return KeysSchema.parse(JSON.parse(raw));
    } catch {
      return [];
    }
  }, [raw]);

  const toggle = (key: string) => {
    const next = collapsed.includes(key) ? collapsed.filter((entry) => entry !== key) : [...collapsed, key];
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      return;
    }
    for (const listener of listeners) listener();
  };

  return { collapsed, toggle };
}
