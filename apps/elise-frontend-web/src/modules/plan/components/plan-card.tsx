import type { ReactNode } from "react";
import { Link, useRouteContext } from "@tanstack/react-router";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { hasAccessPower } from "@repo/contracts/elise";
import { Alert, AlertDescription } from "#/components/ui/alert";
import { Badge } from "#/components/ui/badge";
import { Button, buttonVariants } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Progress } from "#/components/ui/progress";
import { useNow } from "#/lib/use-now";
import { runnerShownState, runnersQuery, runnerWhen } from "#/modules/runner";
import { ShellPageHeader } from "#/modules/shell";
import { teamQuery, teamRoleLabel } from "#/modules/team";
import { usageUsd } from "#/modules/usage";
import { openBillingPortal, startPlanCheckout } from "../api";
import { planOffersQuery, planQuery } from "../hooks";
import { PLAN_STATUS_VIEW, planBillingAction, planConfirmingPayment, planDateLabel, planSourceLabel } from "../utils";

export type PlanCheckoutReturn = "success" | "cancelled";

function BillingButton({ action, variant = "default", size = "sm" }: { action: "subscribe" | "manage"; variant?: "default" | "outline"; size?: "sm" | "default" }) {
  const go = useMutation({
    mutationFn: () => (action === "subscribe" ? startPlanCheckout() : openBillingPortal()),
    onSuccess: ({ url }) => window.location.assign(url),
    onError: (error) => toast.error(`We couldn't open the payment page. ${error.message}`),
  });

  return (
    <Button variant={variant} size={size} className="justify-self-start" disabled={go.isPending || go.isSuccess} onClick={() => go.mutate()}>
      {action === "subscribe" ? "Subscribe" : "Manage billing"}
    </Button>
  );
}

function useCanManagePlan() {
  const { user } = useRouteContext({ from: "/_app" });
  return hasAccessPower(user?.powers ?? [], "company:plan:manage");
}

function CheckoutNote({ checkout, confirming }: { checkout: PlanCheckoutReturn | undefined; confirming: boolean }) {
  if (checkout === "cancelled") {
    return (
      <Alert variant="info">
        <AlertDescription>Checkout was cancelled. Nothing was charged.</AlertDescription>
      </Alert>
    );
  }
  if (confirming) {
    return (
      <Alert variant="info">
        <AlertDescription>Confirming payment. This page updates on its own in a moment.</AlertDescription>
      </Alert>
    );
  }
  return null;
}

const PER_MONTH = <span className="ml-1.5 text-sm font-normal tracking-normal text-muted-foreground">per month</span>;

const ALERT_VARIANT = { success: "success", warning: "warning", destructive: "destructive", neutral: "info" } as const;

const ACTION = buttonVariants({ variant: "outline", size: "sm" });

