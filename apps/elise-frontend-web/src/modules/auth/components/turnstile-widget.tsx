import { useCallback } from "react";

const TURNSTILE_SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const TURNSTILE_ACTION = "signup";

type TurnstileApi = {
  render: (container: HTMLElement, options: { sitekey: string; action: string; callback: (token: string) => void; "expired-callback": () => void; "error-callback": () => void }) => string;
  remove: (widgetId: string) => void;
};

type TurnstileWindow = Window & { turnstile?: TurnstileApi };

const withTurnstile = (run: (api: TurnstileApi) => void) => {
  const win: TurnstileWindow = window;
  if (win.turnstile) {
    run(win.turnstile);
    return () => undefined;
  }
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${TURNSTILE_SCRIPT}"]`);
  const script = existing ?? Object.assign(document.createElement("script"), { src: TURNSTILE_SCRIPT, async: true });
  const onLoad = () => {
    if (win.turnstile) run(win.turnstile);
  };
  script.addEventListener("load", onLoad);
  if (!existing) document.head.appendChild(script);
  return () => script.removeEventListener("load", onLoad);
};

export function TurnstileWidget({ siteKey, onToken }: { siteKey: string; onToken: (token: string) => void }) {
  const mount = useCallback(
    (target: HTMLDivElement | null) => {
      if (!target) return undefined;
      let widgetId: string | null = null;
      const stop = withTurnstile((api) => {
        widgetId = api.render(target, {
          sitekey: siteKey,
          action: TURNSTILE_ACTION,
          callback: onToken,
          "expired-callback": () => onToken(""),
          "error-callback": () => onToken(""),
        });
      });
      return () => {
        stop();
        const win: TurnstileWindow = window;
        if (widgetId !== null) win.turnstile?.remove(widgetId);
      };
    },
    [siteKey, onToken],
  );

  return <div ref={mount} />;
}
