import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Alert, AlertDescription } from "#/components/ui/alert";
import { Badge } from "#/components/ui/badge";
import { Button, buttonVariants } from "#/components/ui/button";
import { Card } from "#/components/ui/card";
import { Progress } from "#/components/ui/progress";
import { useNow } from "#/lib/use-now";
import { runnerShownState, runnersQuery, runnerWhen } from "#/modules/runner";
import { ShellPageHeader } from "#/modules/shell";
import { teamQuery, teamRoleLabel } from "#/modules/team";
import { usageUsd } from "#/modules/usage";
import { PLAN_CONFIRM_POLL_MAX, PLAN_CONFIRM_POLL_MS, PLAN_REFUND_LINE, PLAN_YEARLY_BACK_LINE } from "../constants";
import { planKeys, planOffersQuery, planQuery, useCanManagePlan, usePlanActions } from "../hooks";
import type { PlanDetails, PlanOffer } from "../schemas";
import type { PlanCheckoutReturn } from "../types";
import {
  PLAN_STATUS_VIEW,
  planBilledYearlySentence,
  planBillingAction,
  planConfirmingPayment,
  planPeriodSentence,
  planSourceLabel,
  planSwitchPending,
  type PlanSwitchTarget,
} from "../utils";
import { ComparePlans } from "./compare-plans";
import { PriceLine } from "./price-line";

function RedirectButton({
  label,
  variant = "default",
  busy,
  onClick,
}: {
  label: string;
  variant?: "default" | "outline";
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      variant={variant}
      size="sm"
      className="h-auto min-h-8 max-w-full justify-self-start whitespace-normal py-1.5 text-left"
      disabled={busy}
      onClick={onClick}
    >
      {label}
    </Button>
  );
}

function PortalButton() {
  const { portal } = usePlanActions();

  return (
    <RedirectButton
      label="Manage billing"
      variant="outline"
      busy={portal.isPending || portal.isSuccess}
      onClick={() => portal.mutate()}
    />
  );
}

function CheckoutNote({
  checkout,
  confirming,
  gaveUp,
}: {
  checkout: PlanCheckoutReturn | undefined;
  confirming: boolean;
  gaveUp: boolean;
}) {
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
        <AlertDescription>
          {gaveUp
            ? "Still waiting: refresh in a minute."
            : "Confirming payment. This page updates on its own in a moment."}
        </AlertDescription>
      </Alert>
    );
  }
  return null;
}

const ALERT_VARIANT = { success: "success", warning: "warning", destructive: "destructive", neutral: "info" } as const;

const ACTION = buttonVariants({ variant: "outline", size: "sm" });

