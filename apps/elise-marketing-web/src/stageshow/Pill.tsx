import type { HTMLAttributes } from "react";

// The dashboard's Badge (components/ui/badge.tsx) and the scan status pill built on it.
// Styled in daylight.css.
export type PillTone = "success" | "danger" | "warning" | "info" | "neutral" | "outline" | "high" | "medium" | "low";

export function Pill({ tone, dot, pulse, children, ...rest }: HTMLAttributes<HTMLSpanElement> & { tone: PillTone; dot?: boolean; pulse?: boolean }) {
  return (
    <span {...rest} className="dl-pill" data-tone={tone} data-pulse={pulse || undefined}>
      {dot && <i />}
      {children}
    </span>
  );
}

export const STATUS = {
  running: { tone: "info", label: "Running" },
  succeeded: { tone: "success", label: "Succeeded" },
  failed: { tone: "danger", label: "Failed" },
} as const;
