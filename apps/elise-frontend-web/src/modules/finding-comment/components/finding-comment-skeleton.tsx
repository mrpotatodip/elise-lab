import { range, SkeletonBar } from "#/components/ui/skeleton";

// -----
// What shows while a thread loads: two comments in the shape of real ones
// (an avatar, who and when, then two lines of text), so the thread does not
// jump when it arrives. A screen reader hears one "Loading comments".
// -----
export function FindingCommentSkeleton() {
  return (
    <output className="grid gap-5">
      <span className="sr-only">Loading comments</span>
      {range(2).map((row) => (
        <div key={row} aria-hidden="true" className="flex gap-3">
          <SkeletonBar className="size-8 shrink-0 rounded-full" />
          <div className="grid min-w-0 flex-1 content-start gap-2">
            <div className="flex items-center gap-2">
              <SkeletonBar className="h-4 w-24" />
              <SkeletonBar className="h-3 w-16" />
            </div>
            <SkeletonBar className="h-4 w-full" />
            <SkeletonBar className="h-4 w-2/3" />
          </div>
        </div>
      ))}
    </output>
  );
}
