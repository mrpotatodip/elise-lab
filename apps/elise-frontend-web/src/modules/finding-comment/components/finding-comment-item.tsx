import type { ReactNode } from "react";
import { Avatar, AvatarFallback } from "#/components/ui/avatar";
import type { FindingComment } from "../schemas";
import { commentAuthorLabel, commentInitials } from "../utils";
import { FindingCommentBody } from "./finding-comment-body";
import { FindingCommentTime } from "./finding-comment-time";

type FindingCommentItemProps = {
  comment: FindingComment;
  markers?: ReactNode;
  actions?: ReactNode;
  editor?: ReactNode;
};

// -----
// One comment: who, when, then the text. markers sit after the time
// (the "edited" and "deleted" notes) and actions sit at the right end
// of the same line (edit and delete). editor takes the place of the
// text while its author edits it. A deleted comment is one small
// muted line with the time it was written, which keeps its place in
// the thread, and the time it was deleted: no avatar, no name.
// -----
export function FindingCommentItem({ comment, markers, actions, editor }: FindingCommentItemProps) {
  if (comment.body === null) {
    return (
      <li className="pl-11 text-xs text-muted-foreground">
        A comment from <FindingCommentTime value={comment.createdAt} /> was deleted
        {comment.deletedAt && (
          <>
            {" "}
            on <FindingCommentTime value={comment.deletedAt} />
          </>
        )}
        .
      </li>
    );
  }

  return (
    <li className="flex gap-3">
      <Avatar aria-hidden="true" className="size-8">
        <AvatarFallback className="bg-foreground/15 text-foreground ring-1 ring-inset ring-foreground/25">
          {commentInitials(comment.authorName) || "?"}
        </AvatarFallback>
      </Avatar>
      <div className="grid min-w-0 flex-1 content-start gap-1">
        <div className="flex flex-wrap items-center gap-x-2 text-xs">
          <span className="text-sm font-medium">{commentAuthorLabel(comment.authorName)}</span>
          <FindingCommentTime value={comment.createdAt} />
          {markers}
          {actions && <span className="ml-auto flex items-center gap-1">{actions}</span>}
        </div>
        {editor ?? <FindingCommentBody text={comment.body} />}
      </div>
    </li>
  );
}
