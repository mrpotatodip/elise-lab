import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/settings/history")({
  beforeLoad: () => {
    throw redirect({ to: "/settings/providers" });
  },
});
