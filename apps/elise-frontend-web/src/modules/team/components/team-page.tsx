import { Suspense } from "react";
import { ShellPageHeader } from "#/modules/shell";
import { TeamMembersCard } from "./team-members-card";
import { TeamPageSkeleton } from "./team-page-skeleton";
import { TeamSummary } from "./team-summary";

export function TeamPage({ email }: { email: string }) {
  return (
    <>
      <ShellPageHeader title="Team" description="Who can use this account, and what each person can do." />
      <Suspense fallback={<TeamPageSkeleton />}>
        <TeamSummary />
        <TeamMembersCard email={email} />
      </Suspense>
    </>
  );
}
