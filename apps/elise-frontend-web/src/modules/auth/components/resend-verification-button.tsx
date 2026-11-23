import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "#/components/ui/button";
import { resendVerification } from "../api";
import { AUTH_COPY } from "../constants";

export function ResendVerificationButton({ email }: { email: string }) {
  const mutation = useMutation({
    mutationFn: () => resendVerification({ data: { email } }),
    onError: (error: Error) => toast.error(error.message || AUTH_COPY.verify.failed),
  });

  return (
    <div className="grid gap-3">
      <Button type="button" variant="outline" size="lg" className="w-full" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
        {mutation.isPending ? "Please wait…" : AUTH_COPY.verify.resend}
      </Button>
      {mutation.isSuccess ? <output className="block text-sm leading-relaxed text-muted-foreground">{AUTH_COPY.verify.sent}</output> : null}
    </div>
  );
}
