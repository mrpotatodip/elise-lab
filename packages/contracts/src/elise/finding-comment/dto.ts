import { z } from "zod";
import { FINDING_COMMENT_BODY_MAX } from "../constants";

const FingerprintSchema = z.string().regex(/^[0-9a-f]{64}$/);

export const FindingCommentsQuerySchema = z.object({
  repo: z.string().min(1),
  fingerprint: FingerprintSchema,
});

export const FindingCommentTextSchema = z.string().trim().min(1).max(FINDING_COMMENT_BODY_MAX);

export const CreateFindingCommentBodySchema = z.object({
  repo: z.string().min(1),
  fingerprint: FingerprintSchema,
  body: FindingCommentTextSchema,
});

// -----
// One comment as the thread shows it. body is null once the
// comment is deleted. authorName is null when the author's
// Party was removed, and the dashboard says "a team member".
// -----
export const FindingCommentSchema = z.object({
  kind: z.literal("comment"),
  id: z.uuid(),
  authorPartyId: z.uuid().nullable(),
  authorName: z.string().nullable(),
  body: z.string().nullable(),
  createdAt: z.iso.datetime(),
  editedAt: z.iso.datetime().nullable(),
  deletedAt: z.iso.datetime().nullable(),
});

// -----
// A thread is a list of events, oldest first. A comment is
// the only kind today; the triage decisions join it as a
// second kind.
// -----
export const FindingThreadEventSchema = z.discriminatedUnion("kind", [FindingCommentSchema]);

export const FindingThreadSchema = z.object({
  events: z.array(FindingThreadEventSchema),
});

export type FindingCommentsQuery = z.infer<typeof FindingCommentsQuerySchema>;
export type CreateFindingCommentBody = z.infer<typeof CreateFindingCommentBodySchema>;
export type FindingComment = z.infer<typeof FindingCommentSchema>;
export type FindingThreadEvent = z.infer<typeof FindingThreadEventSchema>;
export type FindingThread = z.infer<typeof FindingThreadSchema>;
