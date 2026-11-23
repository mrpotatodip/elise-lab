import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { disableTwoFactor, regenerateBackupCodes } from "../api";
import { authKeys } from "../hooks";
import { canTurnOff } from "../utils";
import { BackupCodes, TwoFactorSetup } from "./two-factor-setup";

type Panel = "none" | "setup" | "regenerate" | "disable";

function PasswordField({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>Your password</Label>
      <Input id={id} type="password" autoComplete="current-password" value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function RegenerateForm({ onCodes }: { onCodes: (codes: string[]) => void }) {
  const [password, setPassword] = useState("");
  const regenerate = useMutation({
    mutationFn: () => regenerateBackupCodes({ data: { password } }),
    onSuccess: onCodes,
    onError: (error: Error) => toast.error(`We couldn't make new Backup codes. ${error.message}`),
  });
  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (password !== "") regenerate.mutate();
      }}
      className="grid max-w-sm gap-4"
    >
      <p className="text-sm leading-relaxed text-muted-foreground">New Backup codes replace the old ten: the old ones stop working.</p>
      <PasswordField id="regenerate-password" value={password} onChange={setPassword} />
      <Button type="submit" disabled={regenerate.isPending || password === ""}>
        {regenerate.isPending ? "Please wait…" : "Make new Backup codes"}
      </Button>
    </form>
  );
}

function DisableForm({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const disable = useMutation({
    mutationFn: () => disableTwoFactor({ data: { password, code } }),
    onSuccess: () => {
      toast.success("Two-factor sign-in is off.");
      onDone();
    },
    onError: (error: Error) => toast.error(`We couldn't turn Two-factor off. ${error.message}`),
  });
  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (password !== "" && code.trim() !== "") disable.mutate();
      }}
      className="grid max-w-sm gap-4"
    >
      <PasswordField id="disable-password" value={password} onChange={setPassword} />
      <div className="grid gap-2">
        <Label htmlFor="disable-code">Code from your Authenticator app, or a Backup code</Label>
        <Input id="disable-code" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value)} />
      </div>
      <Button type="submit" variant="destructive" disabled={disable.isPending || password === "" || code.trim() === ""}>
        {disable.isPending ? "Please wait…" : "Turn off Two-factor"}
      </Button>
    </form>
  );
}

export function TwoFactorCard({ enabled, role }: { enabled: boolean; role: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [panel, setPanel] = useState<Panel>("none");
  const [codes, setCodes] = useState<string[] | null>(null);

  const refresh = async () => {
    setPanel("none");
    setCodes(null);
    queryClient.removeQueries({ queryKey: authKeys.session() });
    await router.invalidate();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Two-factor sign-in</CardTitle>
        <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">
          {enabled ? "On. Signing in asks for a code from your Authenticator app after your password." : "Off. Turn it on so a stolen password is not enough to sign in as you."}
        </p>
      </CardHeader>
      <CardContent className="grid gap-5">
        {codes ? <BackupCodes codes={codes} onDone={() => void refresh()} doneLabel="Done" /> : null}
        {!codes && panel === "setup" ? <TwoFactorSetup onDone={() => void refresh()} /> : null}
        {!codes && panel === "regenerate" ? <RegenerateForm onCodes={setCodes} /> : null}
        {!codes && panel === "disable" ? <DisableForm onDone={() => void refresh()} /> : null}
        {!codes && panel === "none" ? (
          <div className="flex flex-wrap gap-3">
            {enabled ? (
              <>
                <Button variant="outline" onClick={() => setPanel("regenerate")}>
                  Make new Backup codes
                </Button>
                {canTurnOff(role) ? (
                  <Button variant="outline" onClick={() => setPanel("disable")}>
                    Turn off
                  </Button>
                ) : (
                  <p className="text-sm text-muted-foreground">Your role needs Two-factor sign-in, so it cannot be turned off.</p>
                )}
              </>
            ) : (
              <Button onClick={() => setPanel("setup")}>Turn on Two-factor</Button>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
