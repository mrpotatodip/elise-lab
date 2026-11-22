import { createFileRoute, redirect } from "@tanstack/react-router";
import { hasAccessPower } from "@repo/contracts/elise";
import { SettingsSignalsPage } from "#/modules/settings";
import { signalsSettingsQuery } from "#/modules/signal";

export const Route = createFileRoute("/_app/settings/signals")({
  head: () => ({ meta: [{ title: "Signals · Elise" }] }),
  beforeLoad: ({ context }) => {
    if (!hasAccessPower(context.user?.powers ?? [], "company:signals:update")) throw redirect({ to: "/overview" });
  },
  loader: ({ context }) => context.queryClient.query(signalsSettingsQuery()),
  component: SettingsSignalsPage,
});
