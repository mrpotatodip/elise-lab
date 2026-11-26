import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { CircleCheck, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader } from "#/components/ui/card";
import { FieldError } from "#/components/ui/field-error";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { fieldAria, fieldMessage } from "#/lib/form-field";
import { ShellPublicBrand, ShellPublicThemeSwitch } from "#/modules/shell";
import { approveDeviceLogin, denyDeviceLogin } from "../api";
import { DEVICE_COPY } from "../constants";
import { deviceKeys, deviceLoginQuery } from "../hooks";
import { DeviceFormSchema, type DeviceAccount, type PendingRunnerLogin } from "../schemas";
import { denyAccountId, displayCode, ipDiffers, preselectedAccountId } from "../utils";
import { DeviceUnusable } from "./device-unusable";

const NAME_ID = "device-runner-name";
const ACCOUNT_ID = "device-account";

type Approved = { name: string; accountName: string };

function DeviceShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto grid min-h-svh w-full max-w-lg content-center gap-8 p-6">
      <ShellPublicThemeSwitch />
      <ShellPublicBrand />
      {children}
    </main>
  );
}

function DeviceConnected({ approved }: { approved: Approved }) {
  return (
    <DeviceShell>
      <Card className="shadow-raised">
        <CardHeader className="gap-1.5 px-8 py-8">
          <h1 className="flex items-center gap-2 text-xl font-semibold leading-none tracking-tight">
            <CircleCheck className="size-5 text-status-success" />
            {DEVICE_COPY.doneTitle}
          </h1>
          <p className="text-sm text-muted-foreground">
            {approved.name} is now a Runner of {approved.accountName}. {DEVICE_COPY.doneHint}
          </p>
        </CardHeader>
      </Card>
    </DeviceShell>
  );
}

function DeviceDenied() {
  return (
    <DeviceShell>
      <Card className="shadow-raised">
        <CardHeader className="gap-1.5 px-8 py-8">
          <h1 className="text-xl font-semibold leading-none tracking-tight">{DEVICE_COPY.deniedTitle}</h1>
          <p className="text-sm text-muted-foreground">{DEVICE_COPY.deniedHint}</p>
        </CardHeader>
      </Card>
    </DeviceShell>
  );
}

