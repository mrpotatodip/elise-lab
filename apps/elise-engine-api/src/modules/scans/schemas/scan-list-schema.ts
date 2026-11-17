import { z } from "zod";
import { ScanListSchema as ContractScanListSchema } from "@repo/contracts/elise";
import { documentFields } from "#/lib/document-fields";

export { ScanListQuerySchema } from "@repo/contracts/elise";

export const ScanListSchema = documentFields(ContractScanListSchema, {
  nextCursor: { description: "Send it as ?cursor= to get the next page. Null on the last page." },
});

export type { ScanListQuery } from "@repo/contracts/elise";
export type ScanList = z.infer<typeof ScanListSchema>;
