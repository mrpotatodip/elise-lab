import { Suspense } from "react";
import { SkeletonCard } from "#/components/ui/skeleton";
import { ShellPageHeader } from "#/modules/shell";
import { TeamGroupsCard } from "./team-groups-card";

export function GroupsPage() {
  return (
    <>
      <ShellPageHeader title="Groups" description="Sort the people on this account into teams." />
      <Suspense fallback={<SkeletonCard rows={3} />}>
        <TeamGroupsCard />
      </Suspense>
    </>
  );
}
