import { useState } from "react";
import { Button } from "#/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "#/components/ui/dialog";

type UploadRemoveDialogProps = {
  trigger: string;
  triggerLabel: string;
  title: string;
  description: string;
  confirm: string;
  pending: boolean;
  onConfirm: () => Promise<void>;
};

// -----
// Asks before a zip or a whole app is deleted: the bytes are
// gone for good, and only the Scans that read them stay.
// -----
export function UploadRemoveDialog({ trigger, triggerLabel, title, description, confirm, pending, onConfirm }: UploadRemoveDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" variant="ghost" size="sm" aria-label={triggerLabel} className="text-status-danger hover:text-status-danger" />}>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>Keep it</DialogClose>
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={() => {
              onConfirm()
                .then(() => setOpen(false))
                .catch(() => undefined);
            }}
          >
            {pending ? "Removing" : confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
