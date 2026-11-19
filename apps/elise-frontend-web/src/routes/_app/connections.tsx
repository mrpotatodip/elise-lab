import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/connections")({
  head: () => ({ meta: [{ title: "Elise" }] }),
  beforeLoad: () => {
    throw redirect({ to: "/overview" });
  },
});
