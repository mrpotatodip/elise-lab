// The stage kit's tokens, mapped onto the page's theme tokens (tokens.css), so the kit's parts
// (buttons, checks, fields, the browser bar) follow the theme the way the dashboard's do.
export const DASHBOARD_LOOK = {
  "--ss-accent": "var(--primary)",
  "--ss-accent-soft": "var(--accent)",
  "--ss-surface": "var(--popover)",
  // The browser bar and its address field.
  "--ss-chrome": "var(--popover)",
  "--ss-ink-1": "var(--accent)",
  "--ss-text-strong": "var(--foreground)",
  "--ss-text": "var(--muted-foreground)",
  "--ss-text-faint": "var(--muted-foreground)",
  "--ss-line": "var(--border)",
} as const;
