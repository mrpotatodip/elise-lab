import { useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "#/components/ui/button";
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetHeader } from "#/components/ui/sheet";
import type { Finding } from "../schemas";
import { ScanFindingDetail } from "./scan-finding-detail";
import { ScanFindingHeader } from "./scan-finding-header";

type ScanFindingSheetProps = {
  findings: readonly Finding[];
  selected: number | undefined;
  onSelect: (index: number | undefined) => void;
  status?: ReactNode;
  facts?: ReactNode;
  decision?: ReactNode;
  decisionHint?: ReactNode;
  comment?: ReactNode;
};

// -----
// One finding at a time in a side panel: the reviewer reads the impact, the
// evidence and the fix in a single column, then steps to the next finding
// without going back to the list. The list keeps the selection, so closing
// the panel leaves the reviewer where they were.
// -----
export function ScanFindingSheet({ findings, selected, onSelect, status, facts, decision, decisionHint, comment }: ScanFindingSheetProps) {
  const [closing, setClosing] = useState(false);
  const finding = selected === undefined ? undefined : findings[selected];
  const hasPrevious = selected !== undefined && selected > 0;
  const hasNext = selected !== undefined && selected < findings.length - 1;

  return (
    <Sheet
      open={finding !== undefined && !closing}
      onOpenChange={(open) => {
        if (!open) setClosing(true);
      }}
      onOpenChangeComplete={(open) => {
        if (!open && closing) {
          setClosing(false);
          onSelect(undefined);
        }
      }}
    >
      <SheetContent
        className="max-w-[56rem] [transition-property:transform,right] data-[nested-dialog-open]:right-[36rem]"
        aria-keyshortcuts="ArrowLeft ArrowRight"
        onKeyDown={(event) => {
          if (selected === undefined || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
          if (event.target instanceof HTMLElement && event.target.getAttribute("role") === "combobox") return;
          if (event.key === "ArrowLeft" && hasPrevious) onSelect(selected - 1);
          if (event.key === "ArrowRight" && hasNext) onSelect(selected + 1);
        }}
      >
        {finding && selected !== undefined && (
          <>
            <SheetHeader>
              <ScanFindingHeader finding={finding} aside={`${selected + 1} of ${findings.length}`} />
            </SheetHeader>
            <SheetBody className="grid content-start gap-8">
              {status}
              <ScanFindingDetail finding={finding} layout="sheet" />
              {finding.detail && (
                <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-t pt-6">
                  <div className="grid content-start gap-0.5">
                    <dt className="text-xs text-muted-foreground">Type</dt>
                    <dd className="text-sm font-medium">{finding.detail.class}</dd>
                  </div>
                  {facts}
                </dl>
              )}
            </SheetBody>
            <SheetFooter>
              <div className="flex items-center gap-3">
                {decision}
                {comment}
              </div>
              <p className="sr-only">Use the left and right arrow keys to move between findings.</p>
              <div className="ml-auto flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={!hasPrevious} onClick={() => onSelect(selected - 1)}>
                  <ArrowLeft aria-hidden="true" />
                  Previous
                </Button>
                <Button variant="outline" size="sm" disabled={!hasNext} onClick={() => onSelect(selected + 1)}>
                  Next
                  <ArrowRight aria-hidden="true" />
                </Button>
              </div>
              {decisionHint && <div className="basis-full">{decisionHint}</div>}
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
