import { useState } from "react";
import { MessageSquare } from "lucide-react";
import { Button } from "#/components/ui/button";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "#/components/ui/sheet";
import { FindingCommentThread } from "./finding-comment-thread";

type FindingDiscussionButtonProps = {
  repo: string;
  fingerprint: string;
  title: string;
};

// -----
// The way into a finding's discussion, from the finding's row. The talk
// has a side panel of its own, apart from the panel that holds the
// finding's facts, so each one has a single purpose.
// -----
export function FindingDiscussionButton({ repo, fingerprint, title }: FindingDiscussionButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" variant="ghost" size="sm" aria-haspopup="dialog" aria-label={`Discussion about ${title}`} onClick={() => setOpen(true)}>
        <MessageSquare aria-hidden="true" />
        Discussion
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Discussion</SheetTitle>
            <SheetDescription>{title}</SheetDescription>
          </SheetHeader>
          <SheetBody>{open && <FindingCommentThread repo={repo} fingerprint={fingerprint} />}</SheetBody>
        </SheetContent>
      </Sheet>
    </>
  );
}