function PlanOfferCard({ checkout, confirming }: { checkout: PlanCheckoutReturn | undefined; confirming: boolean }) {
  const { data: offers } = useSuspenseQuery(planOffersQuery());
  const canManage = useCanManagePlan();
  const offer = offers[0];

  return (
    <>
      <ShellPageHeader title="Plan" description="What this account pays for." />
      <CheckoutNote checkout={checkout} confirming={confirming} />
      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>No plan yet</CardTitle>
          <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">Scans start once this account has a plan.</p>
        </CardHeader>
        {offer !== undefined && (
          <CardContent className="grid gap-5">
            <p className="text-sm font-medium">{offer.label}</p>
            <p className="text-[28px] font-semibold leading-none tracking-tight tabular-nums">
              {usageUsd(offer.monthlyPriceUsd)}
              {PER_MONTH}
            </p>
            <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">
              Up to {offer.maxMembers} people. Scans run on your own Claude through a Runner, and Elise gathers every result in one place.
            </p>
            {canManage ? <BillingButton action="subscribe" /> : <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">Ask an account admin to subscribe.</p>}
          </CardContent>
        )}
      </Card>
    </>
  );
}

type ColumnProps = { label: string; aside?: ReactNode; footer?: ReactNode; children: ReactNode };

function Column({ label, aside, footer, children }: ColumnProps) {
  return (
    <section aria-label={label} className="grid grid-rows-[auto_1fr_auto] gap-4 p-6">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-sm font-medium text-muted-foreground">{label}</h2>
        {aside}
      </div>
      <div className="grid content-start gap-4">{children}</div>
      {footer}
    </section>
  );
}

const CONFIRM_POLL_MS = 3000;
const CONFIRM_POLL_MAX = 20;

export function PlanCard({ checkout }: { checkout?: PlanCheckoutReturn }) {
  const { data } = useSuspenseQuery({
    ...planQuery(),
    refetchInterval: (query) => (query.state.data !== undefined && planConfirmingPayment(checkout, query.state.data) && query.state.dataUpdateCount < CONFIRM_POLL_MAX ? CONFIRM_POLL_MS : false),
  });
  const { data: runners } = useSuspenseQuery(runnersQuery());
  const { data: team } = useSuspenseQuery(teamQuery());
  const canManage = useCanManagePlan();
  const now = useNow();
  const { plan } = data;
  const confirming = planConfirmingPayment(checkout, data);

  if (plan === null || data.status === null || data.source === null) {
    return <PlanOfferCard checkout={checkout} confirming={confirming} />;
  }

  const status = PLAN_STATUS_VIEW[data.status];
  const billing = planBillingAction(data);
  const endsOn = data.cancelAtPeriodEnd === true && data.currentPeriodEnd !== null ? planDateLabel(data.currentPeriodEnd) : null;
  const granted = data.source === "grant";
  const paired = runners.filter((runner) => runner.state === "connected");
  const running = paired.filter((runner) => runnerShownState(runner, now) === "connected").length;
  const people = data.seats.members + data.seats.pendingInvites;
  const waiting = data.seats.pendingInvites;
  const peoplePercent = plan.maxMembers > 0 ? Math.min(100, Math.round((people / plan.maxMembers) * 100)) : 0;

  return (
    <>
      <ShellPageHeader title="Plan" description="What this account pays for." badges={<Badge variant={status.variant}>{status.label}</Badge>} />

      <CheckoutNote checkout={checkout} confirming={confirming} />

      {status.note !== null && (
        <Alert variant={ALERT_VARIANT[status.variant]}>
          <AlertDescription className="grid justify-items-start gap-3">
            {status.note}
            {data.status === "past_due" && canManage && <BillingButton action="manage" variant="outline" />}
          </AlertDescription>
        </Alert>
      )}

      <Card className="grid overflow-hidden lg:grid-cols-3 lg:divide-x">
        <Column
          label={`${plan.label} plan`}
          footer={
            canManage ? (
              <BillingButton action={billing} variant={billing === "subscribe" ? "default" : "outline"} />
            ) : (
              <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">Ask an account admin to change the plan.</p>
            )
          }
        >
          {granted ? (
            <>
              <p className="text-[40px] font-semibold leading-none tracking-tight">No charge</p>
              <p className="text-sm tabular-nums text-muted-foreground">
                <s>{usageUsd(plan.monthlyPriceUsd)}</s> per month
              </p>
              <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">{planSourceLabel(data.source)}, with no end date. Elise charges nothing per scan.</p>
            </>
          ) : (
            <>
              <p className="text-[40px] font-semibold leading-none tracking-tight tabular-nums">
                {usageUsd(plan.monthlyPriceUsd)}
                {PER_MONTH}
              </p>
              <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">
                {planSourceLabel(data.source)}
                {endsOn !== null ? `. Ends on ${endsOn}` : data.currentPeriodEnd !== null ? `. Renews ${planDateLabel(data.currentPeriodEnd)}` : ""}. Elise charges nothing per scan.
              </p>
            </>
          )}
        </Column>

        <Column
          label="People"
          footer={
            <Link to="/team" className={ACTION}>
              Manage the team
            </Link>
          }
        >
          <p className="text-[40px] font-semibold leading-none tracking-tight tabular-nums">
            {people}
            <span className="ml-1.5 text-sm font-normal tracking-normal text-muted-foreground">of {plan.maxMembers}</span>
          </p>
          <Progress value={peoplePercent} indicatorClassName="bg-primary/55" aria-label={`People: ${people} of ${plan.maxMembers}`} />
          <ul className="divide-y rounded-lg border">
            {team.members.map((member) => (
              <li key={member.partyId} className="flex items-center justify-between gap-4 px-4 py-3">
                <span className="grid min-w-0 gap-0.5">
                  <span className="truncate text-sm font-medium">{member.name}</span>
                  <span className="truncate text-xs text-muted-foreground">{member.email}</span>
                </span>
                <Badge variant="outline">{teamRoleLabel(member.role, member.roleLabel)}</Badge>
              </li>
            ))}
          </ul>
          {waiting > 0 && <p className="text-sm leading-relaxed text-muted-foreground">Plus {waiting} waiting {waiting === 1 ? "invite" : "invites"}.</p>}
        </Column>

        <Column
          label="Runners"
          aside={
            <p className="text-sm tabular-nums text-muted-foreground">
              {running} of {paired.length} running
            </p>
          }
          footer={
            <Link to="/settings/providers" className={ACTION}>
              {paired.length === 0 ? "Add a Runner" : "Manage Runners"}
            </Link>
          }
        >
          {paired.length === 0 ? (
            <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">No computer is paired yet. A Runner is a computer that runs your scans, with its own Claude and git login.</p>
          ) : (
            <>
              <p className="text-[40px] font-semibold leading-none tracking-tight tabular-nums">
                {paired.length}
                <span className="ml-1.5 text-sm font-normal tracking-normal text-muted-foreground">paired</span>
              </p>
              {running === 0 && (
                <Alert variant="warning">
                  <AlertDescription>
                    <span className="font-medium">No Runner is running.</span> A new scan waits until one starts. Open the Elise Runner on one of your computers.
                  </AlertDescription>
                </Alert>
              )}
              <ul className="divide-y rounded-lg border">
                {paired.map((runner) => {
                  const isRunning = runnerShownState(runner, now) === "connected";
                  return (
                    <li key={runner.id} className="flex items-center justify-between gap-4 px-4 py-3">
                      <span className="grid min-w-0 gap-0.5">
                        <span className="truncate text-sm font-medium">{runner.name}</span>
                        <span className="text-xs text-muted-foreground">{runner.lastSeenAt === null ? "Not seen yet." : `Last seen ${runnerWhen(runner.lastSeenAt)}.`}</span>
                      </span>
                      <Badge variant={isRunning ? "success" : "neutral"}>{isRunning ? "Running" : "Not running"}</Badge>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </Column>
      </Card>
    </>
  );
}