function NoPlanView({
  data,
  offers,
  checkout,
  confirming,
  gaveUp,
}: {
  data: PlanDetails;
  offers: ReadonlyArray<PlanOffer>;
  checkout: PlanCheckoutReturn | undefined;
  confirming: boolean;
  gaveUp: boolean;
}) {
  const canManage = useCanManagePlan();

  return (
    <>
      <ShellPageHeader title="Plan and billing" description="No plan yet. Scans start once this account has a plan." />
      <CheckoutNote checkout={checkout} confirming={confirming} gaveUp={gaveUp} />
      <ComparePlans
        data={data}
        offers={offers}
        from={null}
        canManage={canManage}
        switching={false}
        onSwitched={() => undefined}
      />
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

export function PlanCard({ checkout }: { checkout?: PlanCheckoutReturn }) {
  const queryClient = useQueryClient();
  const [switching, setSwitching] = useState<(PlanSwitchTarget & { baseline: number }) | null>(null);
  const { data } = useSuspenseQuery({
    ...planQuery(),
    refetchInterval: (query) => {
      const { data: latest, dataUpdateCount } = query.state;
      if (latest === undefined) return false;
      const checkoutPolling = planConfirmingPayment(checkout, latest) && dataUpdateCount < PLAN_CONFIRM_POLL_MAX;
      const switchPolling =
        switching !== null &&
        planSwitchPending(switching, latest) &&
        dataUpdateCount - switching.baseline < PLAN_CONFIRM_POLL_MAX;
      return checkoutPolling || switchPolling ? PLAN_CONFIRM_POLL_MS : false;
    },
  });
  const { data: offers } = useSuspenseQuery(planOffersQuery());
  const { data: runners } = useSuspenseQuery(runnersQuery());
  const { data: team } = useSuspenseQuery(teamQuery());
  const canManage = useCanManagePlan();
  const now = useNow();
  const { plan } = data;
  const confirming = planConfirmingPayment(checkout, data);
  const updateCount = queryClient.getQueryState(planKeys.details())?.dataUpdateCount ?? 0;
  const gaveUp = updateCount >= PLAN_CONFIRM_POLL_MAX;
  const switchWaiting = switching !== null && planSwitchPending(switching, data);
  const switchGaveUp = switching !== null && switchWaiting && updateCount - switching.baseline >= PLAN_CONFIRM_POLL_MAX;

  if (plan === null || data.status === null || data.source === null) {
    return <NoPlanView data={data} offers={offers} checkout={checkout} confirming={confirming} gaveUp={gaveUp} />;
  }

  const status = PLAN_STATUS_VIEW[data.status];
  const billing = planBillingAction(data);
  const granted = data.source === "grant";
  const yearly = !granted && data.interval === "year";
  const paired = runners.filter((runner) => runner.state === "connected");
  const running = paired.filter((runner) => runnerShownState(runner, now) === "connected").length;
  const people = data.seats.members + data.seats.pendingInvites;
  const waiting = data.seats.pendingInvites;
  const peoplePercent = plan.maxMembers > 0 ? Math.min(100, Math.round((people / plan.maxMembers) * 100)) : 0;

  return (
    <>
      <ShellPageHeader
        title="Plan and billing"
        description="What this account pays for."
        badges={<Badge variant={status.variant}>{status.label}</Badge>}
      />

      <CheckoutNote checkout={checkout} confirming={confirming} gaveUp={gaveUp} />

      {status.note !== null && (
        <Alert variant={ALERT_VARIANT[status.variant]}>
          <AlertDescription className="grid justify-items-start gap-3">
            {status.note}
            {data.status === "past_due" && canManage && <PortalButton />}
          </AlertDescription>
        </Alert>
      )}

      {switchWaiting && (
        <Alert variant="info">
          <AlertDescription>
            {switchGaveUp
              ? "Switching is taking longer than expected. Reload this page later to see the new plan."
              : "Switching plan. This page updates on its own in a moment."}
          </AlertDescription>
        </Alert>
      )}

      <Card className="grid overflow-hidden lg:grid-cols-3 lg:divide-x">
        <Column
          label={`${plan.label} plan`}
          footer={
            billing === "manage" ? (
              canManage ? (
                <PortalButton />
              ) : (
                <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">
                  Ask an account admin to change the plan.
                </p>
              )
            ) : undefined
          }
        >
          {granted ? (
            <>
              <p className="text-[40px] font-semibold leading-none tracking-tight">No charge</p>
              <p className="text-sm tabular-nums text-muted-foreground">
                <s>{usageUsd(plan.monthlyPriceUsd)}</s> per month
              </p>
              <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">
                {planSourceLabel(data.source)}, with no end date. Elise charges nothing per scan.
              </p>
            </>
          ) : (
            <>
              <PriceLine terms={plan} interval={yearly ? "year" : "month"} />
              <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">
                {planSourceLabel(data.source)}
                {planPeriodSentence(data)}. Elise charges nothing per scan.
              </p>
              {yearly && (
                <>
                  <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">
                    {planBilledYearlySentence(data)}
                  </p>
                  <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">{PLAN_YEARLY_BACK_LINE}</p>
                  <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">{PLAN_REFUND_LINE}</p>
                </>
              )}
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
            <span className="ml-1.5 text-sm font-normal tracking-normal text-muted-foreground">
              of {plan.maxMembers}
            </span>
          </p>
          <Progress
            value={peoplePercent}
            indicatorClassName="bg-primary/55"
            aria-label={`People: ${people} of ${plan.maxMembers}`}
          />
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
          {waiting > 0 && (
            <p className="text-sm leading-relaxed text-muted-foreground">
              Plus {waiting} waiting {waiting === 1 ? "invite" : "invites"}.
            </p>
          )}
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
            <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">
              No computer is paired yet. A Runner is a computer that runs your scans, with its own Claude and git login.
            </p>
          ) : (
            <>
              <p className="text-[40px] font-semibold leading-none tracking-tight tabular-nums">
                {paired.length}
                <span className="ml-1.5 text-sm font-normal tracking-normal text-muted-foreground">paired</span>
              </p>
              {running === 0 && (
                <Alert variant="warning">
                  <AlertDescription>
                    <span className="font-medium">No Runner is running.</span> A new scan waits until one starts. Open
                    the Elise Runner on one of your computers.
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
                        <span className="text-xs text-muted-foreground">
                          {runner.lastSeenAt === null ? "Not seen yet." : `Last seen ${runnerWhen(runner.lastSeenAt)}.`}
                        </span>
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

      <ComparePlans
        data={data}
        offers={offers}
        from={plan}
        canManage={canManage}
        switching={switchWaiting && !switchGaveUp}
        onSwitched={(target) =>
          setSwitching({ ...target, baseline: queryClient.getQueryState(planKeys.details())?.dataUpdateCount ?? 0 })
        }
      />
    </>
  );
}
