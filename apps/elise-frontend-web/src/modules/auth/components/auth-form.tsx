import { useCallback, useState } from "react";
import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { SIGN_UP_PASSWORD_MIN } from "@repo/contracts/elise";
import { ShellPublicBrand, ShellPublicThemeSwitch } from "#/modules/shell";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader } from "#/components/ui/card";
import { FieldError } from "#/components/ui/field-error";
import { Input } from "#/components/ui/input";
import { TooltipProvider } from "#/components/ui/tooltip";
import { Label } from "#/components/ui/label";
import { fieldAria, fieldMessage, focusFirstInvalidField } from "#/lib/form-field";
import { signIn, signUp } from "../api";
import { AUTH_COPY } from "../constants";
import { AuthBrandPanel } from "./auth-brand-panel";
import { ForgotPasswordFields } from "./forgot-password-fields";
import { ResetPasswordFields } from "./reset-password-fields";
import { TurnstileWidget } from "./turnstile-widget";
import { CheckEmailFields } from "./check-email-fields";
import { ResendVerificationButton } from "./resend-verification-button";
import { VerifyFailedFields } from "./verify-failed-fields";
import { useAuthDone } from "../hooks";
import { SignInSchema, SignUpInputSchema } from "../schemas";
import { screenAfterSignIn } from "../utils";
import { TwoFactorSecondStepFields } from "./two-factor-second-step-fields";
import { TwoFactorSetupFields } from "./two-factor-setup-fields";
import { AuthSignOutButton } from "./auth-signout-button";

function SignInFields({ redirectTo }: { redirectTo: string | undefined }) {
  const done = useAuthDone(redirectTo);
  const navigate = useNavigate();
  const signInMutation = useMutation({
    mutationFn: (input: typeof SignInSchema._output) => signIn({ data: input }),
    onSuccess: (result) => {
      const screen = screenAfterSignIn(result.outcome, result.setupRequired);
      if (screen === "second-step") return navigate({ to: "/two-factor", search: { redirect: redirectTo } });
      if (screen === "setup") return done.onSuccess("/two-factor-setup");
      return screen === "app" ? done.onSuccess() : undefined;
    },
    onError: done.onError,
  });
  const form = useForm({
    defaultValues: { email: "", password: "" },
    validators: { onSubmit: SignInSchema },
    onSubmit: ({ value }) => signInMutation.mutate(value),
    onSubmitInvalid: focusFirstInvalidField,
  });

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
      <form.Field name="password">
        {(field) => (
          <div className="grid gap-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name={field.name} type="password" autoComplete="current-password" value={field.state.value} onBlur={field.handleBlur} onChange={(event) => field.handleChange(event.target.value)} {...fieldAria(field, "password")} />
            <FieldError id="password" message={fieldMessage(field)} />
          </div>
        )}
      </form.Field>
      {signInMutation.data?.outcome === "unverified" && signInMutation.variables ? (
        <div className="grid gap-3">
          <p role="alert" className="text-sm leading-relaxed">
            {AUTH_COPY.verify.unverified}
          </p>
          <ResendVerificationButton email={signInMutation.variables.email} />
        </div>
      ) : null}
      <Button type="submit" size="lg" className="mt-1 w-full" disabled={signInMutation.isPending}>
        {signInMutation.isPending ? "Please wait…" : AUTH_COPY.signin.submit}
      </Button>
      <Link to={AUTH_COPY.signin.forgotTo} className="inline-flex min-h-6 items-center justify-self-start rounded-sm text-sm text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {AUTH_COPY.signin.forgot}
      </Link>
    </form>
  );
}

const browserTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

