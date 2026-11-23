import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { AuthForm, authKeys, verifyEmail } from "#/modules/auth";

const SearchSchema = z.object({ token: z.string().optional() });

export const Route = createFileRoute("/verify-email")({
  head: () => ({ meta: [{ title: "Verify your email · Elise" }] }),
  validateSearch: SearchSchema,
  beforeLoad: ({ context }) => {
    if (context.user) throw redirect({ to: "/overview" });
  },
  loaderDeps: ({ search }) => ({ token: search.token }),
  loader: async ({ context, deps }) => {
    if (!deps.token) return;
    const result = await verifyEmail({ data: { token: deps.token } });
    if (!result.verified) return;
    context.queryClient.removeQueries({ queryKey: authKeys.session() });
    throw redirect({ to: "/overview" });
  },
  component: () => <AuthForm mode="verifyFailed" />,
});
