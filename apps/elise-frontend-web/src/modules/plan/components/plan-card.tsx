import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Alert, AlertDescription } from "#/components/ui/alert";
import { Badge } from "#/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Progress } from "#/components/ui/progress";
import { useNow } from "#/lib/use-now";
import { runnerShownState, runnersQuery } from "#/modules/runner";
import { ShellPageHeader } from "#/modules/shell";
import { usageUsd } from "#/modules/usage";
import { planOffersQuery, planQuery } from "../hooks";
import { PLAN_STATUS_VIEW, planDateLabel, planSourceLabel } from "../utils";

const PER_MONTH = <span className="ml-1.5 text-sm font-normal tracking-normal text-muted-foreground">per month</span>;

const ALERT_VARIANT = { success: "success", warning: "warning", destructive: "destructive", neutral: "info" } as const;

function PlanOfferCard() {
  const { data: offers } = useSuspenseQuery(planOffersQuery());
  const offer = offers[0];

  return (
    <>
      <ShellPageHeader title="Plan" description="What this account pays for." />
      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>No plan yet</CardTitle>
        </CardHeader>
        {offer !== undefined && (
          <CardContent className="grid gap-5">
            <p className="text-sm font-medium">{offer.label}</p>
            <p className="text-[28px] font-semibold leading-none tracking-tight tabular-nums">
              {usageUsd(offer.monthlyPriceUsd)}
              {PER_MONTH}
            </p>
            <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">
              Up to {offer.maxMembers} people. Scans run on your own Claude through a Runner, and Elise gathers every result in one place. To subscribe, contact us.
            </p>
          </CardContent>
        )}
      </Card>
    </>
  );
}

type MeterProps = { label: string; used: number; of: number; note: ReactNode };

function Meter({ label, used, of, note }: MeterProps) {
  const percent = of > 0 ? Math.min(100, Math.round((used / of) * 100)) : 0;
  return (
    <div className="grid gap-2">
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="text-sm font-medium">{label}</h3>
        <p className="text-sm tabular-nums text-muted-foreground">
          <span className="text-base font-semibold text-foreground">{used}</span> of {of}
        </p>
      </div>
      <Progress value={percent} aria-label={`${label}: ${used} of ${of}`} />
      <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">{note}</p>
    </div>
  );
}

export function PlanCard() {
  const { data } = useSuspenseQuery(planQuery());
  const { data: runners } = useQuery(runnersQuery());
  const now = useNow();
  const { plan } = data;

  if (plan === null || data.status === null || data.source === null) {
    return <PlanOfferCard />;
  }

  const status = PLAN_STATUS_VIEW[data.status];
  const paired = (runners ?? []).filter((runner) => runner.state === "connected");
  const running = paired.filter((runner) => runnerShownState(runner, now) === "connected").length;
  const people = data.seats.members + data.seats.pendingInvites;
  const waiting = data.seats.pendingInvites;

  return (
    <>
      <ShellPageHeader title="Plan" description="What this account pays for." badges={<Badge variant={status.variant}>{status.label}</Badge>} />

      {status.note !== null && (
        <Alert variant={ALERT_VARIANT[status.variant]}>
          <AlertDescription>{status.note}</AlertDescription>
        </Alert>
      )}

      <Card className="grid overflow-hidden lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <section aria-label="Your plan" className="grid content-start gap-4 border-b p-6 lg:border-b-0 lg:border-r">
          <h2 className="text-sm font-medium text-muted-foreground">{plan.label} plan</h2>
          <p className="text-[40px] font-semibold leading-none tracking-tight tabular-nums">
            {usageUsd(plan.monthlyPriceUsd)}
            {PER_MONTH}
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">Flat. Elise charges nothing per scan.</p>
          <dl className="grid gap-1.5 border-t pt-4 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Billing</dt>
              <dd className="font-medium">{planSourceLabel(data.source)}</dd>
            </div>
            {data.currentPeriodEnd !== null && (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Renews</dt>
                <dd className="font-medium tabular-nums">{planDateLabel(data.currentPeriodEnd)}</dd>
              </div>
            )}
          </dl>
          <p className="text-sm leading-relaxed text-muted-foreground">To change your plan, contact us.</p>
        </section>

        <section aria-label="What you are using" className="grid content-start gap-6 p-6">
          <Meter
            label="People"
            used={people}
            of={plan.maxMembers}
            note={waiting > 0 ? `Includes ${waiting} waiting ${waiting === 1 ? "invite" : "invites"}. Everyone shares the same reports and findings.` : "Everyone on this account shares the same reports and findings."}
          />
          <Meter
            label="Runners running"
            used={running}
            of={paired.length}
            note={
              <>
                A Runner is a computer you pair. Each scan runs on it, with that computer&apos;s Claude and git login.{" "}
                <Link to="/settings/providers" className="font-medium text-primary-ink underline underline-offset-4">
                  {paired.length === 0 ? "Add a Runner" : "Manage Runners"}
                </Link>
              </>
            }
          />
        </section>
      </Card>
    </>
  );
}
