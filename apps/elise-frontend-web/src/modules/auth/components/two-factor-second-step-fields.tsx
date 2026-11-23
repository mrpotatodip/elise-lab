import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { verifySecondStep } from "../api";
import { AUTH_COPY, TWO_FACTOR_LOCK_MINUTES } from "../constants";
import { useAuthDone } from "../hooks";
import type { SecondStepFailure } from "../utils";

const timeFormat = new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" });

const lockMessage = () => AUTH_COPY.twoFactor.locked(`${TWO_FACTOR_LOCK_MINUTES} minutes`, timeFormat.format(new Date(Date.now() + TWO_FACTOR_LOCK_MINUTES * 60_000)));

const failureMessage = (failure: SecondStepFailure): string => {
  if (failure === "locked") return lockMessage();
  if (failure === "wrong") return AUTH_COPY.twoFactor.wrong;
  if (failure === "expired") return AUTH_COPY.twoFactor.expired;
  return AUTH_COPY.twoFactor.other;
};

export function TwoFactorSecondStepFields({ redirectTo }: { redirectTo: string | undefined }) {
  const done = useAuthDone(redirectTo);
  const inputRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const check = useMutation({
    mutationFn: (typed: string) => verifySecondStep({ data: { code: typed } }),
    onSuccess: (result) => {
      if (result.ok) return done.onSuccess();
      setMessage(failureMessage(result.failure));
      inputRef.current?.focus();
      return undefined;
    },
    onError: done.onError,
  });

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (code.trim() !== "") check.mutate(code);
      }}
      className="grid gap-5"
    >
      <div className="grid gap-2">
        <Label htmlFor="code">{AUTH_COPY.twoFactor.label}</Label>
        <Input ref={inputRef} id="code" name="code" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value)} aria-invalid={message ? true : undefined} aria-describedby={message ? "code-error" : undefined} />
        {message ? (
          <p id="code-error" role="alert" className="text-xs text-status-danger">
            {message}
          </p>
        ) : null}
      </div>
      <Button type="submit" size="lg" className="w-full" disabled={check.isPending || code.trim() === ""}>
        {check.isPending ? "Please wait…" : AUTH_COPY.twoFactor.submit}
      </Button>
    </form>
  );
}
