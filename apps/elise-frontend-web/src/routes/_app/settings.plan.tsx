import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { hasAccessPower } from "@repo/contracts/elise";
import { planOffersQuery, planQuery } from "#/modules/plan";
import { SettingsPlanPage } from "#/modules/settings";

const SearchSchema = z.object({ checkout: z.enum(["success", "cancelled"]).optional().catch(undefined) });

export const Route = createFileRoute("/_app/settings/plan")({
  validateSearch: SearchSchema,
  head: () => ({ meta: [{ title: "Plan and billing · Elise" }] }),
  beforeLoad: ({ context }) => {
    if (!hasAccessPower(context.user?.powers ?? [], "company:plan:read")) throw redirect({ to: "/overview" });
  },
  loader: async ({ context }) => {
    const [plan] = await Promise.all([context.queryClient.query({ ...planQuery(), staleTime: "static" }), context.queryClient.query({ ...planOffersQuery(), staleTime: "static" })]);
    return plan;
  },
  component: SettingsPlanPage,
});
