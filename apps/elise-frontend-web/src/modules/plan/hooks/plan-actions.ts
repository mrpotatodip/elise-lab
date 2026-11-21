import { useRouteContext } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { hasAccessPower } from "@repo/contracts/elise";
import { openBillingPortal, startPlanCheckout } from "../api";
import type { PlanBillingActionKind } from "../types";

export const usePlanActions = (action: PlanBillingActionKind) =>
  useMutation({
    mutationFn: () => (action === "subscribe" ? startPlanCheckout() : openBillingPortal()),
    onSuccess: ({ url }) => window.location.assign(url),
    onError: (error) => toast.error(`We couldn't open the payment page. ${error.message}`),
  });

export const useCanManagePlan = () => {
  const { user } = useRouteContext({ from: "/_app" });
  return hasAccessPower(user?.powers ?? [], "company:plan:manage");
};
