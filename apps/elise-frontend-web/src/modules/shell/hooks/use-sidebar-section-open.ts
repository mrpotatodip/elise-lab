import { useCallback, useSyncExternalStore } from "react";

const CHANGE_EVENT = "elise:sidebar-section";

const fallback = new Map<string, boolean>();

const subscribe = (onChange: () => void) => {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
};

export function useSidebarSectionOpen(section: "repos" | "team") {
  const key = `elise.sidebar.${section}`;

  const read = () => {
    try {
      return localStorage.getItem(key) !== "0";
    } catch {
      return fallback.get(key) ?? true;
    }
  };

  const open = useSyncExternalStore(subscribe, read, () => true);

  const setOpen = useCallback(
    (next: boolean) => {
      fallback.set(key, next);
      try {
        localStorage.setItem(key, next ? "1" : "0");
      } catch {
        return;
      } finally {
        window.dispatchEvent(new Event(CHANGE_EVENT));
      }
    },
    [key],
  );

  return { open, setOpen };
}
