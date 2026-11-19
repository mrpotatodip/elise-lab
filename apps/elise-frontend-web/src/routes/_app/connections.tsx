import { createFileRoute } from "@tanstack/react-router";
import { GithubConnectCard, GithubReadableRepos, githubInstallationsQuery } from "#/modules/github";
import { ShellPageHeader } from "#/modules/shell";
import { hasAccessPower } from "@repo/contracts/elise";

export const Route = createFileRoute("/_app/connections")({
  head: () => ({ meta: [{ title: "Connections · Elise" }] }),
  loader: ({ context }) => context.queryClient.query({ ...githubInstallationsQuery(), staleTime: "static" }),
  component: ConnectionsPage,
});

function ConnectionsPage() {
  const { user } = Route.useRouteContext();
  return (
    <>
      <ShellPageHeader title="Connections" description="Connect GitHub so Elise can list your repositories and branches when you start an audit. The Runner reads the code itself, with the git login on its computer." />
      <GithubConnectCard canConnect={hasAccessPower(user?.powers ?? [], "company:github:installations:create")} />
      <GithubReadableRepos />
    </>
  );
}
