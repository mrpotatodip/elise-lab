import { Info } from "lucide-react";
import { Alert, AlertDescription } from "#/components/ui/alert";
import { REPO_HISTORY_NOTE } from "../constants";

// -----
// Shown wherever an open count from the findings history is shown. A
// person who cannot decide on a problem (a watcher on Security status)
// is not told they can, so the last sentence is the caller's choice.
// -----
export function RepoHistoryNote({ byHand = false }: { byHand?: boolean }) {
  return (
    <Alert variant="info">
      <Info />
      <div className="grid gap-1">
        <AlertDescription className="font-medium">{REPO_HISTORY_NOTE.title}</AlertDescription>
        <AlertDescription>
          {REPO_HISTORY_NOTE.body}
          {byHand ? ` ${REPO_HISTORY_NOTE.byHand}` : ""}
        </AlertDescription>
      </div>
    </Alert>
  );
}
