import { createFileRoute, redirect } from "@tanstack/react-router";
import { AuthForm, fetchTurnstileSiteKey } from "#/modules/auth";

export const Route = createFileRoute("/signup")({
  head: () => ({ meta: [{ title: "Create account · Elise" }] }),
  beforeLoad: ({ context }) => {
    if (context.user) throw redirect({ to: "/overview" });
  },
  loader: () => fetchTurnstileSiteKey(),
  component: SignUpPage,
});

function SignUpPage() {
  const turnstileSiteKey = Route.useLoaderData();
  return <AuthForm mode="signup" turnstileSiteKey={turnstileSiteKey} />;
}
