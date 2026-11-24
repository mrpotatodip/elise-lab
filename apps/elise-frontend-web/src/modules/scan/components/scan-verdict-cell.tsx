import { useQuery } from "@tanstack/react-query";
import { ChevronRight, CircleCheck, CircleDashed, CircleX } from "lucide-react";
import { cn } from "#/lib/utils";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "#/components/ui/dialog";
import { Skeleton } from "#/components/ui/skeleton";
import { scansQuery, verdictQuery } from "../hooks";
import type { Verdict } from "../schemas";
import { ScanNewDialog } from "./scan-new-dialog";
import { ScanVerdictRun } from "./scan-verdict-run";
import { openProblemsSummary, scanPlural, verdictBlockers, verdictScansToRun } from "../utils";

export const VERDICT_COPY = {
  pass: {
    title: "Clear to ship",
    note: "Scanned enough times and nothing open is over the limits. An AI audit can miss problems, so this is advice and not proof that the commit is safe.",
    variant: "success",
  },
  fail: { title: "Blocked", note: "This commit does not meet the scan policy.", variant: "destructive" },
  cannot_tell: {
    title: "Needs more scans",
    note: "This is not a failure. This commit needs more scans before the answer can be yes or no.",
    variant: "warning",
  },
} as const;

type Check = { label: string; detail: string; state: "ok" | "fail" | "wait"; problem: string };

const HISTORY_CODES = new Set(["unchecked_priors", "too_many_priors"]);

// -----
// The rule, one line per condition, each marked met or not. A commit ships
// only when all three are met; the first one not met is what to do next.
// -----
function verdictChecks(verdict: Verdict): Check[] {
  const { scans, limits, counts, reasons } = verdict;
  const missing = Math.max(0, scans.required - scans.counted);
  const historyReason = reasons.find((reason) => HISTORY_CODES.has(reason.code));
  const over: string[] = [];
  if (counts.critical > limits.critical) over.push(`${counts.critical} critical (allowed ${limits.critical})`);
  if (counts.high > limits.high) over.push(`${counts.high} high (allowed ${limits.high})`);
  if (counts.medium > limits.medium) over.push(`${counts.medium} medium (allowed ${limits.medium})`);
  if (counts.needsValidation > 0) over.push(`${counts.needsValidation} not checked by a person yet`);
  const openTotal =
    counts.critical + counts.high + counts.medium + counts.low + counts.informational + counts.needsValidation;

  return [
    {
      label: `Scans of this commit that add up to ${scans.required}`,
      detail:
        missing === 0
          ? `The scans of this commit add up to ${scans.counted}.`
          : `${scans.counted} of ${scans.required} so far. Run ${scanPlural(verdictScansToRun(missing), "more scan", "more scans")} of this exact commit. Each finished scan counts 1, but a scan that ran out of money or did none of the work it asked for counts 0.`,
      state: missing === 0 ? "ok" : "wait",
      problem: `${scans.counted} of ${scans.required} scans so far`,
    },
    {
      label: "Earlier problems re-checked",
      detail: historyReason ? historyReason.message : "The scans checked every problem that was already open.",
      state: historyReason ? "fail" : scans.counted === 0 ? "wait" : "ok",
      problem: "earlier problems not re-checked yet",
    },
    {
      label: "Nothing open blocks this commit",
      detail: `${over.length > 0 ? `${over.join(", ")}.` : openTotal === 0 ? "Nothing is open." : `${openTotal} open, all within the limits.`} Allowed: ${limits.critical} critical, ${limits.high} high, up to ${limits.medium} medium.`,
      state: over.length > 0 ? "fail" : "ok",
      problem: over.join(", "),
    },
  ];
}

// -----
// What stands between this commit and a pass, as one sentence the reader can act
// on. It follows the same three conditions as the checklist, so the two never
// disagree.
// -----
export function verdictNextSteps(verdict: Verdict): string {
  const { scans, limits, counts, reasons } = verdict;
  const missing = Math.max(0, scans.required - scans.counted);
  const steps: string[] = [];
  if (missing > 0)
    steps.push(`run ${scanPlural(verdictScansToRun(missing), "more scan", "more scans")} of this commit`);
  if (reasons.some((reason) => HISTORY_CODES.has(reason.code)))
    steps.push("scan again so earlier problems get re-checked");
  const overLimit =
    (counts.critical > limits.critical ? counts.critical : 0) +
    (counts.high > limits.high ? counts.high : 0) +
    (counts.medium > limits.medium ? counts.medium : 0);
  if (overLimit > 0) steps.push(`fix or accept ${scanPlural(overLimit, "problem", "problems")} over the limits`);
  if (counts.needsValidation > 0)
    steps.push(`have a person check ${scanPlural(counts.needsValidation, "problem", "problems")} by hand`);
  if (steps.length === 0) return "Nothing blocks this commit.";
  return `To pass: ${steps.join(", ")}.`;
}

const CHECK_ICON = {
  ok: { Icon: CircleCheck, className: "text-status-success", label: "Met" },
  fail: { Icon: CircleX, className: "text-status-danger", label: "Not met" },
  wait: { Icon: CircleDashed, className: "text-status-warning", label: "Waiting" },
} as const;

