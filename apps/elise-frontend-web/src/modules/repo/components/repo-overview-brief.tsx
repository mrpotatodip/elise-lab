import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowDown, ChevronDown, CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription } from "#/components/ui/alert";
import { Badge } from "#/components/ui/badge";
import { Button, buttonVariants } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Collapsible, CollapsiblePanel } from "#/components/ui/collapsible";
import { cn } from "#/lib/utils";
import { SEVERITIES, ScanTime, scanPlural } from "#/modules/scan";
import type { Repo } from "../schemas";
import { overviewActions, overviewLatestScanAt, overviewVerdict, repoTotals, type OverviewAction, type OverviewBudget, type OverviewTone } from "../utils";
import { RepoAddDialog } from "./repo-add-dialog";

const TONE = {
  danger: { icon: CircleAlert, text: "text-status-danger", soft: "bg-status-danger-soft", mark: "bg-mark-danger", badge: "destructive", label: "Urgent" },
  warning: { icon: TriangleAlert, text: "text-status-warning", soft: "bg-status-warning-soft", mark: "bg-mark-warning", badge: "warning", label: "Needs a look" },
  info: { icon: Info, text: "text-status-info", soft: "bg-status-info-soft", mark: "bg-mark-info", badge: "info", label: "When convenient" },
} as const satisfies Record<OverviewTone, { icon: typeof Info; text: string; soft: string; mark: string; badge: "destructive" | "warning" | "info"; label: string }>;

const ALERT = { danger: "destructive", warning: "warning", success: "success" } as const;
const MARK = { critical: "bg-mark-critical", high: "bg-mark-high", medium: "bg-mark-medium", low: "bg-mark-low", informational: "bg-mark-informational" } as const;
const noun = (count: number, one: string, many: string) => (count === 1 ? one : many);
const LINK ="inline-flex min-h-6 items-center gap-1 rounded-sm text-xs font-medium text-primary-ink underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function ActionLink({ action, canManageBudget }: { action: OverviewAction; canManageBudget: boolean }) {
  const className = buttonVariants({ size: "sm" });
  if (action.repoId !== null) {
    return (
      <Link to="/repos/$repoId" params={{ repoId: action.repoId }} className={className}>
        {action.primary}
      </Link>
    );
  }
  if (!canManageBudget) return null;
  return (
    <Link to="/settings/budget" className={className}>
      {action.primary}
    </Link>
  );
}

function ActionRow({ action, open, onOpenChange, first, canManageBudget }: { action: OverviewAction; open: boolean; onOpenChange: (open: boolean) => void; first: boolean; canManageBudget: boolean }) {
  const tone = TONE[action.tone];
  const Icon = tone.icon;
  const hasRepos = action.repos.length > 0;
  return (
    <li id={`overview-action-${action.key}`} className="relative scroll-mt-24 py-5 pl-5 first:pt-0 last:pb-0">
      <span aria-hidden="true" className={cn("absolute bottom-5 left-0 top-5 w-[3px] rounded-full first:top-0 last:bottom-0", tone.mark)} />
      <Collapsible open={open} onOpenChange={onOpenChange}>
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start md:gap-8">
          <div className="flex min-w-0 gap-4">
            <span aria-hidden="true" className={cn("mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg", tone.soft, tone.text)}>
              <Icon className="size-4" />
            </span>
            <div className="grid min-w-0 gap-2">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                <h3 className="text-[15px] font-semibold leading-snug">{action.title}</h3>
                {first && <Badge variant="default">Start here</Badge>}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant={tone.badge}>{tone.label}</Badge>
                <Badge variant="outline">For {action.who}</Badge>
                <Badge variant="neutral" className="font-mono">
                  {action.where}
                </Badge>
              </div>
              <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">{action.detail}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 md:justify-end">
            <ActionLink action={action} canManageBudget={canManageBudget} />
            {hasRepos && (
              <Button variant="outline" size="sm" aria-expanded={open} onClick={() => onOpenChange(!open)}>
                {open ? "Hide" : "Show"} where
                <ChevronDown aria-hidden="true" className={cn("transition-transform duration-200 ease-out", open && "rotate-180")} />
              </Button>
            )}
          </div>
        </div>
        {hasRepos && (
          <CollapsiblePanel>
            <ul className="ml-12 mt-4 grid divide-y rounded-lg bg-muted/60 px-4">
              {action.repos.map((share) => (
                <li key={share.id} className="flex min-h-12 items-center justify-between gap-4 py-2 text-sm">
                  <span className="truncate font-medium">{share.name}</span>
                  <span className="flex shrink-0 items-center gap-4">
                    {action.key !== "failed" && action.key !== "unscanned" && <span className="tabular-nums text-muted-foreground">{share.count}</span>}
                    <Link to="/repos/$repoId" params={{ repoId: share.id }} className={LINK}>
                      Open
                    </Link>
                  </span>
                </li>
              ))}
            </ul>
          </CollapsiblePanel>
        )}
      </Collapsible>
    </li>
  );
}

