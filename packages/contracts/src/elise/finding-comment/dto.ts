import { z } from "zod";
import { FINDING_COMMENT_BODY_MAX } from "../constants";
import { FINDING_TRIAGE_STATUS_VALUES } from "../enums";

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

export const FindingCommentParamSchema = z.object({
  commentId: z.uuid(),
});

export const UpdateFindingCommentBodySchema = z.object({
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
// One triage decision as the thread shows it, from the Audit
// trail row. actorName is null when the decision was made with
// the service token or the login was removed. acceptedUntil is
// set only for an accepted risk.
// -----
export const FindingDecisionSchema = z.object({
  kind: z.literal("decision"),
  id: z.uuid(),
  actorName: z.string().nullable(),
  status: z.enum(FINDING_TRIAGE_STATUS_VALUES),
  note: z.string().nullable(),
  acceptedUntil: z.iso.datetime().nullable(),
  duplicateOf: z.string().nullable().default(null),
  createdAt: z.iso.datetime(),
});

// -----
// A thread is a list of events, oldest first: comments and
// triage decisions.
// -----
export const FindingThreadEventSchema = z.discriminatedUnion("kind", [FindingCommentSchema, FindingDecisionSchema]);

export const FindingThreadSchema = z.object({
  events: z.array(FindingThreadEventSchema),
});

export type FindingCommentsQuery = z.infer<typeof FindingCommentsQuerySchema>;
export type CreateFindingCommentBody = z.infer<typeof CreateFindingCommentBodySchema>;
export type UpdateFindingCommentBody = z.infer<typeof UpdateFindingCommentBodySchema>;
export type FindingComment = z.infer<typeof FindingCommentSchema>;
export type FindingDecision = z.infer<typeof FindingDecisionSchema>;
export type FindingThreadEvent = z.infer<typeof FindingThreadEventSchema>;
export type FindingThread = z.infer<typeof FindingThreadSchema>;
