import { Suspense, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { buttonVariants } from "#/components/ui/button";
import { Card } from "#/components/ui/card";
import { Progress } from "#/components/ui/progress";
import { Skeleton } from "#/components/ui/skeleton";
import { planQuery } from "#/modules/plan";
import { groupsQuery, teamQuery, teamRolesQuery } from "../hooks";
import { teamRoleLabel } from "../utils";
import { TeamInviteDialog } from "./team-invite-dialog";

const ACTION = buttonVariants({ variant: "outline", size: "sm" });

type ColumnProps = { label: string; footer?: ReactNode; children: ReactNode };

function Column({ label, footer, children }: ColumnProps) {
  return (
    <section aria-label={label} className="grid grid-rows-[auto_1fr_auto] gap-4 p-6">
      <h2 className="text-sm font-medium text-muted-foreground">{label}</h2>
      <div className="grid content-start gap-4">{children}</div>
      {footer}
    </section>
  );
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export function TeamSummary() {
  const { data: team } = useSuspenseQuery(teamQuery());
  const { data: groups } = useSuspenseQuery(groupsQuery());
  const { data: roles } = useSuspenseQuery(teamRolesQuery());
  const { data: plan } = useQuery(planQuery());

  const waiting = team.invites.length;
  const people = team.members.length + waiting;
  const maxMembers = plan?.plan?.maxMembers ?? null;
  const percent = maxMembers !== null && maxMembers > 0 ? Math.min(100, Math.round((people / maxMembers) * 100)) : 0;
  const grouped = team.members.filter((member) => groups.some((group) => group.memberIds.includes(member.partyId))).length;
  const heldOnly = team.members
    .filter((member) => !roles.some((role) => role.key === member.role))
    .filter((member, index, all) => all.findIndex((other) => other.role === member.role) === index)
    .map((member) => ({ key: member.role, label: member.roleLabel, description: null }));
  const shownRoles = [...roles, ...heldOnly];
  const holders = (key: string) => team.members.filter((member) => member.role === key).length + team.invites.filter((invite) => invite.role === key).length;

  return (
    <section aria-label="Team summary">
      <Card className="grid overflow-hidden lg:grid-cols-3 lg:divide-x">
        <Column
          label="People"
          footer={
            <Suspense fallback={<Skeleton className="h-8 w-full" />}>
              <TeamInviteDialog />
            </Suspense>
          }
        >
          <p className="text-[40px] font-semibold leading-none tracking-tight tabular-nums">
            {people}
            {maxMembers !== null && <span className="ml-1.5 text-sm font-normal tracking-normal text-muted-foreground">of {maxMembers}</span>}
          </p>
          {maxMembers !== null && <Progress value={percent} indicatorClassName="bg-primary/55" aria-label={`People: ${people} of ${maxMembers}`} />}
          <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">
            {waiting > 0 ? `${plural(waiting, "invite is", "invites are")} still waiting to be accepted. ` : ""}
            {maxMembers !== null && people >= maxMembers ? "The plan is full: remove someone or contact us to add seats." : "Everyone here shares the same reports and findings."}
          </p>
        </Column>

        <Column label="Roles">
          <ul className="divide-y rounded-lg border">
            {shownRoles.map((role) => (
              <li key={role.key} className="flex items-start justify-between gap-4 px-4 py-3">
                <span className="grid min-w-0 gap-0.5">
                  <span className="text-sm font-medium">{teamRoleLabel(role.key, role.label)}</span>
                  {role.description !== null && <span className="text-xs leading-relaxed text-muted-foreground">{role.description}</span>}
                </span>
                <span className="shrink-0 text-sm tabular-nums text-muted-foreground">{holders(role.key)}</span>
              </li>
            ))}
          </ul>
        </Column>

        <Column
          label="Groups"
          footer={
            <Link to="/groups" className={ACTION}>
              Manage groups
            </Link>
          }
        >
          <p className="text-[40px] font-semibold leading-none tracking-tight tabular-nums">
            {groups.length}
            <span className="ml-1.5 text-sm font-normal tracking-normal text-muted-foreground">{groups.length === 1 ? "group" : "groups"}</span>
          </p>
          <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">
            {groups.length === 0 ? "Name a group to sort people into teams." : `${grouped} of ${plural(team.members.length, "person", "people")} ${grouped === 1 ? "belongs" : "belong"} to a group.`}
          </p>
        </Column>
      </Card>
    </section>
  );
}
