import type { FindingDecision } from "../schemas";
import { commentAuthorLabel, decisionText } from "../utils";
import { FindingCommentTime } from "./finding-comment-time";

// -----
// One triage decision in the thread: a single line, "Alex marked
// this fixed", with the time after it. An accepted risk shows
// the reason under it.
// -----
export function FindingDecisionItem({ decision }: { decision: FindingDecision }) {
  return (
    <li className="grid gap-1 border-l-2 pl-3 text-sm">
      <p className="flex flex-wrap items-center gap-x-2">
        <span>
          <span className="font-medium">{commentAuthorLabel(decision.actorName)}</span> {decisionText(decision)}
        </span>
        <FindingCommentTime value={decision.createdAt} />
      </p>
      {decision.status === "accepted_risk" && decision.note && <p className="text-muted-foreground">{decision.note}</p>}
    </li>
  );
}
