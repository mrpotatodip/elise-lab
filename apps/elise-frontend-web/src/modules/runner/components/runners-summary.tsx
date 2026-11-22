import { Suspense, type ReactNode } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Card } from "#/components/ui/card";
import { Progress } from "#/components/ui/progress";
import { Skeleton } from "#/components/ui/skeleton";
import { useNow } from "#/lib/use-now";
import { RUNNER_LOGIN_COMMAND } from "../constants";
import { runnersQuery } from "../hooks";
import { runnerShownState } from "../utils";
import { RunnerAddDialog } from "./runner-add-dialog";

type ColumnProps = { label: string; footer?: ReactNode; children: ReactNode };

function Column({ label, footer, children }: ColumnProps) {
  return (
    <section aria-label={label} className="grid grid-rows-[auto_1fr_auto] gap-4 p-6">
      <h2 className="text-sm font-medium text-muted-foreground">{label}</h2>
      <div className="grid content-start gap-4">{children}</div>
      {footer}
    </section>
  );
}

export function RunnersSummary() {
  const { data } = useSuspenseQuery(runnersQuery());
  const now = useNow();

  const paired = data.filter((runner) => runner.state === "connected");
  const waiting = data.filter((runner) => runner.state === "waiting").length;
  const running = paired.filter((runner) => runnerShownState(runner, now) === "connected").length;
  const percent = paired.length > 0 ? Math.round((running / paired.length) * 100) : 0;

  return (
    <section aria-label="Runners summary">
      <Card className="grid overflow-hidden lg:grid-cols-3 lg:divide-x">
        <Column
          label="Runners"
          footer={
            <Suspense fallback={<Skeleton className="h-8 w-full" />}>
              <RunnerAddDialog />
            </Suspense>
          }
        >
          <p className="text-[40px] font-semibold leading-none tracking-tight tabular-nums">
            {paired.length}
            <span className="ml-1.5 text-sm font-normal tracking-normal text-muted-foreground">{paired.length === 1 ? "computer" : "computers"} paired</span>
          </p>
          <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">
            Each scan runs on a computer you pair, with its own Claude and git login. Elise charges nothing per scan.
            {waiting > 0 ? ` ${waiting} ${waiting === 1 ? "computer is" : "computers are"} waiting for a pairing code.` : ""}
          </p>
        </Column>

        <Column label="Right now">
          <p className="text-[40px] font-semibold leading-none tracking-tight tabular-nums">
            {running}
            <span className="ml-1.5 text-sm font-normal tracking-normal text-muted-foreground">of {paired.length} running</span>
          </p>
          <Progress value={percent} indicatorClassName="bg-primary/55" aria-label={`Running: ${running} of ${paired.length}`} />
          <p className={paired.length > 0 && running === 0 ? "max-w-copy text-sm leading-relaxed text-status-warning" : "max-w-copy text-sm leading-relaxed text-muted-foreground"}>
            {paired.length === 0
              ? "Pair a computer to start your first scan."
              : running === 0
                ? "No Runner is running, so a new scan waits until one starts. Open the Elise Runner on one of your computers."
                : "A Runner counts as running while it keeps asking Elise for work."}
          </p>
        </Column>

        <Column label="Connect a computer">
          <ol className="grid gap-3 text-sm leading-relaxed">
            <li className="grid grid-cols-[1.5rem_1fr] gap-2">
              <span aria-hidden="true" className="text-muted-foreground tabular-nums">1</span>
              <span>Install the Elise Runner and sign in to Claude Code on that computer.</span>
            </li>
            <li className="grid grid-cols-[1.5rem_1fr] gap-2">
              <span aria-hidden="true" className="text-muted-foreground tabular-nums">2</span>
              <span>
                Run <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{RUNNER_LOGIN_COMMAND}</code> and approve it here.
              </span>
            </li>
            <li className="grid grid-cols-[1.5rem_1fr] gap-2">
              <span aria-hidden="true" className="text-muted-foreground tabular-nums">3</span>
              <span>Keep it open while scans run.</span>
            </li>
          </ol>
        </Column>
      </Card>
    </section>
  );
}