function SignUpFields({ turnstileSiteKey }: { turnstileSiteKey: string | null }) {
  const done = useAuthDone();
  const navigate = useNavigate();
  const [attempt, setAttempt] = useState(0);
  const signUpMutation = useMutation({
    mutationFn: (input: typeof SignUpInputSchema._output) => signUp({ data: input }),
    onSuccess: (_result, input) => navigate({ to: "/check-email", search: { email: input.email } }),
    onError: (error: Error) => {
      setAttempt((count) => count + 1);
      form.setFieldValue("turnstileToken", "");
      done.onError(error);
    },
  });
  const form = useForm({
    defaultValues: { firstName: "", lastName: "", accountName: "", email: "", password: "", timezone: browserTimezone(), turnstileToken: "" },
    validators: { onSubmit: SignUpInputSchema },
    onSubmit: ({ value }) => signUpMutation.mutate(value),
    onSubmitInvalid: focusFirstInvalidField,
  });
  const setToken = useCallback((token: string) => form.setFieldValue("turnstileToken", token), [form]);

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
      <div className="grid grid-cols-2 gap-4">
        <form.Field name="firstName">
          {(field) => (
            <div className="grid content-start gap-2">
              <Label htmlFor="firstName">First name</Label>
              <Input id="firstName" name={field.name} autoComplete="given-name" value={field.state.value} onBlur={field.handleBlur} onChange={(event) => field.handleChange(event.target.value)} {...fieldAria(field, "firstName")} />
              <FieldError id="firstName" message={fieldMessage(field)} />
            </div>
          )}
        </form.Field>
        <form.Field name="lastName">
          {(field) => (
            <div className="grid content-start gap-2">
              <Label htmlFor="lastName">Last name</Label>
              <Input id="lastName" name={field.name} autoComplete="family-name" value={field.state.value} onBlur={field.handleBlur} onChange={(event) => field.handleChange(event.target.value)} {...fieldAria(field, "lastName")} />
              <FieldError id="lastName" message={fieldMessage(field)} />
            </div>
          )}
        </form.Field>
      </div>
      <form.Field name="accountName">
        {(field) => (
          <div className="grid gap-2">
            <Label htmlFor="accountName">Account name</Label>
            <Input id="accountName" name={field.name} autoComplete="organization" value={field.state.value} onBlur={field.handleBlur} onChange={(event) => field.handleChange(event.target.value)} {...fieldAria(field, "accountName", "accountName-help")} />
            <p id="accountName-help" className="text-sm leading-relaxed text-muted-foreground">
              {AUTH_COPY.signup.accountNameHelp}
            </p>
            <FieldError id="accountName" message={fieldMessage(field)} />
          </div>
        )}
      </form.Field>
      <form.Field name="email">
        {(field) => (
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name={field.name} type="email" autoComplete="email" value={field.state.value} onBlur={field.handleBlur} onChange={(event) => field.handleChange(event.target.value)} {...fieldAria(field, "email")} />
            <FieldError id="email" message={fieldMessage(field)} />
          </div>
        )}
      </form.Field>
      <form.Field name="password">
        {(field) => (
          <div className="grid gap-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name={field.name} type="password" autoComplete="new-password" value={field.state.value} onBlur={field.handleBlur} onChange={(event) => field.handleChange(event.target.value)} {...fieldAria(field, "password", "password-hint")} />
            <p id="password-hint" className="text-sm leading-relaxed text-muted-foreground">
              At least {SIGN_UP_PASSWORD_MIN} characters.
            </p>
            <FieldError id="password" message={fieldMessage(field)} />
          </div>
        )}
      </form.Field>
      <form.Field name="turnstileToken">
        {(field) => (
          <div className="grid gap-2">
            {turnstileSiteKey ? <TurnstileWidget key={attempt} siteKey={turnstileSiteKey} onToken={setToken} /> : <p className="text-sm text-muted-foreground">{AUTH_COPY.signup.checkUnavailable}</p>}
            <FieldError id="turnstileToken" message={fieldMessage(field)} />
          </div>
        )}
      </form.Field>
      <p className="text-sm leading-relaxed text-muted-foreground">{AUTH_COPY.signup.consequence}</p>
      <Button type="submit" size="lg" className="w-full" disabled={signUpMutation.isPending}>
        {signUpMutation.isPending ? "Please wait…" : AUTH_COPY.signup.submit}
      </Button>
    </form>
  );
}

type AuthMode = "signin" | "signup" | "forgot" | "reset" | "checkEmail" | "verifyFailed" | "twoFactor" | "setup";

function AuthFields({ mode, token, email, redirectTo, turnstileSiteKey }: { mode: AuthMode; token: string | undefined; email: string | undefined; redirectTo: string | undefined; turnstileSiteKey: string | null }) {
  if (mode === "twoFactor") return <TwoFactorSecondStepFields redirectTo={redirectTo} />;
  if (mode === "setup") return <TwoFactorSetupFields />;
  if (mode === "checkEmail") return <CheckEmailFields email={email} />;
  if (mode === "verifyFailed") return <VerifyFailedFields />;
  if (mode === "signup") return <SignUpFields turnstileSiteKey={turnstileSiteKey} />;
  if (mode === "forgot") return <ForgotPasswordFields />;
  if (mode === "reset") return <ResetPasswordFields token={token} />;
  return <SignInFields redirectTo={redirectTo} />;
}

// -----
// `token` is only read by the reset page: the one from the emailed link.
// `redirectTo` is only read by sign-in: the page to open once signed in.
// -----
export function AuthForm({ mode, token, email, redirectTo, turnstileSiteKey = null }: { mode: AuthMode; token?: string; email?: string; redirectTo?: string; turnstileSiteKey?: string | null }) {
  const copy = AUTH_COPY[mode];

  return (
    <main className="mx-auto grid min-h-svh w-full max-w-6xl lg:grid-cols-2">
      <ShellPublicThemeSwitch />
      <AuthBrandPanel />
      <div className="mx-auto grid w-full max-w-lg content-center gap-8 p-6 lg:p-12">
        <div className="grid lg:hidden">
          <ShellPublicBrand />
        </div>
        <Card className="shadow-raised">
          <CardHeader className="gap-1.5 px-8 pb-9 pt-8">
            <h1 className="text-xl font-semibold leading-none tracking-tight">{copy.title}</h1>
            <p className="text-sm text-muted-foreground">{copy.hint}</p>
          </CardHeader>
          <CardContent className="p-8">
            <AuthFields mode={mode} token={token} email={email} redirectTo={redirectTo} turnstileSiteKey={turnstileSiteKey} />
          </CardContent>
        </Card>
        {mode === "setup" ? (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            {AUTH_COPY.setup.swap}
            <TooltipProvider>
              <AuthSignOutButton />
            </TooltipProvider>
          </div>
        ) : (
          <Link to={AUTH_COPY[mode].to} className="inline-flex min-h-6 items-center justify-self-center rounded-sm text-sm text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {AUTH_COPY[mode].swap}
          </Link>
        )}
      </div>
    </main>
  );
}
