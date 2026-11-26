import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useSuspenseQueries } from "@tanstack/react-query";
import { buttonVariants } from "#/components/ui/button";
import { Card } from "#/components/ui/card";
import { Progress } from "#/components/ui/progress";
import { groupsQuery, teamQuery } from "../hooks";
import { NewGroupDialog } from "./groups-table";

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

const people = (count: number) => `${count} ${count === 1 ? "person" : "people"}`;

export function GroupsSummary() {
  const [{ data: groups }, { data: team }] = useSuspenseQueries({ queries: [groupsQuery(), teamQuery()] });

  const everyone = team.members.length;
  const ungrouped = team.members.filter((member) => !groups.some((group) => group.memberIds.includes(member.partyId)));
  const grouped = everyone - ungrouped.length;
  const percent = everyone > 0 ? Math.round((grouped / everyone) * 100) : 0;
  const bySize = groups.toSorted((a, b) => b.memberIds.length - a.memberIds.length);

  return (
    <section aria-label="Groups summary">
      <Card className="grid overflow-hidden lg:grid-cols-3 lg:divide-x">
        <Column label="Groups" footer={<NewGroupDialog />}>
          <p className="text-[40px] font-semibold leading-none tracking-tight tabular-nums">
            {groups.length}
            <span className="ml-1.5 text-sm font-normal tracking-normal text-muted-foreground">
              {groups.length === 1 ? "group" : "groups"}
            </span>
          </p>
          <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">
            A group sorts people into a team. It grants nothing: what a person can do comes from their role.
          </p>
        </Column>

        <Column
          label="Coverage"
          footer={
            <Link to="/team" className={ACTION}>
              Manage the team
            </Link>
          }
        >
          <p className="text-[40px] font-semibold leading-none tracking-tight tabular-nums">
            {grouped}
            <span className="ml-1.5 text-sm font-normal tracking-normal text-muted-foreground">
              of {everyone} in a group
            </span>
          </p>
          <Progress
            value={percent}
            indicatorClassName="bg-primary/55"
            aria-label={`In a group: ${grouped} of ${everyone}`}
          />
          <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">
            {ungrouped.length === 0
              ? "Everyone belongs to at least one group."
              : `Not in any group yet: ${ungrouped.map((member) => member.name).join(", ")}.`}
          </p>
        </Column>

        <Column label="Sizes">
          {bySize.length === 0 ? (
            <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">
              No groups yet. Create one to see its size here.
            </p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {bySize.map((group) => (
                <li key={group.id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <span className="truncate text-sm font-medium">{group.name}</span>
                  <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                    {people(group.memberIds.length)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Column>
      </Card>
    </section>
  );
}
