import { z } from "zod";
import { FINDING_COMMENT_BODY_MAX } from "@repo/contracts/elise";

export { CreateFindingCommentBodySchema, FindingCommentSchema, FindingCommentsQuerySchema, FindingThreadSchema } from "@repo/contracts/elise";
export type { CreateFindingCommentBody, FindingComment, FindingCommentsQuery, FindingThread, FindingThreadEvent } from "@repo/contracts/elise";

// -----
// The composer: one text box, checked against the engine's limit.
// -----
export const FindingCommentDraftSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Write something before you post.")
    .max(FINDING_COMMENT_BODY_MAX, `A comment holds at most ${FINDING_COMMENT_BODY_MAX} characters.`),
});
