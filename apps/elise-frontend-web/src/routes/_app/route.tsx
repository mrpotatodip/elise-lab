import { createFileRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useNow } from "#/lib/use-now";
import { gettingStarted, useGettingStartedFlag } from "#/modules/getting-started";
import { runnerShownState, runnersQuery } from "#/modules/runner";
import { ScanNewDialog, scansQuery, scanSidebarItems } from "#/modules/scan";
import { hasAccessPower, isWatcher } from "@repo/contracts/elise";
import { ShellFrame } from "#/modules/shell";
import { groupsQuery, teamQuery } from "#/modules/team";

export const Route = createFileRoute("/_app")({
  beforeLoad: ({ context, location }) => {
    if (!context.user) throw redirect({ to: "/signin" });
    if (context.user.twoFactorSetupRequired) throw redirect({ to: "/two-factor-setup" });
    if (isWatcher(context.user.powers) && !location.pathname.startsWith("/summary")) throw redirect({ to: "/summary" });
  },
  loader: ({ context }) => {
    const powers = context.user?.powers ?? [];
    if (isWatcher(powers)) return null;
    return Promise.all([
      context.queryClient.query({ ...scansQuery(), staleTime: "static" }),
      hasAccessPower(powers, "company:runners:create")
        ? context.queryClient.query({ ...runnersQuery(), staleTime: "static" })
        : null,
    ]);
  },
  component: AppLayout,
});

function AppLayout() {
  const { user } = Route.useRouteContext();
  const showDashboard = !isWatcher(user?.powers ?? []);
  const { data } = useQuery({ ...scansQuery(), enabled: showDashboard });
  const { repos, repoCount, running, total } = scanSidebarItems(data?.scans ?? []);
  const showTeam = hasAccessPower(user?.powers ?? [], "company:team:members:read");
  const { data: team } = useQuery({ ...teamQuery(), enabled: showTeam });
  const { data: groups } = useQuery({ ...groupsQuery(), enabled: showTeam });
  const showRunners = showDashboard && hasAccessPower(user?.powers ?? [], "company:runners:create");
  const { data: runners } = useQuery({ ...runnersQuery(), enabled: showRunners });
  const now = useNow();
  const pairedRunners = (runners ?? []).filter((runner) => runner.state === "connected");
  const runnersRunning = pairedRunners.filter((runner) => runnerShownState(runner, now) === "connected").length;
  const [gitSkipped] = useGettingStartedFlag(user?.accountId ?? "", "git-skipped");
  const [, setDismissed] = useGettingStartedFlag(user?.accountId ?? "", "dismissed");
  const showGettingStarted =
    showRunners &&
    !!runners &&
    !!data &&
    gettingStarted({ runners, scans: data.scans, gitSkipped, dismissed: false }).show;
  const pageHasOwnScanButton = useRouterState({
    select: (state) => state.location.pathname.startsWith("/repos/") || state.location.pathname.startsWith("/scans/"),
  });

  return (
    <ShellFrame
      accountName={user?.accountName ?? ""}
      userName={user?.name ?? ""}
      email={user?.email ?? ""}
      scanCount={total}
      running={running}
      repos={repos}
      repoCount={repoCount}
      showTeam={showTeam}
      memberCount={team?.members.length ?? null}
      groupCount={groups?.length ?? null}
      showRunners={showRunners}
      showPlan={showDashboard && hasAccessPower(user?.powers ?? [], "company:plan:read")}
      showSignals={showDashboard && hasAccessPower(user?.powers ?? [], "company:signals:update")}
      runnersPaired={pairedRunners.length}
      runnersRunning={runnersRunning}
      showDashboard={showDashboard}
      showGettingStarted={showGettingStarted}
      onReopenGettingStarted={() => setDismissed(false)}
      actions={showDashboard ? <ScanNewDialog variant={pageHasOwnScanButton ? "outline" : "default"} /> : undefined}
    >
      <Outlet />
    </ShellFrame>
  );
}
