import { Button } from "#/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "#/components/ui/dialog";

type FindingWeakReasonDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  onSaveAnyway: () => void;
};

export function FindingWeakReasonDialog({ open, onOpenChange, pending, onSaveAnyway }: FindingWeakReasonDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>This reason may be too thin</DialogTitle>
          <DialogDescription>
            A Signal from TypeSafe suggests the note does not say why the risk is acceptable for this finding. It is only a hint. You can edit the reason or save it as it is, and the Audit trail will record that you saw the warning.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            Edit the reason
          </Button>
          <Button type="button" disabled={pending} onClick={onSaveAnyway}>
            {pending ? "Saving" : "Save anyway"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
