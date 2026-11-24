import { useState, type ReactNode } from "react";
import { MessageSquare } from "lucide-react";
import { Button } from "#/components/ui/button";
import { Sheet, SheetBody, SheetContent, SheetHeader } from "#/components/ui/sheet";
import { ScanFindingHeader, type Finding } from "#/modules/scan";
import { FindingCommentThread } from "./finding-comment-thread";

type FindingDiscussionButtonProps = {
  repo: string;
  fingerprint: string;
  finding: Finding;
  status?: ReactNode;
};

// -----
// The way into a finding's discussion, from the finding's row. The talk
// has a side panel of its own, apart from the panel that holds the
// finding's facts, so each one has a single purpose. Its header is the
// finding's own (severity, state, title, place), with its decision
// beside the badges and a short summary of the impact, so the reader
// knows what is being discussed without going back.
// -----
export function FindingDiscussionButton({ repo, fingerprint, finding, status }: FindingDiscussionButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-haspopup="dialog"
        aria-label={`Discussion about ${finding.title}`}
        onClick={() => setOpen(true)}
      >
        <MessageSquare aria-hidden="true" />
        Discussion
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <SheetHeader>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Discussion</p>
            <ScanFindingHeader finding={finding} badges={status} titlePrefix="Discussion: " showImpact />
          </SheetHeader>
          <SheetBody>{open && <FindingCommentThread repo={repo} fingerprint={fingerprint} />}</SheetBody>
        </SheetContent>
      </Sheet>
    </>
  );
}
