import { createFileRoute, redirect } from "@tanstack/react-router";
import { AuthForm } from "#/modules/auth";

export const Route = createFileRoute("/two-factor-setup")({
  head: () => ({ meta: [{ title: "Set up Two-factor · Elise" }] }),
  beforeLoad: ({ context }) => {
    if (!context.user) throw redirect({ to: "/signin" });
    if (!context.user.twoFactorSetupRequired) throw redirect({ to: "/overview" });
  },
  component: () => <AuthForm mode="setup" />,
});
