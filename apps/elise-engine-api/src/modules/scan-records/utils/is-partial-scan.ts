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

const MONEY_FIRST_LINE = "PARTIAL: money ran out;";

const MetadataTextSchema = z
  .string()
  .transform((text, ctx) => {
    try {
      return JSON.parse(text);
    } catch {
      ctx.addIssue({ code: "custom", message: "run-metadata.json is not JSON" });
      return z.NEVER;
    }
  })
  .pipe(z.object({ incomplete_reason: z.string().optional() }));

// -----
// A succeeded full Scan is partial only when its money ran out, and
// one of three things says so: the Report's first line is the
// Skill's own `PARTIAL: money ran out;` (SKILL.md, "running out of
// money"; blank lines and a byte order mark before it do not
// matter), a ledger unit names money_exhausted in `unresolved`, or
// run-metadata.json says `incomplete_reason: "money_exhausted"`.
// Any other first line that starts with `PARTIAL:` is the agent's
// own wording for something else (it could not verify, say) and
// says nothing about money. SKILL.md marks an unreached unit
// `deferred` and keeps an unvalidated candidate as a `candidate`
// unit, both with that reason, so the status does not matter. A
// unit a quick Scan defers on purpose (quick_profile_final_critic)
// is not partial: the Verdict weight covers that. A file that
// cannot be read says nothing.
// -----
export const isPartialScan = (report: string | null, ledgerText: string | null, metadataText: string | null): boolean => {
  if (report !== null && report.replace(/^[﻿\s]+/, "").startsWith(MONEY_FIRST_LINE)) return true;
  if (ledgerText !== null) {
    const ledger = LedgerTextSchema.safeParse(ledgerText);
    if (ledger.success && ledger.data.some((unit) => unit.unresolved.includes("money_exhausted"))) return true;
  }
  if (metadataText === null) return false;
  const metadata = MetadataTextSchema.safeParse(metadataText);
  return metadata.success && metadata.data.incomplete_reason === "money_exhausted";
};
