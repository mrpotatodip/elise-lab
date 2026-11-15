import { useState } from "react";
import { Button } from "#/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "#/components/ui/dialog";

type FindingCommentDeleteDialogProps = {
  pending: boolean;
  onConfirm: () => Promise<void>;
};

// -----
// Asks before it deletes: the text cannot be brought back, and a
// "deleted" note stays in its place for everyone.
// -----
export function FindingCommentDeleteDialog({ pending, onConfirm }: FindingCommentDeleteDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-status-danger hover:text-status-danger" />}>Delete</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete this comment?</DialogTitle>
          <DialogDescription>The text is removed for good. The discussion keeps a note that a comment was deleted, and the account's audit trail records who deleted it.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Keep it</DialogClose>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() => {
              onConfirm()
                .then(() => setOpen(false))
                .catch(() => undefined);
            }}
          >
            {pending ? "Deleting" : "Delete comment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
