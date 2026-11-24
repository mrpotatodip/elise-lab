import type { PlanOffer } from "../schemas";
import { planPriceView, type PlanInterval } from "../utils";

export function PriceLine({
  terms,
  interval,
}: {
  terms: Pick<PlanOffer, "monthlyPriceUsd" | "yearlyPriceUsd">;
  interval: PlanInterval;
}) {
  const shownView = planPriceView(terms, interval);
  const view = shownView ?? planPriceView(terms, "month");
  if (view === null) return null;

  return (
    <div className="grid gap-1">
      <p className="text-[40px] font-semibold leading-none tracking-tight tabular-nums">
        {view.amount}
        <span className="ml-1.5 text-sm font-normal tracking-normal text-muted-foreground">per {view.unit}</span>
      </p>
      {view.perMonth !== null && <p className="text-sm tabular-nums text-muted-foreground">{view.perMonth}</p>}
      {shownView === null && <p className="text-sm text-muted-foreground">Monthly only.</p>}
    </div>
  );
}
