import type { ReactNode } from "react";
import { Card } from "#/components/ui/card";
import { cn } from "#/lib/utils";
import { ShellStatCell as Cell } from "#/modules/shell";
import { ScanSeverityDots, scanPlural } from "#/modules/scan";
import type { Repo, RepoBranch } from "../schemas";
import { repoTotals } from "../utils";

type RepoSummaryStripProps = { repos: readonly Repo[] } | { branch: RepoBranch["open"]; verdict?: ReactNode };

// -----
// The same four answers as the repository summary, as one card with one lead
// number instead of four equal tiles: most of the time three of them are 0, and
// four boxes of equal weight hide the one that is not. No icon chips and no
// tints: colour belongs to the findings themselves (the severity dots).
// Given one branch's counts, it says the same four things about that branch.
// A page can pass the commit's ship answer in as a first, wider cell: it then
// leads the strip, the open count steps down to a plain cell, and the notes
// get shorter so five cells fit one row.
// -----
export function RepoSummaryStrip(props: RepoSummaryStripProps) {
  const totals = "repos" in props ? repoTotals(props.repos) : props.branch;
  const verdict = "branch" in props ? props.verdict : undefined;
  const short = Boolean(verdict);
  const notRated = totals.total - Object.values(totals.severity).reduce((sum, count) => sum + count, 0);
  const where = "repos" in props ? `Across ${scanPlural(props.repos.length, "repository", "repositories")}.` : "On this branch.";

  return (
    <section aria-label={"repos" in props ? "Summary across repositories" : "Summary of this branch"} className="grid gap-6">
      <Card className={cn("grid divide-y overflow-hidden lg:divide-x lg:divide-y-0", short ? "lg:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))]" : "lg:grid-cols-4")}>
        {verdict}
        <Cell
          lead={!short}
          label="Open findings"
          value={totals.total}
          note={
            totals.total === 0 ? (
              `${where} Nothing is open.`
            ) : (
              <>
                <ScanSeverityDots counts={totals.severity} />
                {notRated > 0 && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <span aria-hidden="true" className="size-1.5 rounded-full border border-muted-foreground" />
                    <span className="tabular-nums">{notRated}</span> not rated
                  </span>
                )}
              </>
            )
          }
        />
        <Cell
          label="Came back"
          value={totals.regressed}
          note={totals.regressed > 0 ? (short ? "Fixed before, reported again." : "Fixed before, reported again. Look at these first.") : short ? "Nothing fixed has returned." : "Nothing that was fixed has returned."}
        />
        <Cell
          label="Needs a person"
          value={totals.needsValidation}
          note={totals.needsValidation > 0 ? (short ? "Unverified. Check by hand." : "Likely but unverified. Check by hand before acting.") : short ? "All verified." : "Every open finding was verified."}
        />
        <Cell
          label={short ? "Not in full scan" : "Not in the latest full scan"}
          value={totals.unchecked}
          note={
            totals.unchecked > 0
              ? short
                ? "The latest full scan missed them."
                : "The latest full scan did not see them. They stay open until a person decides them."
              : short
                ? "All in the latest full scan."
                : "Every open finding is in the latest full scan of its branch."
          }
        />
      </Card>
    </section>
  );
}
