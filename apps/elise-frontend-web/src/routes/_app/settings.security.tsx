import { createFileRoute } from "@tanstack/react-router";
import { SettingsSecurityPage } from "#/modules/settings";

export const Route = createFileRoute("/_app/settings/security")({
  head: () => ({ meta: [{ title: "Security · Elise" }] }),
  component: SecurityPage,
});

function SecurityPage() {
  const { user } = Route.useRouteContext();
  return <SettingsSecurityPage twoFactorEnabled={user?.twoFactorEnabled ?? false} role={user?.role ?? ""} />;
}
