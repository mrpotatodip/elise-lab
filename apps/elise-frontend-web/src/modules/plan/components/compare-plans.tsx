import { useState } from "react";
import { Check } from "lucide-react";
import { Alert, AlertDescription } from "#/components/ui/alert";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Dialog, DialogBody, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "#/components/ui/dialog";
import { usageUsd } from "#/modules/usage";
import { PLAN_POINTS } from "../constants";
import { usePlanActions } from "../hooks";
import type { PlanOffer } from "../schemas";
import type { PlanCardView } from "../utils";

const BUTTON_CLASS = "h-auto min-h-8 max-w-full justify-self-start whitespace-normal py-1.5 text-left";

type Terms = { label: string; monthlyPriceUsd: number; maxMembers: number };

const memberCap = (maxMembers: number) => `Up to ${maxMembers} members`;

function TermsRow({ heading, terms }: { heading: string; terms: Terms }) {
  return (
    <div className="grid gap-1 rounded-lg border p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{heading}</p>
      <p className="text-sm font-medium">{terms.label}</p>
      <p className="text-sm tabular-nums text-muted-foreground">
        {usageUsd(terms.monthlyPriceUsd)} per month, {memberCap(terms.maxMembers).toLowerCase()}
      </p>
    </div>
  );
}

function SwitchDialog({ offer, from, busy, onSwitched }: { offer: PlanOffer; from: Terms; busy: boolean; onSwitched: (planKey: string) => void }) {
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
          <TermsRow heading="Now" terms={from} />
          <TermsRow heading="After the switch" terms={offer} />
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
              change.mutate(offer.key, {
                onSuccess: () => {
                  setOpen(false);
                  onSwitched(offer.key);
                },
              })
            }
          >
            {change.isPending ? "Switching" : `Switch to ${offer.label}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SubscribeButton({ offer, primary, blocked }: { offer: PlanOffer; primary: boolean; blocked: boolean }) {
  const { checkout } = usePlanActions();

  return (
    <Button
      variant={primary ? "default" : "outline"}
      size="sm"
      className={BUTTON_CLASS}
      disabled={blocked || checkout.isPending || checkout.isSuccess}
      onClick={() => checkout.mutate(offer.key)}
    >
      Subscribe to {offer.label}
    </Button>
  );
}

type ComparePlansProps = {
  views: ReadonlyArray<PlanCardView>;
  from: Terms | null;
  canManage: boolean;
  switching: boolean;
  onSwitched: (planKey: string) => void;
};

export function ComparePlans({ views, from, canManage, switching, onSwitched }: ComparePlansProps) {
  const firstSubscribable = views.find((view) => view.action === "subscribe" && view.blocked === null)?.offer.key;

  return (
    <section aria-label="Compare plans" className="grid gap-4">
      <h2 className="text-lg font-semibold tracking-tight">Compare plans</h2>
      <div className="grid items-stretch gap-8 lg:grid-cols-2">
        {views.map(({ offer, current, action, blocked }) => (
          <Card key={offer.key} className="grid grid-rows-[auto_1fr]">
            <CardHeader className="flex-row items-center justify-between gap-4">
              <CardTitle>{offer.label}</CardTitle>
              {current && <Badge variant="neutral">Current plan</Badge>}
            </CardHeader>
            <CardContent className="grid content-between gap-6">
              <div className="grid content-start gap-4">
                <p className="text-[40px] font-semibold leading-none tracking-tight tabular-nums">
                  {usageUsd(offer.monthlyPriceUsd)}
                  <span className="ml-1.5 text-sm font-normal tracking-normal text-muted-foreground">per month</span>
                </p>
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
                    {action === "switch" && from !== null ? (
                      <SwitchDialog offer={offer} from={from} busy={switching || blocked !== null} onSwitched={onSwitched} />
                    ) : (
                      <SubscribeButton offer={offer} primary={offer.key === firstSubscribable} blocked={blocked !== null} />
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
