import { Card, CardContent, CardHeader } from "#/components/ui/card";
import { SkeletonBar, SkeletonCard, SkeletonStatStrip } from "#/components/ui/skeleton";
import { cn } from "#/lib/utils";
import { ShellPageHeader } from "#/modules/shell";

function PanelCardSkeleton({ className }: { className?: string }) {
  return (
    <Card className={cn("h-99", className)}>
      <CardHeader className="gap-1.5">
        <SkeletonBar className="h-5 w-28" />
        <SkeletonBar className="h-4 w-44" />
      </CardHeader>
      <CardContent>
        <SkeletonBar className="h-56 w-full" />
      </CardContent>
    </Card>
  );
}

// -----
// Shaped like ScanOverview: the header is static text so it renders for real,
// then the ship answer, the count strip, the action list, the recent scans with
// the success ring, and the activity chart.
// -----
export function ScanOverviewSkeleton() {
  return (
    <>
      <ShellPageHeader title="Overview" description="What needs your attention across your repositories, what to do about it, and how your scans are going." />
      <output className="contents" aria-label="Loading">
        <SkeletonBar className="h-16 w-full rounded-xl" />
        <SkeletonStatStrip />
        <SkeletonCard className="h-94" rows={4} />
        <div className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <SkeletonCard className="h-94" rows={4} />
          <PanelCardSkeleton />
        </div>
        <PanelCardSkeleton />
      </output>
    </>
  );
}
