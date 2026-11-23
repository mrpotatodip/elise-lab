import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "#/components/ui/button";
import { FieldError } from "#/components/ui/field-error";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { fieldAria, fieldMessage, focusFirstInvalidField } from "#/lib/form-field";
import { resendVerification } from "../api";
import { AUTH_COPY } from "../constants";
import { ResendEmailSchema } from "../schemas";

export function ResendVerificationButton({ email }: { email: string }) {
  const mutation = useMutation({
    mutationFn: () => resendVerification({ data: { email } }),
    onError: (error: Error) => toast.error(error.message || "Something went wrong"),
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

export function CheckEmailFields({ email }: { email: string | undefined }) {
  if (!email) return <p className="text-sm leading-relaxed">Open the link in the email we sent you.</p>;
  return (
    <div className="grid gap-5">
      <p className="text-sm leading-relaxed">
        We sent it to <strong className="font-medium">{email}</strong>. It can take a minute; check the spam folder too.
      </p>
      <ResendVerificationButton email={email} />
    </div>
  );
}

export function VerifyFailedFields() {
  const mutation = useMutation({
    mutationFn: (input: typeof ResendEmailSchema._output) => resendVerification({ data: input }),
    onError: (error: Error) => toast.error(error.message || "Something went wrong"),
  });
  const form = useForm({
    defaultValues: { email: "" },
    validators: { onSubmit: ResendEmailSchema },
    onSubmit: ({ value }) => mutation.mutate(value),
    onSubmitInvalid: focusFirstInvalidField,
  });

  if (mutation.isSuccess) return <output className="block text-sm leading-relaxed">{AUTH_COPY.verify.sent}</output>;

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
      className="grid gap-5"
    >
      <form.Field name="email">
        {(field) => (
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name={field.name} type="email" autoComplete="email" value={field.state.value} onBlur={field.handleBlur} onChange={(event) => field.handleChange(event.target.value)} {...fieldAria(field, "email")} />
            <FieldError id="email" message={fieldMessage(field)} />
          </div>
        )}
      </form.Field>
      <Button type="submit" size="lg" className="mt-1 w-full" disabled={mutation.isPending}>
        {mutation.isPending ? "Please wait…" : AUTH_COPY.verify.resend}
      </Button>
    </form>
  );
}
