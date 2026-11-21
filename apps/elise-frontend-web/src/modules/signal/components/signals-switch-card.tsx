import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Checkbox } from "#/components/ui/checkbox";
import { Label } from "#/components/ui/label";
import { updateSignalsSettings } from "../api";
import { signalKeys, signalsSettingsQuery } from "../hooks";

const SWITCH_ID = "signals-enabled";

export function SignalsSwitchCard() {
  const { data } = useSuspenseQuery(signalsSettingsQuery());
  const queryClient = useQueryClient();

  const save = useMutation({
    mutationFn: (enabled: boolean) => updateSignalsSettings({ data: { enabled } }),
    onSuccess: (settings) => {
      queryClient.setQueryData(signalKeys.settings(), settings);
      toast.success(settings.enabled ? "Signals are on." : "Signals are off.");
    },
    onError: (error: Error) => toast.error(`We couldn't change Signals. ${error.message}`),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Signals</CardTitle>
        <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">
          Signals are hints from TypeSafe&apos;s Jev model, such as a possible duplicate or a weak reason for an accepted risk. A Signal never changes a Finding, a decision or the Verdict: you act on it or ignore it.
        </p>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="flex items-start gap-3">
          <Checkbox id={SWITCH_ID} checked={data.enabled} disabled={save.isPending} onCheckedChange={(checked) => save.mutate(checked)} />
          <Label htmlFor={SWITCH_ID} className="text-sm font-medium">
            Show Signals for this account
          </Label>
        </div>
        <div className="grid gap-2 border-t pt-5 text-sm leading-relaxed text-muted-foreground">
          <p>When Signals are on, Elise sends this to TypeSafe, an outside service:</p>
          <ul className="list-disc pl-5">
            <li>the Finding title and description</li>
            <li>the evidence text of the Finding</li>
            <li>the notes people write with a decision</li>
          </ul>
          <p>Source code is never sent. Turning Signals off stops new requests to TypeSafe and hides the Signals already stored. Turning them on again shows them.</p>
        </div>
      </CardContent>
    </Card>
  );
}
