import { Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { hasAccessPower } from "@repo/contracts/elise";
import { creditQuery } from "#/modules/credit";
import { RepoOverviewBrief, reposQuery } from "#/modules/repo";
import { overviewQuery, ScanOverview, ScanOverviewSkeleton, scansQuery } from "#/modules/scan";
import { usageQuery } from "#/modules/usage";

export const Route = createFileRoute("/_app/overview")({
  head: () => ({ meta: [{ title: "Overview · Elise" }] }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.query({ ...overviewQuery(), staleTime: "static" }),
      context.queryClient.query({ ...scansQuery(), staleTime: "static" }),
      context.queryClient.query({ ...usageQuery(), staleTime: "static" }),
      context.queryClient.query({ ...creditQuery(), staleTime: "static" }),
      context.queryClient.query({ ...reposQuery(), staleTime: "static" }),
    ]),
  component: OverviewPage,
});

function OverviewWithRepos() {
  const { data } = useSuspenseQuery(reposQuery());
  const { data: usage } = useSuspenseQuery(usageQuery());
  const { user } = Route.useRouteContext();
  const canManageBudget = hasAccessPower(user?.powers ?? [], "company:usage:budget:update");
  return <ScanOverview brief={<RepoOverviewBrief repos={data.repos} budget={usage} canManageBudget={canManageBudget} />} />;
}

function OverviewPage() {
  return (
    <Suspense fallback={<ScanOverviewSkeleton />}>
      <OverviewWithRepos />
    </Suspense>
  );
}
