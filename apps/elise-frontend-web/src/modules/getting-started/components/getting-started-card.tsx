import type { ReactNode } from "react";
import { Link, useRouteContext } from "@tanstack/react-router";
import { Check, Circle } from "lucide-react";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { cn } from "#/lib/utils";
import { RUNNER_LOGIN_COMMAND } from "#/modules/runner";
import { ScanNewDialog } from "#/modules/scan";
import { CopyCommand, INLINE_LINK_CLASS } from "#/modules/shared";
import { GETTING_STARTED_DESKTOP_URL, GETTING_STARTED_DOCTOR_COMMAND, GETTING_STARTED_INSTALL_COMMAND } from "../constants";
import { useGettingStarted, useGettingStartedFlag } from "../hooks";
import type { GettingStartedTaskKey } from "../utils";

type TaskProps = {
  done: boolean;
  title: string;
  children: ReactNode;
};

function Task({ done, title, children }: TaskProps) {
  const Icon = done ? Check : Circle;
  return (
    <li className="flex gap-3 py-4 first:pt-0 last:pb-0">
      <span aria-hidden="true" className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full", done ? "bg-status-success-soft text-status-success" : "text-muted-foreground")}>
        <Icon className="size-3.5" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <h3 className={cn("text-sm font-semibold leading-snug", done && "text-muted-foreground")}>
          {title}
          <span className="sr-only">{done ? " (done)" : " (open)"}</span>
        </h3>
        {children}
      </div>
    </li>
  );
}

export function GettingStartedCard() {
  const { user } = useRouteContext({ from: "/_app" });
  const accountId = user?.accountId ?? "";
  const result = useGettingStarted();
  const [, setGitSkipped] = useGettingStartedFlag(accountId, "git-skipped");
  const [, setDismissed] = useGettingStartedFlag(accountId, "dismissed");

  if (!result?.show) return null;
  const done = (key: GettingStartedTaskKey) => result.tasks.find((task) => task.key === key)?.done ?? false;
  const skip = () => setGitSkipped(true);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="grid gap-1.5">
          <CardTitle>Getting started</CardTitle>
          <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">Five setup tasks take you to your first Report. They tick themselves as Elise sees your Runner and Scans.</p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <a href={GETTING_STARTED_DESKTOP_URL} target="_blank" rel="noreferrer" className={cn(INLINE_LINK_CLASS, "min-h-6")}>
            Prefer a window?
          </a>
          <Button type="button" size="sm" variant="ghost" onClick={() => setDismissed(true)}>
            Dismiss
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <ol className="flex flex-col divide-y">
          <Task done={done("install")} title="Install the Runner">
            <CopyCommand command={GETTING_STARTED_INSTALL_COMMAND} />
            <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">Claude Code must be installed and signed in on that computer.</p>
          </Task>
          <Task done={done("login")} title="Log the Runner in">
            <CopyCommand command={RUNNER_LOGIN_COMMAND} />
            <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">It opens this site so you can approve the computer on the device page.</p>
          </Task>
          <Task done={done("git-access")} title="Check git access (private repositories only)">
            <CopyCommand command={GETTING_STARTED_DOCTOR_COMMAND} />
            {done("git-access") ? null : (
              <div>
                <Button type="button" size="sm" variant="outline" onClick={skip}>
                  Skip
                </Button>
              </div>
            )}
          </Task>
          <Task done={done("first-scan")} title="Start a first Scan">
            <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">
              Keep <code className="font-mono">elise-runner run</code> open on the computer so it picks the Scan up.
            </p>
            <div>
              <ScanNewDialog label="Start a Scan" variant="outline" />
            </div>
          </Task>
          <Task done={done("report")} title="Read the Report">
            <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">
              When the Scan finishes, open it from{" "}
              <Link to="/scans" className={INLINE_LINK_CLASS}>
                Scans
              </Link>
              . This card goes away once you have a Report.
            </p>
          </Task>
        </ol>
      </CardContent>
    </Card>
  );
}
