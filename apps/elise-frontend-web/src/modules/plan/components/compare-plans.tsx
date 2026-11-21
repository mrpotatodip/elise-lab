import { useState } from "react";
import { Check } from "lucide-react";
import { Alert, AlertDescription } from "#/components/ui/alert";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Dialog, DialogBody, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "#/components/ui/dialog";
import { Segmented } from "#/components/ui/segmented";
import { PLAN_POINTS, PLAN_REFUND_LINE, PLAN_YEARLY_BACK_LINE } from "../constants";
import { usePlanActions } from "../hooks";
import type { PlanDetails, PlanOffer } from "../schemas";
import { planCardViews, planPriceView, planShownInterval, planYearlyOffered, type PlanInterval, type PlanSwitchTarget } from "../utils";

const BUTTON_CLASS = "h-auto min-h-8 max-w-full justify-self-start whitespace-normal py-1.5 text-left";

type Terms = { label: string; monthlyPriceUsd: number; yearlyPriceUsd?: number | null; maxMembers: number };

const memberCap = (maxMembers: number) => `Up to ${maxMembers} members`;

const INTERVAL_OPTIONS = [
  { value: "month", label: "Monthly" },
  { value: "year", label: "Yearly" },
] as const;

const priceSentence = (terms: Terms, interval: PlanInterval) => {
  const view = planPriceView(terms, interval);
  return view === null ? "" : `${view.amount} per ${view.unit}`;
};

function TermsRow({ heading, terms, interval }: { heading: string; terms: Terms; interval: PlanInterval }) {
  return (
    <div className="grid gap-1 rounded-lg border p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{heading}</p>
      <p className="text-sm font-medium">{terms.label}</p>
      <p className="text-sm tabular-nums text-muted-foreground">
        {priceSentence(terms, interval)}, {memberCap(terms.maxMembers).toLowerCase()}
      </p>
    </div>
  );
}

