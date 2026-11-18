import { Suspense } from "react";
import { PlanCard } from "#/modules/plan";
import { ShellPageHeader } from "#/modules/shell";

export function SettingsPlanPage() {
  return (
    <>
      <ShellPageHeader title="Plan" description="What this account pays for." />
      <Suspense fallback={null}>
        <PlanCard />
      </Suspense>
    </>
  );
}
