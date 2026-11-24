import { useState } from "react";
import { Button } from "#/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "#/components/ui/dialog";

type FindingCommentDeleteDialogProps = {
  onConfirm: () => void;
};

// -----
// Asks before it deletes: the text cannot be brought back, and a
// "deleted" note stays in its place for everyone. It closes at once;
// the thread already shows the note and puts the comment back if the
// delete fails.
// -----
export function FindingCommentDeleteDialog({ onConfirm }: FindingCommentDeleteDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-status-danger hover:text-status-danger" />
        }
      >
        Delete
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete this comment?</DialogTitle>
          <DialogDescription>
            The text is removed for good. The discussion keeps a note that a comment was deleted, and the account's
            audit trail records who deleted it.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Keep it</DialogClose>
          <Button
            variant="destructive"
            onClick={() => {
              setOpen(false);
              onConfirm();
            }}
          >
            Delete comment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
