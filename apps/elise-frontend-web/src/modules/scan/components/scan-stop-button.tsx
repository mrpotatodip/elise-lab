import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "#/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "#/components/ui/dialog";
import { stopScan } from "../api";
import { isScanActive, scanKeys } from "../hooks";
import type { ScanStatus } from "../schemas";

export const canStopScan = (scan: Pick<ScanStatus, "status" | "runner">): boolean => isScanActive(scan.status) && Boolean(scan.runner);

export function ScanStopButton({ scanId, size = "sm", className }: { scanId: string; size?: "sm" | "default"; className?: string }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const stop = useMutation({
    mutationFn: () => stopScan({ data: { scanId } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: scanKeys.all });
      setOpen(false);
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) stop.reset();
      }}
    >
      <DialogTrigger render={<Button variant="outline" size={size} className={className} />}>Stop</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Stop this scan?</DialogTitle>
          <DialogDescription>
            The scan ends at once. No report and no findings are kept. A Runner built before this change keeps running until it finishes, and its result is dropped.
          </DialogDescription>
        </DialogHeader>
        {stop.isError && <p role="alert" className="text-sm text-status-danger">{stop.error.message}</p>}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Keep running</DialogClose>
          <Button variant="destructive" disabled={stop.isPending} onClick={() => stop.mutate()}>
            {stop.isPending ? "Stopping" : "Stop scan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
