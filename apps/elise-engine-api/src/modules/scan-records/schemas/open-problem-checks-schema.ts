import { z } from "zod";
import { OPEN_PROBLEM_ANSWERS } from "#/modules/decided-problems/constants";

export const OpenProblemChecksSchema = z.object({
  checks: z.array(z.object({ fingerprint: z.string().min(1), answer: z.enum(OPEN_PROBLEM_ANSWERS) })),
});

export type OpenProblemCheck = z.infer<typeof OpenProblemChecksSchema>["checks"][number];
