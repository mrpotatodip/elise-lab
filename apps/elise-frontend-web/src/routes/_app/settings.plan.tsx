import { createFileRoute, redirect } from "@tanstack/react-router";
import { hasAccessPower } from "@repo/contracts/elise";
import { planOffersQuery, planQuery } from "#/modules/plan";
import { SettingsPlanPage } from "#/modules/settings";

export const Route = createFileRoute("/_app/settings/plan")({
  head: () => ({ meta: [{ title: "Plan · Settings · Elise" }] }),
  beforeLoad: ({ context }) => {
    if (!hasAccessPower(context.user?.powers ?? [], "company:plan:read")) throw redirect({ to: "/settings/budget" });
  },
  loader: async ({ context }) => {
    const plan = await context.queryClient.query({ ...planQuery(), staleTime: "static" });
    if (plan.plan === null) await context.queryClient.query({ ...planOffersQuery(), staleTime: "static" });
    return plan;
  },
  component: SettingsPlanPage,
});
