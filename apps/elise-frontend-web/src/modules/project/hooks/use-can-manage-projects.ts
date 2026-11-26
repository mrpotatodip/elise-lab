import { useRouteContext } from "@tanstack/react-router";
import { hasAccessPower } from "@repo/contracts/elise";

export function useCanManageProjects() {
  const { user } = useRouteContext({ from: "/_app" });
  return hasAccessPower(user?.powers ?? [], "company:repos:delete");
}
