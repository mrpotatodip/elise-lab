import { Suspense } from "react";
import { PlanCard } from "#/modules/plan";

export function SettingsPlanPage() {
  return (
    <Suspense fallback={null}>
      <PlanCard />
    </Suspense>
  );
}
