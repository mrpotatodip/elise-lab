import { CircleAlert } from "lucide-react";
import { Badge } from "#/components/ui/badge";
import type { ScanStatus } from "../schemas";
import { scanProfileNote } from "../utils";

export function ScanProfileBadge({ scan }: { scan: Pick<ScanStatus, "status" | "profile" | "profileMet"> }) {
  const note = scan.status === "succeeded" ? scanProfileNote(scan.profile, scan.profileMet) : null;
  if (!note) return null;

  return (
    <Badge variant="warning" title={`${note.title} ${note.detail}`}>
      <CircleAlert aria-hidden="true" className="size-3" />
      {note.badge}
    </Badge>
  );
}
