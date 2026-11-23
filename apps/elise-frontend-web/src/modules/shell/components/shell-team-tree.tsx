import { Link } from "@tanstack/react-router";
import { Badge } from "#/components/ui/badge";
import { cn } from "#/lib/utils";
import { TREE_ITEM, TREE_ITEM_LINE, TREE_LINK } from "./shell-repo-tree";

const ACTIVE = { className: "bg-accent text-foreground" };

type ShellTeamTreeProps = {
  memberCount: number | null;
  groupCount: number | null;
};

function Count({ value }: { value: number | null }) {
  if (value === null) return null;
  return (
    <Badge variant="secondary" className="h-5 min-w-5 justify-center px-1.5 tabular-nums">
      {value}
    </Badge>
  );
}

export function ShellTeamTree({ memberCount, groupCount }: ShellTeamTreeProps) {
  return (
    <ul aria-label="Team pages" className="ml-[1.4rem] mt-0.5 grid grid-cols-[minmax(0,1fr)] pb-1">
      <li className={cn(TREE_ITEM, TREE_ITEM_LINE)}>
        <Link to="/team" className={cn(TREE_LINK, "min-h-6")} activeProps={ACTIVE}>
          <span className="min-w-0 flex-1 truncate">Members</span>
          <Count value={memberCount} />
        </Link>
      </li>
      <li className={TREE_ITEM}>
        <Link to="/groups" className={cn(TREE_LINK, "min-h-6")} activeProps={ACTIVE}>
          <span className="min-w-0 flex-1 truncate">Groups</span>
          <Count value={groupCount} />
        </Link>
      </li>
    </ul>
  );
}
