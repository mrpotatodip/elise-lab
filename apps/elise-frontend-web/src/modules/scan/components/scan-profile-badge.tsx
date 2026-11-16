import { CircleAlert } from "lucide-react";
import { Badge } from "#/components/ui/badge";
import type { ScanStatus } from "../schemas";
import { scanProfileNote } from "../utils";

// -----
// Marks a Scan that ran as less than it asked for, or as nothing it asked
// for, so the list tells it from a full one at a glance. It carries an icon
// and words, not colour alone. A Scan that met its profile, or that was not
// checked, shows nothing.
// -----
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
