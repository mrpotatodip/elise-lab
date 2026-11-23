import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { AuthForm } from "#/modules/auth";

const SearchSchema = z.object({ email: z.string().optional() });

export const Route = createFileRoute("/check-email")({
  head: () => ({ meta: [{ title: "Check your email · Elise" }] }),
  validateSearch: SearchSchema,
  beforeLoad: ({ context }) => {
    if (context.user) throw redirect({ to: "/overview" });
  },
  component: CheckEmailPage,
});

function CheckEmailPage() {
  const { email } = Route.useSearch();
  return <AuthForm mode="checkEmail" email={email} />;
}
