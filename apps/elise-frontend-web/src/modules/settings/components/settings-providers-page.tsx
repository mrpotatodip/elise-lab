import { Suspense } from "react";
import { RunnersCard } from "#/modules/runner";
import { ShellPageHeader } from "#/modules/shell";

export function SettingsProvidersPage() {
  return (
    <>
      <ShellPageHeader title="Runners" description="Which computers run this account's scans, on their own Claude login." />
      <Suspense fallback={null}>
        <RunnersCard />
      </Suspense>
    </>
  );
}
