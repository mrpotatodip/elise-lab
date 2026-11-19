import { Suspense } from "react";
import { SkeletonCard } from "#/components/ui/skeleton";
import { ShellPageHeader } from "#/modules/shell";
import { GroupsTable } from "./groups-table";

export function GroupsPage() {
  return (
    <>
      <ShellPageHeader title="Groups" description="Sort the people on this account into teams." />
      <Suspense fallback={<SkeletonCard rows={3} />}>
        <GroupsTable />
      </Suspense>
    </>
  );
}
