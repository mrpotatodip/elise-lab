import type { FindingComment } from "@repo/contracts/elise";
import type { TFindingComment } from "@repo/db-elise/schema";

export type CommentAuthor = { firstName: string; lastName: string } | null;

export const authorNameOf = (person: CommentAuthor | undefined): string | null =>
  person ? `${person.firstName} ${person.lastName}`.trim() || null : null;

// -----
// The row as the thread shows it. A deleted comment shows
// no text, whatever its row still holds.
// -----
export const findingCommentView = (
  comment: TFindingComment,
  author: CommentAuthor | undefined = null,
): FindingComment => ({
  kind: "comment",
  id: comment.id,
  authorPartyId: comment.authorPartyId,
  authorName: authorNameOf(author),
  body: comment.deletedAt ? null : comment.body,
  createdAt: comment.createdAt.toISOString(),
  editedAt: comment.editedAt?.toISOString() ?? null,
  deletedAt: comment.deletedAt?.toISOString() ?? null,
});
