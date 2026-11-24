import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { renderSVG } from "uqr";
import { toast } from "sonner";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { confirmTwoFactor, startTwoFactor } from "../api";
import { spacedKey } from "../utils";

function QrCode({ value }: { value: string }) {
  const source = `data:image/svg+xml;utf8,${encodeURIComponent(renderSVG(value, { border: 2 }))}`;
  return (
    <img
      src={source}
      alt="QR code for your Authenticator app"
      width={192}
      height={192}
      className="size-48 rounded-lg border"
    />
  );
}

export function BackupCodes({
  codes,
  onDone,
  doneLabel,
}: {
  codes: readonly string[];
  onDone: () => void;
  doneLabel: string;
}) {
  const [saved, setSaved] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(codes.join("\n"));
    toast.success("Backup codes copied.");
  };
  return (
    <div className="grid gap-5">
      <p className="text-sm leading-relaxed">
        Keep these 10 Backup codes somewhere safe. Each works once if you lose your Authenticator app. They are shown
        only now.
      </p>
      <ul
        className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/40 p-4 font-mono text-sm"
        aria-label="Backup codes"
      >
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <Button type="button" variant="outline" onClick={copy}>
        Copy the codes
      </Button>
      <div className="flex items-start gap-3">
        <Checkbox id="codes-saved" checked={saved} onCheckedChange={(checked) => setSaved(checked === true)} />
        <Label htmlFor="codes-saved" className="text-sm">
          I saved these codes
        </Label>
      </div>
      <Button type="button" size="lg" disabled={!saved} onClick={onDone}>
        {doneLabel}
      </Button>
    </div>
  );
}

const secretOf = (uri: string) => new URL(uri).searchParams.get("secret") ?? "";

type Started = { totpURI: string; backupCodes: string[] };

export function TwoFactorSetup({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [started, setStarted] = useState<Started | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const start = useMutation({
    mutationFn: (typed: string) => startTwoFactor({ data: { password: typed } }),
    onSuccess: setStarted,
    onError: (error: Error) => setMessage(error.message),
  });
  const confirm = useMutation({
    mutationFn: (typed: string) => confirmTwoFactor({ data: { code: typed } }),
    onSuccess: (result) => {
      if (result.ok) setConfirmed(true);
      else
        setMessage(
          result.failure === "wrong"
            ? "That code did not work. Check your Authenticator app and try again."
            : "We could not check the code. Try again.",
        );
    },
    onError: (error: Error) => setMessage(error.message),
  });

  if (started && confirmed) return <BackupCodes codes={started.backupCodes} onDone={onDone} doneLabel="Finish" />;

  if (started) {
    return (
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          setMessage(null);
          if (code.trim() !== "") confirm.mutate(code);
        }}
        className="grid gap-5"
      >
        <p className="text-sm leading-relaxed">
          Scan this with an Authenticator app, then type the 6-digit code it shows.
        </p>
        <div className="grid justify-items-center gap-2">
          <QrCode value={started.totpURI} />
          <p className="max-w-copy text-center text-sm leading-relaxed text-muted-foreground">
            Cannot scan? Type this key: <span className="font-mono">{spacedKey(secretOf(started.totpURI))}</span>
          </p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="setup-code">Code from the app</Label>
          <Input
            id="setup-code"
            autoComplete="one-time-code"
            inputMode="numeric"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            aria-invalid={message ? true : undefined}
            aria-describedby={message ? "setup-code-error" : undefined}
          />
          {message ? (
            <p id="setup-code-error" role="alert" className="text-xs text-status-danger">
              {message}
            </p>
          ) : null}
        </div>
        <Button type="submit" size="lg" disabled={confirm.isPending || code.trim() === ""}>
          {confirm.isPending ? "Please wait…" : "Turn on Two-factor"}
        </Button>
      </form>
    );
  }

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        setMessage(null);
        if (password !== "") start.mutate(password);
      }}
      className="grid gap-5"
    >
      <div className="grid gap-2">
        <Label htmlFor="setup-password">Your password</Label>
        <Input
          id="setup-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-invalid={message ? true : undefined}
          aria-describedby={message ? "setup-password-error" : undefined}
        />
        {message ? (
          <p id="setup-password-error" role="alert" className="text-xs text-status-danger">
            {message}
          </p>
        ) : null}
      </div>
      <Button type="submit" size="lg" disabled={start.isPending || password === ""}>
        {start.isPending ? "Please wait…" : "Continue"}
      </Button>
    </form>
  );
}
