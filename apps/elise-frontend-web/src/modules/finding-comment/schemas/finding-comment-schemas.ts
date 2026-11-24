import { z } from "zod";
import { FINDING_COMMENT_BODY_MAX, FindingCommentParamSchema, FindingCommentTextSchema } from "@repo/contracts/elise";

export {
  CreateFindingCommentBodySchema,
  FindingCommentParamSchema,
  FindingCommentSchema,
  FindingCommentsQuerySchema,
  FindingCommentTextSchema,
  FindingThreadSchema,
} from "@repo/contracts/elise";
export type {
  CreateFindingCommentBody,
  FindingComment,
  FindingCommentsQuery,
  FindingDecision,
  FindingThread,
  FindingThreadEvent,
} from "@repo/contracts/elise";

export const EditFindingCommentInputSchema = FindingCommentParamSchema.extend({ body: FindingCommentTextSchema });

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