function DeviceDetails({ login, differs }: { login: PendingRunnerLogin; differs: boolean }) {
  return (
    <div className="grid gap-3">
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
        <dt className="text-muted-foreground">Computer</dt>
        <dd>
          {login.os}, {login.cpu}
        </dd>
        <dt className="text-muted-foreground">Runner version</dt>
        <dd>{login.version}</dd>
        <dt className="text-muted-foreground">Requested from</dt>
        <dd className="font-mono tabular-nums">{login.requestIp}</dd>
      </dl>
      {differs && (
        <Alert variant="warning">
          <TriangleAlert />
          <AlertDescription>{DEVICE_COPY.ipDiffers}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

function DeviceAccountField({
  accounts,
  value,
  onChange,
}: {
  accounts: DeviceAccount[];
  value: string;
  onChange: (next: string) => void;
}) {
  const [only] = accounts;
  if (accounts.length === 1 && only) {
    return (
      <div className="grid gap-1">
        <span className="text-sm font-medium">Account</span>
        <span className="text-sm">{only.name}</span>
      </div>
    );
  }
  return (
    <div className="grid gap-2">
      <Label htmlFor={ACCOUNT_ID}>Which account is this Runner for?</Label>
      <Select
        value={value}
        items={accounts.map((account) => ({ value: account.id, label: account.name }))}
        onValueChange={(next) => onChange(next ?? "")}
      >
        <SelectTrigger id={ACCOUNT_ID} className="w-full">
          <SelectValue placeholder="Choose an account" />
        </SelectTrigger>
        <SelectContent>
          {accounts.map((account) => (
            <SelectItem key={account.id} value={account.id}>
              {account.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function DeviceApproval({ code }: { code: string }) {
  const { data } = useSuspenseQuery(deviceLoginQuery(code));
  const queryClient = useQueryClient();
  const [approved, setApproved] = useState<Approved | null>(null);
  const [denied, setDenied] = useState(false);

  const approve = useMutation({
    mutationFn: (input: { accountId: string; name: string }) =>
      approveDeviceLogin({ data: { userCode: code, ...input } }),
    onSuccess: (_result, input) =>
      setApproved({
        name: input.name,
        accountName: data.accounts.find((account) => account.id === input.accountId)?.name ?? "",
      }),
    onError: async (error) => {
      toast.error(`We couldn't approve this login. ${error.message}`);
      await queryClient.invalidateQueries({ queryKey: deviceKeys.login(code) });
    },
  });

  const deny = useMutation({
    mutationFn: (input: { accountId: string }) => denyDeviceLogin({ data: { userCode: code, ...input } }),
    onSuccess: () => setDenied(true),
    onError: async (error) => {
      toast.error(`We couldn't deny this login. ${error.message}`);
      await queryClient.invalidateQueries({ queryKey: deviceKeys.login(code) });
    },
  });

  const form = useForm({
    defaultValues: { accountId: preselectedAccountId(data.accounts), name: data.login?.suggestedName ?? "" },
    validators: { onSubmit: DeviceFormSchema },
    onSubmit: ({ value }) => approve.mutate({ accountId: value.accountId, name: value.name.trim() }),
  });

  const busy = approve.isPending || deny.isPending;

  if (approved) return <DeviceConnected approved={approved} />;
  if (denied) return <DeviceDenied />;
  if (!data.login) return <DeviceUnusable />;

  return (
    <DeviceShell>
      <Card className="shadow-raised">
        <CardHeader className="gap-1.5 px-8 pb-6 pt-8">
          <h1 className="text-xl font-semibold leading-none tracking-tight">{DEVICE_COPY.title}</h1>
          <p className="text-sm text-muted-foreground">{DEVICE_COPY.hint}</p>
        </CardHeader>
        <CardContent className="grid gap-6 px-8 pb-8">
          <div className="grid gap-1.5 text-center">
            <span className="text-xs text-muted-foreground">{DEVICE_COPY.codeLabel}</span>
            <span className="rounded-lg border bg-muted/40 py-3 font-mono text-2xl tracking-widest">
              {displayCode(code)}
            </span>
          </div>
          <Alert variant="warning">
            <TriangleAlert />
            <AlertDescription>
              {DEVICE_COPY.warningBefore}
              <code className="font-mono">{DEVICE_COPY.warningCommand}</code>
              {DEVICE_COPY.warningAfter}
            </AlertDescription>
          </Alert>
          <DeviceDetails login={data.login} differs={ipDiffers(data.login.requestIp, data.yourIp)} />
          {data.accounts.length === 0 ? (
            <Alert variant="info">
              <AlertDescription>{DEVICE_COPY.noAccount}</AlertDescription>
            </Alert>
          ) : (
            <form
              noValidate
              className="grid gap-5"
              onSubmit={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void form.handleSubmit();
              }}
            >
              <form.Field name="accountId">
                {(field) => (
                  <div className="grid gap-2">
                    <DeviceAccountField
                      accounts={data.accounts}
                      value={field.state.value}
                      onChange={field.handleChange}
                    />
                    <FieldError id={ACCOUNT_ID} message={fieldMessage(field)} />
                  </div>
                )}
              </form.Field>
              <form.Field name="name">
                {(field) => (
                  <div className="grid gap-2">
                    <Label htmlFor={NAME_ID}>What is this computer called?</Label>
                    <Input
                      id={NAME_ID}
                      name={field.name}
                      type="text"
                      autoComplete="off"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                      {...fieldAria(field, NAME_ID)}
                    />
                    <FieldError id={NAME_ID} message={fieldMessage(field)} />
                  </div>
                )}
              </form.Field>
              <div className="grid gap-2">
                <Button type="submit" size="lg" disabled={busy}>
                  {approve.isPending ? DEVICE_COPY.approving : DEVICE_COPY.approve}
                </Button>
                <Button
                  type="button"
                  size="lg"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    deny.mutate({ accountId: denyAccountId(data.accounts, form.getFieldValue("accountId")) })
                  }
                >
                  {deny.isPending ? DEVICE_COPY.denying : DEVICE_COPY.deny}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </DeviceShell>
  );
}
