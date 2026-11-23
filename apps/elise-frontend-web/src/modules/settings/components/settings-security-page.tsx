import { useQuery } from "@tanstack/react-query";
import { hasAccessPower } from "@repo/contracts/elise";
import { TwoFactorCard } from "#/modules/auth";
import { ShellPageHeader } from "#/modules/shell";
import { TwoFactorRequirementCard, twoFactorRequirementQuery } from "#/modules/team";

export function SettingsSecurityPage({ twoFactorEnabled, role, powers }: { twoFactorEnabled: boolean; role: string; powers: readonly string[] }) {
  const canSeeRequirement = hasAccessPower([...powers], "company:team:members:read");
  const canSetRequirement = hasAccessPower([...powers], "company:team:two_factor_requirement:update");
  const { data } = useQuery({ ...twoFactorRequirementQuery(), enabled: canSeeRequirement });
  return (
    <>
      <ShellPageHeader title="Security" description="How you sign in to Elise." />
      <TwoFactorCard enabled={twoFactorEnabled} role={role} accountRequires={data?.required ?? false} />
      {canSetRequirement ? <TwoFactorRequirementCard /> : null}
    </>
  );
}
