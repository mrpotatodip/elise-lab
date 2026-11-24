import { Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { prefetchScanReport, ScanDetail, ScanDetailSkeleton, scanQuery, scanRepoName } from "#/modules/scan";

export const Route = createFileRoute("/_app/scans/$scanId")({
  loader: async ({ context, params }) => {
    const scan = await context.queryClient.query({ ...scanQuery(params.scanId), staleTime: "static" });
    prefetchScanReport(context.queryClient, scan);
    const { owner, name } = scanRepoName(scan.repo, scan.scanId);
    return {
      name: owner ? `${owner}/${name}` : name,
      repoId: scan.repoId,
      branch: scan.branch ?? undefined,
      branchId: scan.branchId ?? undefined,
      commit: scan.commitSha?.slice(0, 7),
      startedAt: scan.createdAt,
    };
  },
  head: ({ loaderData }) => ({ meta: [{ title: `${loaderData?.name ?? "Scan"} report · Elise` }] }),
  component: ScanPage,
});

function ScanPage() {
  const { scanId } = Route.useParams();
  return (
    <Suspense fallback={<ScanDetailSkeleton />}>
      <ScanDetail scanId={scanId} />
    </Suspense>
  );
}
