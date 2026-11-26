import { useState } from "react";
import { Check } from "lucide-react";
import { Alert, AlertDescription } from "#/components/ui/alert";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "#/components/ui/dialog";
import { Segmented } from "#/components/ui/segmented";
import { PLAN_POINTS, PLAN_REFUND_LINE, PLAN_YEARLY_BACK_LINE } from "../constants";
import { usePlanActions } from "../hooks";
import type { PlanDetails, PlanOffer } from "../schemas";
import {
  planCardViews,
  planPriceView,
  planShownInterval,
  planYearlyLocked,
  planYearlyOffered,
  type PlanInterval,
  type PlanSwitchTarget,
} from "../utils";
import { PriceLine } from "./price-line";

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

type ChangeCopy = { trigger: string; title: string; description: string; keep: string; note?: string };

type ChangeDialogProps = {
  target: PlanSwitchTarget;
  now: { terms: Terms; interval: PlanInterval };
  after: { terms: Terms; interval: PlanInterval };
  copy: ChangeCopy;
  primary: boolean;
  busy: boolean;
  onSwitched: (target: PlanSwitchTarget) => void;
};

function ChangeDialog({ target, now, after, copy, primary, busy, onSwitched }: ChangeDialogProps) {
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
      <DialogTrigger
        render={<Button variant={primary ? "default" : "outline"} size="sm" className={BUTTON_CLASS} disabled={busy} />}
      >
        {copy.trigger}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-3">
          <TermsRow heading="Now" terms={now.terms} interval={now.interval} />
          <TermsRow heading="After the switch" terms={after.terms} interval={after.interval} />
          {copy.note !== undefined && (
            <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">{copy.note}</p>
          )}
          {change.isError && (
            <Alert variant="destructive">
              <AlertDescription>{change.error.message}</AlertDescription>
            </Alert>
          )}
        </DialogBody>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>{copy.keep}</DialogClose>
          <Button
            disabled={change.isPending}
            onClick={() =>
              change.mutate(target, {
                onSuccess: () => {
                  setOpen(false);
                  onSwitched(target);
                },
              })
            }
          >
            {change.isPending ? "Switching" : copy.trigger}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SubscribeButton({
  offer,
  interval,
  primary,
  blocked,
}: {
  offer: PlanOffer;
  interval: PlanInterval;
  primary: boolean;
  blocked: boolean;
}) {
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
  const yearlyLocked = planYearlyLocked(data);
  const firstSubscribable = views.find((view) => view.action === "subscribe" && view.blocked === null)?.offer.key;

  return (
    <section aria-label="Compare plans" className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-semibold tracking-tight">Compare plans</h2>
        {planYearlyOffered(offers) && !yearlyLocked && (
          <div className="flex items-center gap-3">
            {chosen === "year" && <Badge variant="success">2 months free</Badge>}
            <Segmented
              label="Billing interval"
              value={chosen}
              options={INTERVAL_OPTIONS}
              onChange={setChosen}
              className="w-48"
            />
          </div>
        )}
      </div>
      {yearlyLocked && (
        <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">
          Billed yearly. {PLAN_YEARLY_BACK_LINE}
        </p>
      )}
      {shown === "year" && !yearlyLocked && (
        <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">{PLAN_REFUND_LINE}</p>
      )}
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
                <PriceLine terms={offer} interval={shown} />
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
              {action === "none" && canManage && blocked !== null && (
                <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">{blocked}</p>
              )}
              {action !== "none" &&
                (canManage ? (
                  <div className="grid justify-items-start gap-2">
                    {action === "switchInterval" ? (
                      <ChangeDialog
                        target={{ planKey: offer.key, interval: "year" }}
                        now={{ terms: offer, interval: "month" }}
                        after={{ terms: offer, interval: "year" }}
                        copy={{
                          trigger: "Switch to yearly",
                          title: `Switch ${offer.label} to yearly?`,
                          description:
                            "Takes effect now. The unused part of your current month is credited toward the yearly price.",
                          keep: "Keep monthly",
                          note: PLAN_REFUND_LINE,
                        }}
                        primary
                        busy={switching}
                        onSwitched={onSwitched}
                      />
                    ) : action === "switch" && from !== null ? (
                      <ChangeDialog
                        target={{ planKey: offer.key }}
                        now={{ terms: from, interval: shown }}
                        after={{ terms: offer, interval: shown }}
                        copy={{
                          trigger: `Switch to ${offer.label}`,
                          title: `Switch to ${offer.label}?`,
                          description: "Takes effect now. The price difference is prorated on your next invoice.",
                          keep: `Keep ${from.label}`,
                        }}
                        primary={false}
                        busy={switching || blocked !== null}
                        onSwitched={onSwitched}
                      />
                    ) : (
                      <SubscribeButton
                        offer={offer}
                        interval={shown}
                        primary={offer.key === firstSubscribable}
                        blocked={blocked !== null}
                      />
                    )}
                    {blocked !== null && (
                      <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">{blocked}</p>
                    )}
                  </div>
                ) : (
                  <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">
                    Ask an account admin to change the plan.
                  </p>
                ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
