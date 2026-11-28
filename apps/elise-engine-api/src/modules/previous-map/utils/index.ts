import { HANDOVER_FILE_MAX, type HandoverFile } from "@repo/contracts/elise";
import { z } from "zod";
import { PREVIOUS_MAP_FILE } from "#/modules/previous-map/constants";

export * from "./r2-text-store";

const coverageLedgerSchema = z.json();
type CoverageLedger = z.infer<typeof coverageLedgerSchema>;

const parsedLedger = (text: string | null): CoverageLedger | undefined => {
  if (text === null) return undefined;
  try {
    const parsed = coverageLedgerSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
};

export const previousMapHandover = (architecture: string, ledgerText: string | null): HandoverFile[] => {
  const ledger = parsedLedger(ledgerText);
  const withLedger =
    ledger === undefined ? null : JSON.stringify({ architecture_md: architecture, coverage_ledger: ledger });
  if (withLedger !== null && withLedger.length <= HANDOVER_FILE_MAX)
    return [{ name: PREVIOUS_MAP_FILE, content: withLedger }];
  const alone = JSON.stringify({ architecture_md: architecture });
  return alone.length <= HANDOVER_FILE_MAX ? [{ name: PREVIOUS_MAP_FILE, content: alone }] : [];
};

export const PREVIOUS_MAP_ASK = `If ${PREVIOUS_MAP_FILE} exists in the output directory, read it first. It holds the architecture map (architecture_md) and the coverage ledger (coverage_ledger, which can be missing) of the last audit of this branch. Update that map for what changed in the code instead of mapping from zero: check each part of it against the code, keep what still holds, and fix or remove what no longer does. Write the updated map as architecture.md. Build this run's own ledger as the skill says, with every unit planned: use the earlier ledger only to see which surfaces and units existed, never copy a status from it.`;

export const askOfPreviousMap = (files: readonly string[]): string =>
  files.includes(PREVIOUS_MAP_FILE) ? PREVIOUS_MAP_ASK : "";
