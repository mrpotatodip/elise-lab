import { z } from "zod";

const LedgerSchema = z.array(z.object({ status: z.string(), unresolved: z.array(z.string()).default([]) }));

const LedgerTextSchema = z
  .string()
  .transform((text, ctx) => {
    try {
      return JSON.parse(text);
    } catch {
      ctx.addIssue({ code: "custom", message: "the ledger is not JSON" });
      return z.NEVER;
    }
  })
  .pipe(LedgerSchema);

// -----
// A succeeded full Scan is partial when its money ran out: the
// Report's first line is the PARTIAL: line (SKILL.md, "running
// out of money"; blank lines and a byte order mark before it do
// not matter), or a ledger unit names money_exhausted in
// `unresolved`. SKILL.md marks an unreached unit `deferred` and
// keeps an unvalidated candidate as a `candidate` unit, both with
// that reason, so the status does not matter. A unit a quick Scan
// defers on purpose (quick_profile_final_critic) is not partial:
// the Verdict weight covers that. A ledger that cannot be read says
// nothing.
// -----
export const isPartialScan = (report: string | null, ledgerText: string | null): boolean => {
  if (report !== null && report.replace(/^[﻿\s]+/, "").startsWith("PARTIAL:")) return true;
  if (ledgerText === null) return false;
  const ledger = LedgerTextSchema.safeParse(ledgerText);
  return ledger.success && ledger.data.some((unit) => unit.unresolved.includes("money_exhausted"));
};
