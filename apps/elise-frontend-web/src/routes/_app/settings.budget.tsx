import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/settings/budget")({
  beforeLoad: () => {
    throw redirect({ to: "/settings/providers" });
  },
});
