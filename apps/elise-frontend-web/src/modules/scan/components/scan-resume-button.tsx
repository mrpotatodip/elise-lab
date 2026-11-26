import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "#/components/ui/button";
import { cn } from "#/lib/utils";
import { resumeScan } from "../api";
import { scanKeys } from "../hooks";
import type { ScanStatus } from "../schemas";
import { scanResumeState } from "../utils";

export function ScanResumeButton({
  scan,
  size = "default",
}: {
  scan: Pick<ScanStatus, "scanId" | "status" | "runner" | "failureCode" | "resumedByScanId" | "archive">;
  size?: "sm" | "default";
}) {
  const state = scanResumeState(scan);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const resume = useMutation({
    mutationFn: () => resumeScan({ data: { scanId: scan.scanId } }),
    onSuccess: async (queued) => {
      await queryClient.invalidateQueries({ queryKey: scanKeys.all });
      await navigate({ to: "/scans/$scanId", params: { scanId: queued.scanId } });
    },
  });

  if (state.kind === "hidden") return null;
  const reasonId = `resume-note-${scan.scanId}`;
  const note = state.kind === "disabled" ? state.reason : resume.isError ? resume.error.message : null;

  return (
    <div className="grid justify-items-end gap-1">
      <Button
        variant="outline"
        size={size}
        disabled={state.kind === "disabled" || resume.isPending}
        aria-describedby={note ? reasonId : undefined}
        onClick={() => resume.mutate()}
      >
        {resume.isPending ? "Resuming" : "Resume"}
      </Button>
      {note && (
        <p
          id={reasonId}
          role={resume.isError ? "alert" : undefined}
          className={cn("max-w-xs text-right text-xs", resume.isError ? "text-status-danger" : "text-muted-foreground")}
        >
          {note}
        </p>
      )}
    </div>
  );
}
