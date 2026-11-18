import { Suspense } from "react";
import { ShellPageHeader } from "#/modules/shell";
import { SettingsChangesCard } from "#/modules/usage";

export function SettingsHistoryPage() {
  return (
    <>
      <ShellPageHeader title="History" description="Who changed the budget, and when." />
      <Suspense fallback={null}>
        <SettingsChangesCard />
      </Suspense>
    </>
  );
}