function IntervalDialog({ offer, busy, onSwitched }: { offer: PlanOffer; busy: boolean; onSwitched: (target: PlanSwitchTarget) => void }) {
  const [open, setOpen] = useState(false);
  const { change } = usePlanActions();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) change.reset();
      }}
    >
      <DialogTrigger render={<Button size="sm" className={BUTTON_CLASS} disabled={busy} />}>Switch to yearly</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Switch {offer.label} to yearly?</DialogTitle>
          <DialogDescription>Takes effect now. The unused part of your current month is credited toward the yearly price.</DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-3">
          <TermsRow heading="Now" terms={offer} interval="month" />
          <TermsRow heading="After the switch" terms={offer} interval="year" />
          <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">{PLAN_REFUND_LINE}</p>
          {change.isError && (
            <Alert variant="destructive">
              <AlertDescription>{change.error.message}</AlertDescription>
            </Alert>
          )}
        </DialogBody>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Keep monthly</DialogClose>
          <Button
            disabled={change.isPending}
            onClick={() =>
              change.mutate(
                { planKey: offer.key, interval: "year" },
                {
                  onSuccess: () => {
                    setOpen(false);
                    onSwitched({ planKey: offer.key, interval: "year" });
                  },
                },
              )
            }
          >
            {change.isPending ? "Switching" : "Switch to yearly"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SwitchDialog({
  offer,
  from,
  interval,
  busy,
  onSwitched,
}: {
  offer: PlanOffer;
  from: Terms;
  interval: PlanInterval;
  busy: boolean;
  onSwitched: (target: PlanSwitchTarget) => void;
}) {
  const [open, setOpen] = useState(false);
  const { change } = usePlanActions();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) change.reset();
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="sm" className={BUTTON_CLASS} disabled={busy} />}>Switch to {offer.label}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Switch to {offer.label}?</DialogTitle>
          <DialogDescription>Takes effect now. The price difference is prorated on your next invoice.</DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-3">
          <TermsRow heading="Now" terms={from} interval={interval} />
          <TermsRow heading="After the switch" terms={offer} interval={interval} />
          {change.isError && (
            <Alert variant="destructive">
              <AlertDescription>{change.error.message}</AlertDescription>
            </Alert>
          )}
        </DialogBody>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Keep {from.label}</DialogClose>
          <Button
            disabled={change.isPending}
            onClick={() =>
              change.mutate(
                { planKey: offer.key },
                {
                  onSuccess: () => {
                    setOpen(false);
                    onSwitched({ planKey: offer.key, interval: null });
                  },
                },
              )
            }
          >
            {change.isPending ? "Switching" : `Switch to ${offer.label}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SubscribeButton({ offer, interval, primary, blocked }: { offer: PlanOffer; interval: PlanInterval; primary: boolean; blocked: boolean }) {
  const { checkout } = usePlanActions();

  return (
    <div className="grid justify-items-start gap-2">
      <Button
        variant={primary ? "default" : "outline"}
        size="sm"
        className={BUTTON_CLASS}
        disabled={blocked || checkout.isPending || checkout.isSuccess}
        onClick={() => checkout.mutate({ planKey: offer.key, interval })}
      >
        Subscribe to {offer.label}
      </Button>
      {checkout.isError && (
        <Alert variant="destructive">
          <AlertDescription>{checkout.error.message}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

function PriceBlock({ offer, interval }: { offer: PlanOffer; interval: PlanInterval }) {
  const yearly = planPriceView(offer, interval);
  const view = yearly ?? planPriceView(offer, "month");
  if (view === null) return null;

  return (
    <div className="grid gap-1">
      <p className="text-[40px] font-semibold leading-none tracking-tight tabular-nums">
        {view.amount}
        <span className="ml-1.5 text-sm font-normal tracking-normal text-muted-foreground">per {view.unit}</span>
      </p>
      {view.perMonth !== null && <p className="text-sm tabular-nums text-muted-foreground">{view.perMonth}</p>}
      {yearly === null && <p className="text-sm text-muted-foreground">Monthly only.</p>}
    </div>
  );
}

type ComparePlansProps = {
  data: Pick<PlanDetails, "plan" | "source" | "status" | "seats" | "interval">;
  offers: ReadonlyArray<PlanOffer>;
  from: Terms | null;
  canManage: boolean;
  switching: boolean;
  onSwitched: (target: PlanSwitchTarget) => void;
};

export function ComparePlans({ data, offers, from, canManage, switching, onSwitched }: ComparePlansProps) {
  const [chosen, setChosen] = useState<PlanInterval>("month");
  const views = planCardViews(data, offers, chosen);
  const shown = planShownInterval(data, chosen);
  const yearlyLocked = planShownInterval(data, "month") === "year";
  const firstSubscribable = views.find((view) => view.action === "subscribe" && view.blocked === null)?.offer.key;

  return (
    <section aria-label="Compare plans" className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-semibold tracking-tight">Compare plans</h2>
        {planYearlyOffered(offers) && !yearlyLocked && (
          <div className="flex items-center gap-3">
            {chosen === "year" && <Badge variant="success">2 months free</Badge>}
            <Segmented label="Billing interval" value={chosen} options={INTERVAL_OPTIONS} onChange={setChosen} className="w-48" />
          </div>
        )}
      </div>
      {yearlyLocked && (
        <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">
          Billed yearly. {PLAN_YEARLY_BACK_LINE}
        </p>
      )}
      {shown === "year" && !yearlyLocked && <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">{PLAN_REFUND_LINE}</p>}
      <div className="grid items-stretch gap-8 lg:grid-cols-2">
        {views.map(({ offer, current, action, blocked }) => (
          <Card key={offer.key} className="grid grid-rows-[auto_1fr]">
            <CardHeader className="flex-row items-center justify-between gap-4">
              <CardTitle>{offer.label}</CardTitle>
              <Badge variant="neutral" className={current ? undefined : "invisible"} aria-hidden={!current}>
                Current plan
              </Badge>
            </CardHeader>
            <CardContent className="grid content-between gap-6">
              <div className="grid content-start gap-4">
                <PriceBlock offer={offer} interval={shown} />
                <ul className="grid gap-2 text-sm leading-relaxed">
                  <li className="flex gap-2 font-medium">
                    <Check className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    {memberCap(offer.maxMembers)}
                  </li>
                  {PLAN_POINTS.map((point) => (
                    <li key={point} className="flex max-w-copy gap-2 text-muted-foreground">
                      <Check className="mt-0.5 size-4 shrink-0" />
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
              {action !== "none" &&
                (canManage ? (
                  <div className="grid justify-items-start gap-2">
                    {action === "switchInterval" ? (
                      <IntervalDialog offer={offer} busy={switching} onSwitched={onSwitched} />
                    ) : action === "switch" && from !== null ? (
                      <SwitchDialog offer={offer} from={from} interval={shown} busy={switching || blocked !== null} onSwitched={onSwitched} />
                    ) : (
                      <SubscribeButton offer={offer} interval={shown} primary={offer.key === firstSubscribable} blocked={blocked !== null} />
                    )}
                    {blocked !== null && <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">{blocked}</p>}
                  </div>
                ) : (
                  <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">Ask an account admin to change the plan.</p>
                ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
