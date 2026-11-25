import { z } from "zod";
import { SCAN_KEY_SOURCE_VALUES } from "@repo/contracts/elise";
import { ScanOptionsSchema } from "./scan-options-schema";

export const ScanParamsSchema = z.object({
  scanId: z.string(),
  accountId: z.string(),
  repo: z.string(),
  ref: z.string().optional(),
  options: ScanOptionsSchema,
  keySource: z.enum(SCAN_KEY_SOURCE_VALUES).optional(),
  // -----
  // Set when the Scan runs on one of the Account's Runners instead of
  // in the container. Such a Scan is not billed to EliseLAB, so its
  // keySource is "account".
  // -----
  runnerId: z.uuid().optional(),
  resumesScanId: z.string().optional(),
  createdAt: z.string(),
});

export type ScanParams = z.infer<typeof ScanParamsSchema>;
