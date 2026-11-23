import { TwoFactorCard } from "#/modules/auth";
import { ShellPageHeader } from "#/modules/shell";

export function SettingsSecurityPage({ twoFactorEnabled, role }: { twoFactorEnabled: boolean; role: string }) {
  return (
    <>
      <ShellPageHeader title="Security" description="How you sign in to Elise." />
      <TwoFactorCard enabled={twoFactorEnabled} role={role} />
    </>
  );
}
