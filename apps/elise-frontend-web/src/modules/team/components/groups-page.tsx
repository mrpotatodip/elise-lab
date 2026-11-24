import { Suspense } from "react";
import { SkeletonCard } from "#/components/ui/skeleton";
import { ShellPageHeader } from "#/modules/shell";
import { GroupsSummary } from "./groups-summary";
import { GroupsTable } from "./groups-table";

export function GroupsPage() {
  return (
    <>
      <ShellPageHeader
        title="Groups"
        description="Sort the people on this account into teams, such as Backend or Security."
      />
      <Suspense fallback={<SkeletonCard rows={3} />}>
        <GroupsSummary />
        <GroupsTable />
      </Suspense>
    </>
  );
}
