import { useRouteContext } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { hasAccessPower } from "@repo/contracts/elise";
import { runnersQuery } from "#/modules/runner";
import { scansQuery } from "#/modules/scan";
import { gettingStarted, type GettingStartedResult } from "../utils";
import { useGettingStartedFlag } from "./use-getting-started-flag";

export function useGettingStarted(): GettingStartedResult | null {
  const { user } = useRouteContext({ from: "/_app" });
  const accountId = user?.accountId ?? "";
  const canSeeRunners = !!user && hasAccessPower(user.powers, "company:runners:create");
  const { data: runners } = useQuery({ ...runnersQuery(), enabled: canSeeRunners, refetchOnWindowFocus: "always" });
  const { data: list } = useQuery({ ...scansQuery(), refetchOnWindowFocus: "always" });
  const [gitSkipped] = useGettingStartedFlag(accountId, "git-skipped");
  const [dismissed] = useGettingStartedFlag(accountId, "dismissed");

  if (!canSeeRunners || !runners || !list) return null;
  return gettingStarted({ runners, scans: list.scans, gitSkipped, dismissed });
}
