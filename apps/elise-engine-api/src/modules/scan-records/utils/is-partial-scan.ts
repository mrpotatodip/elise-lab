import { z } from "zod";
import { SCAN_RECORDS_MONEY_FIRST_LINE, SCAN_RECORDS_TIME_FIRST_LINE } from "#/modules/scan-records/constants";

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

export const isPartialScan = (
  report: string | null,
  ledgerText: string | null,
  metadataText: string | null,
): boolean => {
  if (report !== null) {
    const first = report.replace(/^[﻿\s]+/, "");
    if (first.startsWith(SCAN_RECORDS_MONEY_FIRST_LINE) || first.startsWith(SCAN_RECORDS_TIME_FIRST_LINE)) return true;
  }
  if (ledgerText !== null) {
    const ledger = LedgerTextSchema.safeParse(ledgerText);
    if (ledger.success && ledger.data.some((unit) => unit.unresolved.includes("money_exhausted"))) return true;
  }
  if (metadataText === null) return false;
  const metadata = MetadataTextSchema.safeParse(metadataText);
  return metadata.success && metadata.data.incomplete_reason === "money_exhausted";
};
