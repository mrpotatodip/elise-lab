import { createFileRoute, redirect } from "@tanstack/react-router";
import { hasAccessPower } from "@repo/contracts/elise";
import { cliAccessQuery, runnersQuery } from "#/modules/runner";
import { SettingsProvidersPage } from "#/modules/settings";

export const Route = createFileRoute("/_app/settings/providers")({
  head: () => ({ meta: [{ title: "Runners · Elise" }] }),
  beforeLoad: ({ context }) => {
    if (!hasAccessPower(context.user?.powers ?? [], "company:runners:create")) throw redirect({ to: "/overview" });
  },
  loader: async ({ context }) => {
    await Promise.all([context.queryClient.query(runnersQuery()), context.queryClient.query(cliAccessQuery())]);
  },
  component: SettingsProvidersPage,
});
