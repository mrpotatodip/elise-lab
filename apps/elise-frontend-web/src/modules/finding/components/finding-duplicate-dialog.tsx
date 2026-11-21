import { useState } from "react";
import { Button } from "#/components/ui/button";
import { Dialog, DialogBody, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "#/components/ui/dialog";
import { Label } from "#/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";

export type DuplicateCandidate = { fingerprint: string; title: string };

type FindingDuplicateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  findingTitle: string;
  candidates: readonly DuplicateCandidate[];
  suggested?: string | null;
  pending: boolean;
  onConfirm: (duplicateOf: string) => void;
};

export function FindingDuplicateDialog({ open, onOpenChange, findingTitle, candidates, suggested = null, pending, onConfirm }: FindingDuplicateDialogProps) {
  const [picked, setKept] = useState<string | null>(null);
  const kept = picked ?? suggested;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark as a duplicate?</DialogTitle>
          <DialogDescription>The Finding you pick carries the problem. This one no longer counts in the Verdict.</DialogDescription>
        </DialogHeader>
        <DialogBody className="grid content-start gap-6">
          <p className="rounded-lg border bg-muted/50 px-4 py-3 text-sm leading-relaxed">
            <span className="font-medium">{findingTitle}</span>
          </p>
          <div className="grid gap-2">
            <Label htmlFor="duplicate-of">Which Finding does it duplicate?</Label>
            <Select value={kept} items={candidates.map((candidate) => ({ value: candidate.fingerprint, label: candidate.title }))} onValueChange={setKept}>
              <SelectTrigger id="duplicate-of" className="w-full">
                <SelectValue placeholder="Pick a Finding" />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((candidate) => (
                  <SelectItem key={candidate.fingerprint} value={candidate.fingerprint}>
                    {candidate.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {candidates.length === 0 && <p className="text-xs text-muted-foreground">No other open Finding on this branch to point to.</p>}
          </div>
        </DialogBody>
        <DialogFooter className="flex items-center justify-end gap-3">
          <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
          <Button type="button" disabled={pending || kept === null} onClick={() => kept && onConfirm(kept)}>
            {pending ? "Saving" : "Mark duplicate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
