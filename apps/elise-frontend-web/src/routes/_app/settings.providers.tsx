import { createFileRoute, redirect } from "@tanstack/react-router";
import { hasAccessPower } from "@repo/contracts/elise";
import { runnersQuery } from "#/modules/runner";
import { SettingsProvidersPage } from "#/modules/settings";

export const Route = createFileRoute("/_app/settings/providers")({
  head: () => ({ meta: [{ title: "Runners · Settings · Elise" }] }),
  beforeLoad: ({ context }) => {
    if (!hasAccessPower(context.user?.powers ?? [], "company:usage:anthropic_key:update")) throw redirect({ to: "/settings/budget" });
  },
  loader: ({ context }) => context.queryClient.query(runnersQuery()),
  component: SettingsProvidersPage,
});
