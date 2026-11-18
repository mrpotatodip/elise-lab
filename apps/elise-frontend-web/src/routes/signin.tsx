import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { AuthForm, safeRedirectPath } from "#/modules/auth";

const SearchSchema = z.object({ redirect: z.string().optional() });

export const Route = createFileRoute("/signin")({
  head: () => ({ meta: [{ title: "Sign in · Elise" }] }),
  validateSearch: SearchSchema,
  beforeLoad: ({ context, search }) => {
    if (!context.user) return;
    const target = safeRedirectPath(search.redirect);
    if (target) throw redirect({ href: target });
    throw redirect({ to: "/overview" });
  },
  component: SignInPage,
});

function SignInPage() {
  const { redirect: target } = Route.useSearch();
  return <AuthForm mode="signin" redirectTo={safeRedirectPath(target)} />;
}