function VerdictChecklist({ verdict, next, extra }: { verdict: Verdict; next: string; extra: string }) {
  const checks = verdictChecks(verdict);
  const unmet = checks.filter((check) => check.state !== "ok");
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="ghost" size="sm" className="shrink-0" aria-label="Why this answer?" />}>
        Why?
        <ChevronRight aria-hidden="true" className="size-3.5" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Why this answer?</DialogTitle>
          <DialogDescription>
            {checks.length - unmet.length} of {checks.length} checks met
            {unmet.length > 0 ? `. Blocking: ${unmet.map((check) => check.problem).join("; ")}.` : "."}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-4">
          <p className="text-sm font-medium leading-relaxed">{next}</p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            A commit passes when all three are met. The answer uses every scan of this commit and the decisions your
            team recorded. A new push starts again at zero.
          </p>
          {extra && <p className="text-sm leading-relaxed text-muted-foreground">{extra}</p>}
          <ul className="grid gap-2.5">
            {checks.map((check) => {
              const { Icon, className, label } = CHECK_ICON[check.state];
              return (
                <li key={check.label} className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-2.5 text-sm">
                  <Icon aria-hidden="true" className={cn("mt-0.5 size-4", className)} />
                  <span>
                    <span className="font-medium">{check.label}</span>
                    <span className="sr-only"> ({label})</span>
                    <span className="block max-w-copy text-sm leading-relaxed text-muted-foreground">
                      {check.detail}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

// -----
// The open problems of the commit, for the "Why this answer?" dialog: how many
// block shipping, and, when the commit and the branch disagree, why the list
// below holds more or fewer.
// -----
function openProblemsWhy(verdict: Verdict, branchOpen: number) {
  const count = verdict.open.length;
  const older = Math.max(0, branchOpen - count);
  const oneOff = Math.max(0, count - branchOpen);
  const head =
    count === 0
      ? ""
      : `${scanPlural(count, "open problem", "open problems")} on this commit. ${openProblemsSummary(count, verdictBlockers(verdict).size)} `;
  const olderHint =
    older === 0
      ? ""
      : `The findings list also holds ${older === 1 ? "1 older finding that is" : `${older} older findings that are`} still open on this branch. `;
  const oneOffHint =
    oneOff === 0
      ? ""
      : `${oneOff === 1 ? "1 came from a one-off scan of this commit and is" : `${oneOff} came from a one-off scan of this commit and are`} not in the branch's findings.`;
  return `${head}${olderHint}${oneOffHint}`.trim();
}

// -----
// The buttons for the scans a verdict still lacks. One click runs the missing
// scan with the settings of the last one, and the other opens the options. A
// verdict with every scan it needs has no button.
// -----
function VerdictRescan({ verdict, repoId, repoUrl }: { verdict: Verdict; repoId: string; repoUrl: string }) {
  const { scans } = verdict;
  const needsScan = scans.required - scans.counted > 0;
  const { data: list } = useQuery(scansQuery());
  const last = list?.scans.find((scan) => scan.scanId === scans.ids[0]);
  if (!needsScan) return null;
  // -----
  // An upload app's commit is a zip's hash, which no ref can name: the
  // missing scan starts from the app's zip list instead.
  // -----
  if (last?.archive)
    return <ScanNewDialog label="Run the missing scan" size="sm" repo={repoUrl} provider="upload" repoId={repoId} />;
  return (
    <div className="flex flex-wrap items-start gap-3">
      {last && <ScanVerdictRun repoId={repoId} repoUrl={repoUrl} commit={verdict.commit} last={last} />}
      <ScanNewDialog
        label={last ? "Choose options" : "Run the missing scan"}
        size="sm"
        variant={last ? "outline" : "default"}
        repo={repoUrl}
        startRef={verdict.commit}
        startOptions={
          last && {
            model: last.model === "claude-opus-5-5" ? undefined : last.model,
            effort: last.effort,
            profile: last.profile,
          }
        }
      />
    </div>
  );
}

type ScanVerdictCellProps = {
  repoId: string;
  commit: string;
  repoUrl: string;
  branchOpen: number;
  findingsHref: string;
};

// -----
// The commit's answer as the first cell of a summary strip, laid out like the
// other cells (label, value, note) so it reads as one more figure: the answer
// in place of a number, as a status pill like a scan's (red, amber or green;
// the cell itself is not tinted), then a way to the list and to the checks.
// -----
export function ScanVerdictCell({ repoId, commit, repoUrl, branchOpen, findingsHref }: ScanVerdictCellProps) {
  const { data: verdict, isPending, error } = useQuery(verdictQuery(repoId, commit));
  const label = (
    <h2 className="text-sm font-medium text-muted-foreground">
      Ready to ship?{" "}
      <span className="font-normal">
        · Commit <span className="font-mono">{commit.slice(0, 7)}</span>
      </span>
    </h2>
  );

  if (isPending) {
    return (
      <div className="grid content-start gap-3 p-6">
        {label}
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-10" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="grid content-start gap-3 p-6">
        {label}
        <p className="text-sm text-destructive">We could not load the answer: {error.message}. Refresh to try again.</p>
      </div>
    );
  }

  const copy = VERDICT_COPY[verdict.verdict];
  const open = verdict.open.length;

  return (
    <div className="grid content-start gap-3 p-6">
      {label}
      <p className="flex h-8 items-center">
        <Badge variant={copy.variant}>
          <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
          {copy.title}
        </Badge>
      </p>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Weighs every scan of this commit and your team's decisions.
      </p>
      <div className="flex items-center gap-2">
        {open > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            nativeButton={false}
            render={
              <a
                href={findingsHref}
                aria-label={`Review ${scanPlural(open, "problem", "problems")} in Findings on this branch`}
              />
            }
          >
            Review {scanPlural(open, "problem", "problems")}
          </Button>
        )}
        <VerdictChecklist
          verdict={verdict}
          next={verdict.verdict === "pass" ? copy.note : verdictNextSteps(verdict)}
          extra={openProblemsWhy(verdict, branchOpen)}
        />
      </div>
      <VerdictRescan verdict={verdict} repoId={repoId} repoUrl={repoUrl} />
    </div>
  );
}
