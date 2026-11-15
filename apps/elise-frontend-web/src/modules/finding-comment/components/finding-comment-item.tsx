import type { ReactNode } from "react";
import { Avatar, AvatarFallback } from "#/components/ui/avatar";
import { ScanTime } from "#/modules/scan";
import type { FindingComment } from "../schemas";
import { commentAuthorLabel, commentInitials } from "../utils";
import { FindingCommentBody } from "./finding-comment-body";

type FindingCommentItemProps = {
  comment: FindingComment;
  markers?: ReactNode;
  actions?: ReactNode;
};

// -----
// One comment: who, when, then the text. markers sit after the time
// (the "edited" and "deleted" notes) and actions sit at the right end
// of the same line (edit and delete).
// -----
export function FindingCommentItem({ comment, markers, actions }: FindingCommentItemProps) {
  return (
    <li className="flex gap-3">
      <Avatar className="size-8">
        <AvatarFallback>{commentInitials(comment.authorName) || "?"}</AvatarFallback>
      </Avatar>
      <div className="grid min-w-0 flex-1 content-start gap-1">
        <div className="flex flex-wrap items-center gap-x-2 text-xs">
          <span className="text-sm font-medium">{commentAuthorLabel(comment.authorName)}</span>
          <ScanTime value={comment.createdAt} />
          {markers}
          {actions && <span className="ml-auto flex items-center gap-1">{actions}</span>}
        </div>
        {comment.body === null ? <p className="text-sm italic text-muted-foreground">This comment was deleted.</p> : <FindingCommentBody text={comment.body} />}
      </div>
    </li>
  );
}
