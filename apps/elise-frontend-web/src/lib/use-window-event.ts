import { useEffect } from "react";

export const useWindowEvent = <Name extends keyof WindowEventMap>(
  name: Name,
  handler: (event: WindowEventMap[Name]) => void,
) => {
  useEffect(() => {
    window.addEventListener(name, handler);
    return () => window.removeEventListener(name, handler);
  }, [name, handler]);
};
