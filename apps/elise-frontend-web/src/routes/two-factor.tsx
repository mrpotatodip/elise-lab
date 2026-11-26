import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { AuthForm, safeRedirectPath } from "#/modules/auth";

const SearchSchema = z.object({ redirect: z.string().optional() });

export const Route = createFileRoute("/two-factor")({
  head: () => ({ meta: [{ title: "Two-factor sign-in · Elise" }] }),
  validateSearch: SearchSchema,
  beforeLoad: ({ context }) => {
    if (context.user) throw redirect({ to: "/overview" });
  },
  component: TwoFactorPage,
});

function TwoFactorPage() {
  const { redirect: target } = Route.useSearch();
  return <AuthForm mode="twoFactor" redirectTo={safeRedirectPath(target)} />;
}
