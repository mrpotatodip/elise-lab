import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Check, Circle, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { cn } from "#/lib/utils";
import { RUNNER_LOGIN_COMMAND, runnersQuery } from "#/modules/runner";
import { ScanNewDialog, scansQuery } from "#/modules/scan";
import { GETTING_STARTED_DESKTOP_URL, GETTING_STARTED_INSTALL_COMMAND } from "../constants";
import { useGettingStartedFlag } from "../hooks";
import { gettingStarted, type GettingStartedTaskKey } from "../utils";

const DOCTOR_COMMAND = "elise-runner doctor";
const LINK = "inline-flex min-h-6 items-center gap-1 rounded-sm text-xs font-medium text-primary-ink underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function Command({ command }: { command: string }) {
  return (
    <div className="flex items-center gap-2">
      <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded bg-muted px-2 py-1.5 font-mono text-xs">{command}</code>
      <Button
        type="button"
        size="sm"
        variant="outline"
        aria-label={`Copy ${command}`}
        onClick={() => {
          void navigator.clipboard.writeText(command).then(() => toast.success("Command copied."));
        }}
      >
        <Copy className="size-3.5" />
        Copy
      </Button>
    </div>
  );
}

function Task({ done, title, children }: { done: boolean; title: string; children: ReactNode }) {
  const Icon = done ? Check : Circle;
  return (
    <li className="flex gap-3 py-4 first:pt-0 last:pb-0">
      <span aria-hidden="true" className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full", done ? "bg-status-success-soft text-status-success" : "text-muted-foreground")}>
        <Icon className="size-3.5" />
      </span>
      <div className="grid min-w-0 flex-1 gap-2">
        <h3 className={cn("text-sm font-semibold leading-snug", done && "text-muted-foreground")}>
          {title}
          <span className="sr-only">{done ? " (done)" : " (open)"}</span>
        </h3>
        {children}
      </div>
    </li>
  );
}

export function GettingStartedCard({ accountId, canSeeRunners }: { accountId: string; canSeeRunners: boolean }) {
  const { data: runners } = useQuery({ ...runnersQuery(), enabled: canSeeRunners, refetchOnWindowFocus: "always" });
  const { data: list } = useQuery({ ...scansQuery(), refetchOnWindowFocus: "always" });
  const [gitSkipped, setGitSkipped] = useGettingStartedFlag(accountId, "git-skipped");

  if (!canSeeRunners || !runners || !list) return null;
  const result = gettingStarted({ runners, scans: list.scans, gitSkipped });
  if (!result.show) return null;
  const done = (key: GettingStartedTaskKey) => result.tasks.find((task) => task.key === key)?.done ?? false;
  const skip = () => setGitSkipped(true);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="grid gap-1.5">
          <CardTitle>Getting started</CardTitle>
          <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">Five setup tasks take you to your first Report. They tick themselves as Elise sees your Runner and Scans.</p>
        </div>
        <a href={GETTING_STARTED_DESKTOP_URL} target="_blank" rel="noreferrer" className={LINK}>
          Prefer a window?
        </a>
      </CardHeader>
      <CardContent>
        <ol className="grid divide-y">
          <Task done={done("install")} title="Install the Runner">
            <Command command={GETTING_STARTED_INSTALL_COMMAND} />
            <p className="text-xs text-muted-foreground">Claude Code must be installed and signed in on that computer.</p>
          </Task>
          <Task done={done("login")} title="Log the Runner in">
            <Command command={RUNNER_LOGIN_COMMAND} />
            <p className="text-xs text-muted-foreground">It opens this site so you can approve the computer on the device page.</p>
          </Task>
          <Task done={done("git-access")} title="Check git access (private repositories only)">
            <Command command={DOCTOR_COMMAND} />
            {done("git-access") ? null : (
              <div>
                <Button type="button" size="sm" variant="outline" onClick={skip}>
                  Skip
                </Button>
              </div>
            )}
          </Task>
          <Task done={done("first-scan")} title="Start a first Scan">
            <p className="text-xs text-muted-foreground">Keep `elise-runner run` open on the computer so it picks the Scan up.</p>
            <div>
              <ScanNewDialog label="Start a Scan" variant="outline" />
            </div>
          </Task>
          <Task done={done("report")} title="Read the Report">
            <p className="text-xs text-muted-foreground">
              When the Scan finishes, open it from{" "}
              <Link to="/scans" className={LINK}>
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
