import { createFileRoute, redirect } from "@tanstack/react-router";
import { hasAccessPower } from "@repo/contracts/elise";
import { groupsQuery, teamQuery, GroupsPage } from "#/modules/team";

export const Route = createFileRoute("/_app/groups")({
  head: () => ({ meta: [{ title: "Groups · Elise" }] }),
  beforeLoad: ({ context }) => {
    if (!hasAccessPower(context.user?.powers ?? [], "company:team:members:read")) throw redirect({ to: "/overview" });
  },
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.query({ ...teamQuery(), staleTime: "static" }),
      context.queryClient.query({ ...groupsQuery(), staleTime: "static" }),
    ]),
  component: GroupsPage,
});
