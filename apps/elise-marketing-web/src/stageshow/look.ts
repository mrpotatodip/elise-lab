// The stage kit's tokens, mapped onto the dashboard's Daylight tokens (daylight.css, set on
// `.dl`), so the kit's parts (buttons, checks, fields) look like the dashboard's.
export const DASHBOARD_LOOK = {
  "--ss-accent": "var(--primary)",
  "--ss-accent-soft": "var(--accent)",
  "--ss-surface": "oklch(1 0 0)",
  "--ss-text-strong": "var(--foreground)",
  "--ss-text": "var(--muted-foreground)",
  "--ss-text-faint": "var(--muted-foreground)",
  "--ss-line": "var(--border)",
} as const;
