import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { LayoutDashboard, Laptop, Users } from "lucide-react";
import { Alert, AlertDescription } from "#/components/ui/alert";
import { Badge } from "#/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { useNow } from "#/lib/use-now";
import { cn } from "#/lib/utils";
import { runnerShownState, runnersQuery } from "#/modules/runner";
import { ShellPageHeader, ShellStatCell as Cell } from "#/modules/shell";
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

type FeatureProps = { icon: ReactNode; title: string; children: ReactNode };

function Feature({ icon, title, children }: FeatureProps) {
  return (
    <li className="grid content-start gap-3 p-6">
      <span aria-hidden="true" className="grid size-9 place-items-center rounded-lg bg-muted text-muted-foreground">
        {icon}
      </span>
      <h3 className="text-[15px] font-semibold leading-snug">{title}</h3>
      <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">{children}</p>
    </li>
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

  return (
    <>
      <ShellPageHeader
        title="Plan"
        description="What this account pays for."
        badges={<Badge variant={status.variant}>{status.label}</Badge>}
        below={
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm leading-relaxed text-muted-foreground">
            <span>{plan.label} plan</span>
            <span aria-hidden="true">·</span>
            <span>{planSourceLabel(data.source)}</span>
            {data.currentPeriodEnd !== null && (
              <>
                <span aria-hidden="true">·</span>
                <span>Renews {planDateLabel(data.currentPeriodEnd)}</span>
              </>
            )}
          </p>
        }
      />

      {status.note !== null && (
        <Alert variant={ALERT_VARIANT[status.variant]}>
          <AlertDescription>{status.note}</AlertDescription>
        </Alert>
      )}

      <section aria-label="Plan summary">
        <Card className="grid divide-y overflow-hidden lg:grid-cols-3 lg:divide-x lg:divide-y-0">
          <Cell
            lead
            label={`${plan.label} plan`}
            value={
              <>
                {usageUsd(plan.monthlyPriceUsd)}
                {PER_MONTH}
              </>
            }
            note="Flat. Elise charges nothing per scan."
          />
          <Cell
            label="People"
            value={
              <>
                {people}
                <span className="ml-1.5 text-sm font-normal tracking-normal text-muted-foreground">of {plan.maxMembers}</span>
              </>
            }
            note={data.seats.pendingInvites > 0 ? `Includes ${data.seats.pendingInvites} waiting ${data.seats.pendingInvites === 1 ? "invite" : "invites"}.` : "Everyone on this account."}
          />
          <Cell
            label="Runners running"
            value={
              <>
                {running}
                <span className="ml-1.5 text-sm font-normal tracking-normal text-muted-foreground">of {paired.length}</span>
              </>
            }
            note={
              <Link to="/settings/providers" className="font-medium text-primary-ink underline underline-offset-4">
                {paired.length === 0 ? "Add a Runner" : "Manage Runners"}
              </Link>
            }
          />
        </Card>
      </section>

      <Card>
        <CardHeader className="gap-1.5">
          <CardTitle>What the plan covers</CardTitle>
          <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">To change your plan, contact us.</p>
        </CardHeader>
        <CardContent className="p-0">
          <ul className={cn("grid divide-y border-t md:grid-cols-3 md:divide-x md:divide-y-0")}>
            <Feature icon={<Laptop className="size-4" />} title="Scans on your own Claude">
              Each scan runs on a computer you pair, with that computer&apos;s Claude and git login.
            </Feature>
            <Feature icon={<Users className="size-4" />} title={`Up to ${plan.maxMembers} people`}>
              One account for the team, with shared reports, findings and decisions.
            </Feature>
            <Feature icon={<LayoutDashboard className="size-4" />} title="Every result in one place">
              Runners, scans, files, findings and the Verdict across all your repositories and branches.
            </Feature>
          </ul>
        </CardContent>
      </Card>
    </>
  );
}
