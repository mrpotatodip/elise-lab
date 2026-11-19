import { Suspense } from "react";
import { ShellPageHeader } from "#/modules/shell";
import { TeamGroupsCard } from "./team-groups-card";
import { TeamMembersCard } from "./team-members-card";
import { TeamPageSkeleton } from "./team-page-skeleton";
import { TeamSummary } from "./team-summary";

export function TeamPage({ email }: { email: string }) {
  return (
    <>
      <ShellPageHeader title="Team" description="Who can use this account, and how they are grouped." />
      <Suspense fallback={<TeamPageSkeleton />}>
        <TeamSummary />
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-8">
          <TeamMembersCard email={email} />
          <TeamGroupsCard />
        </div>
      </Suspense>
    </>
  );
}
