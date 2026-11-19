import type { AccessPower } from "@repo/contracts/elise";

// -----
// The pages under Settings, in the order the sidebar lists them, each
// with the Power its route asks for. The sidebar shows only the pages
// the reader may open, so no link leads to a redirect.
// -----
export const SETTINGS_PAGES = [
  { to: "/settings/providers", label: "Runners", power: "company:usage:anthropic_key:update" },
  { to: "/settings/plan", label: "Plan", power: "company:plan:read" },
] as const satisfies readonly { to: string; label: string; power: AccessPower }[];
