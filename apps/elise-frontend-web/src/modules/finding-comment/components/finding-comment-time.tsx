import { hydratedTimeZone, useHydrated } from "#/lib/use-hydrated";
import { ScanTime } from "#/modules/scan";
import { commentTimeTitle } from "../utils";

// -----
// The usual short time with the full date, time and zone as its
// tooltip. Only the Discussion uses it: ScanTime stays as it is.
// -----
export function FindingCommentTime({ value }: { value: string }) {
  const hydrated = useHydrated();
  return (
    <span title={commentTimeTitle(value, hydratedTimeZone(hydrated))}>
      <ScanTime value={value} />
    </span>
  );
}
