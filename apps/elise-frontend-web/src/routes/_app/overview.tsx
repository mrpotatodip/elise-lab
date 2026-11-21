import { Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { GettingStartedCard } from "#/modules/getting-started";
import { RepoOverviewBrief, reposQuery } from "#/modules/repo";
import { overviewQuery, ScanOverview, ScanOverviewSkeleton, scansQuery } from "#/modules/scan";

export const Route = createFileRoute("/_app/overview")({
  head: () => ({ meta: [{ title: "Overview · Elise" }] }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.query({ ...overviewQuery(), staleTime: "static" }),
      context.queryClient.query({ ...scansQuery(), staleTime: "static" }),
      context.queryClient.query({ ...reposQuery(), staleTime: "static" }),
    ]),
  component: OverviewPage,
});

function OverviewWithRepos() {
  const { data } = useSuspenseQuery(reposQuery());
  const brief = (
    <>
      <GettingStartedCard />
      <RepoOverviewBrief repos={data.repos} />
    </>
  );
  return <ScanOverview brief={brief} />;
}

function OverviewPage() {
  return (
    <Suspense fallback={<ScanOverviewSkeleton />}>
      <OverviewWithRepos />
    </Suspense>
  );
}
