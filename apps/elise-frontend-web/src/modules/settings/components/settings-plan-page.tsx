import { Suspense } from "react";
import { useSearch } from "@tanstack/react-router";
import { PlanCard } from "#/modules/plan";

export function SettingsPlanPage() {
  const { checkout } = useSearch({ from: "/_app/settings/plan" });
  return (
    <Suspense fallback={null}>
      <PlanCard checkout={checkout} />
    </Suspense>
  );
}
