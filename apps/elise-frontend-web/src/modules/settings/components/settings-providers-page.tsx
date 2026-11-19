import { Suspense } from "react";
import { RunnersCard } from "#/modules/runner";
import { ShellPageHeader } from "#/modules/shell";

export function SettingsProvidersPage() {
  return (
    <>
      <ShellPageHeader title="Runners" description="The computers that run this account's scans, on their own Claude and git login. Elise charges nothing per scan." />
      <Suspense fallback={null}>
        <RunnersCard />
      </Suspense>
    </>
  );
}
