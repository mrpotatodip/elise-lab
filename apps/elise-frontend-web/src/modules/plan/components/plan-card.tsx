import { useSuspenseQuery } from "@tanstack/react-query";
import { Badge } from "#/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { creditScansLabel } from "#/modules/credit";
import { usageUsd } from "#/modules/usage";
import { planOffersQuery, planQuery } from "../hooks";
import { PLAN_STATUS_VIEW, planDateLabel, planKeyLabel, planSeatsLabel, planSourceLabel } from "../utils";

function PlanOfferCard() {
  const { data: offers } = useSuspenseQuery(planOffersQuery());
  const offer = offers[0];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Plan</CardTitle>
        <p className="text-sm leading-relaxed text-muted-foreground">This account has no plan yet.</p>
      </CardHeader>
      {offer !== undefined && (
        <CardContent className="grid gap-5">
          <p className="text-sm font-medium">{offer.label}</p>
          <p className="text-[28px] font-semibold leading-none tracking-tight tabular-nums">
            {usageUsd(offer.monthlyPriceUsd)}
            <span className="ml-1.5 text-sm font-normal tracking-normal text-muted-foreground">per month</span>
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Up to {offer.maxMembers} people. Scans run on your own Claude through a Runner, and Elise gathers every result in one place. To subscribe, contact us.
          </p>
        </CardContent>
      )}
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium tabular-nums">{value}</dd>
    </div>
  );
}

export function PlanCard() {
  const { data } = useSuspenseQuery(planQuery());
  const { plan } = data;

  if (plan === null || data.status === null || data.source === null) {
    return <PlanOfferCard />;
  }

  const status = PLAN_STATUS_VIEW[data.status];

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>{plan.label}</CardTitle>
          <Badge variant={status.variant}>{status.label}</Badge>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">{status.note ?? "To change your plan, contact us."}</p>
      </CardHeader>
      <CardContent className="grid gap-5">
        <p className="text-[28px] font-semibold leading-none tracking-tight tabular-nums">
          {usageUsd(plan.monthlyPriceUsd)}
          <span className="ml-1.5 text-sm font-normal tracking-normal text-muted-foreground">per month</span>
        </p>
        <dl className="grid gap-3 border-t pt-5 text-sm">
          <Row label="Billing" value={planSourceLabel(data.source)} />
          {data.currentPeriodEnd !== null && <Row label="Renews" value={planDateLabel(data.currentPeriodEnd)} />}
          <Row label="Scans use" value={planKeyLabel("account")} />
          <Row label="Scans this month" value={creditScansLabel(data.scans, plan.scanAllowance)} />
          <Row label="People" value={planSeatsLabel(data.seats, plan.maxMembers)} />
        </dl>
        {status.note !== null && <p className="border-t pt-5 text-sm text-muted-foreground">To change your plan, contact us.</p>}
      </CardContent>
    </Card>
  );
}