type Kpi = { label: string; value: number; tone?: OverviewTone; note: ReactNode; target?: string; cta: string };

function KpiTile({ kpi, onJump }: { kpi: Kpi; onJump: (key: string) => void }) {
  const target = kpi.target;
  return (
    <button
      type="button"
      disabled={!target}
      onClick={() => target && onJump(target)}
      className="grid grid-rows-[auto_auto_1fr_auto] gap-3 p-6 text-left transition-colors enabled:hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-default"
    >
      <span className="text-sm font-medium text-muted-foreground">{kpi.label}</span>
      <span className={cn("text-[32px] font-semibold leading-none tracking-tight tabular-nums", kpi.value === 0 ? "text-muted-foreground" : kpi.tone && TONE[kpi.tone].text)}>{kpi.value}</span>
      <span className="grid gap-1 text-sm leading-relaxed text-muted-foreground">{kpi.note}</span>
      {target && (
        <span className={LINK}>
          {kpi.cta}
          <ArrowDown aria-hidden="true" className="size-3" />
        </span>
      )}
    </button>
  );
}

type RepoOverviewBriefProps = { repos: readonly Repo[]; budget?: OverviewBudget; canManageBudget: boolean };

// -----
// The first thing on the Overview, for a reader who does not read findings: the
// ship answer in one line, four counts that each jump to their group, then the
// groups most urgent first, each with who it is for and one button. Lower-risk
// groups stay folded until asked, so the urgent ones are never pushed down.
// -----
export function RepoOverviewBrief({ repos, budget, canManageBudget }: RepoOverviewBriefProps) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  if (repos.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Nothing is being watched yet</CardTitle>
          <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">Add a repository and run a first scan. What needs your attention will be listed here, in plain words, with what to do about it.</p>
        </CardHeader>
        <CardContent>
          <RepoAddDialog />
        </CardContent>
      </Card>
    );
  }

  const actions = overviewActions(repos, budget);
  const verdict = overviewVerdict(actions);
  const visible = showAll ? actions : actions.filter((a) => a.tone !== "info");
  const hidden = actions.length - visible.length;
  const totals = repoTotals(repos);
  const notRated = totals.total - SEVERITIES.reduce((sum, s) => sum + totals.severity[s], 0);
  const latest = overviewLatestScanAt(repos);
  const serious = totals.severity.critical + totals.severity.high;
  const VerdictIcon = verdict.tone === "success" ? CircleCheck : CircleAlert;
  const first = actions[0];

  const jumpTo = (key: string) => {
    const target = actions.find((a) => a.key === key);
    if (!target) return;
    if (!visible.includes(target)) setShowAll(true);
    setOpenKey(key);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => document.getElementById(`overview-action-${key}`)?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" })),
    );
  };
  const has = (key: string) => (actions.some((a) => a.key === key) ? key : undefined);

  const kpis: Kpi[] = [
    {
      label: "Open problems",
      value: totals.total,
      tone: serious > 0 ? "danger" : undefined,
      target: first?.key,
      cta: `See all ${totals.total} below`,
      note:
        totals.total === 0 ? (
          "Nothing is open."
        ) : (
          <span className="flex flex-wrap gap-x-3 gap-y-1">
            {SEVERITIES.filter((s) => totals.severity[s] > 0).map((s) => (
              <span key={s} className="flex items-center gap-1 text-xs capitalize">
                <span aria-hidden="true" className={cn("size-1.5 rounded-full", MARK[s])} />
                <span className="tabular-nums">{totals.severity[s]}</span> {s}
              </span>
            ))}
            {notRated > 0 && (
              <span className="flex items-center gap-1 text-xs">
                <span aria-hidden="true" className="size-1.5 rounded-full border border-muted-foreground" />
                <span className="tabular-nums">{notRated}</span> not rated
              </span>
            )}
          </span>
        ),
    },
    { label: "Came back", value: totals.regressed, tone: "danger", target: has("back"), cta: `See the ${noun(totals.regressed, "problem", "problems")}`, note: totals.regressed > 0 ? "Fixed before, found again." : "Nothing fixed has returned." },
    { label: "Waiting for a person", value: totals.needsValidation, tone: "warning", target: has("check"), cta: `See the ${noun(totals.needsValidation, "finding", "findings")}`, note: totals.needsValidation > 0 ? "Likely, but nobody has confirmed them yet." : "Every open finding was verified." },
    { label: "Possibly out of date", value: totals.unchecked, tone: "info", target: has("stale"), cta: `See the ${noun(totals.unchecked, "finding", "findings")}`, note: totals.unchecked > 0 ? "The latest full scan did not see them." : "Every open finding is in the latest full scan." },
  ];

  return (
    <>
      <Alert variant={ALERT[verdict.tone]} className="items-center">
        <VerdictIcon aria-hidden="true" />
        <div className="grid min-w-0 flex-1 items-center gap-x-6 gap-y-3 md:grid-cols-[minmax(0,1fr)_auto]">
          <AlertDescription className="max-w-copy text-foreground">
            <span className="mr-2 text-base font-semibold">{verdict.word}.</span>
            {verdict.line}
            {latest && (
              <span className="text-muted-foreground">
                {" "}
                Based on the latest scan, <ScanTime value={latest} />.
              </span>
            )}
          </AlertDescription>
          {first && (
            <Button size="sm" onClick={() => jumpTo(first.key)}>
              Start with the first item
            </Button>
          )}
        </div>
      </Alert>

      <Card className="group grid divide-y overflow-hidden lg:grid-cols-4 lg:divide-x lg:divide-y-0">
        {kpis.map((kpi) => (
          <KpiTile key={kpi.label} kpi={kpi} onJump={jumpTo} />
        ))}
      </Card>

      {actions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>What to do, most urgent first</CardTitle>
            <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">Grouped by what to do about each problem. Each group says what it means, who can deal with it and where to go.</p>
          </CardHeader>
          <CardContent className="grid gap-5">
            <ol className="grid divide-y">
              {visible.map((action, index) => (
                <ActionRow key={action.key} action={action} first={index === 0} open={openKey === action.key} onOpenChange={(next) => setOpenKey(next ? action.key : null)} canManageBudget={canManageBudget} />
              ))}
            </ol>
            {(hidden > 0 || showAll) && (
              <Button variant="ghost" size="sm" className="justify-self-start" onClick={() => setShowAll((value) => !value)}>
                {showAll ? "Show fewer actions" : `Show ${scanPlural(hidden, "lower-priority action", "lower-priority actions")}`}
                <ChevronDown aria-hidden="true" className={cn("transition-transform duration-200 ease-out", showAll && "rotate-180")} />
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </>
  );
}
