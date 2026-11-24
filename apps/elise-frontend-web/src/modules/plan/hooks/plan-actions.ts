import { useRouteContext } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { hasAccessPower, type PlanChangeBody, type PlanCheckoutBody } from "@repo/contracts/elise";
import { changePlan, openBillingPortal, startPlanCheckout } from "../api";

const redirect = {
  onSuccess: ({ url }: { url: string }) => window.location.assign(url),
  onError: (error: Error) => toast.error(`We couldn't open the payment page. ${error.message}`),
};

export const usePlanActions = () => ({
  checkout: useMutation({
    mutationFn: (body: PlanCheckoutBody) => startPlanCheckout({ data: body }),
    onSuccess: redirect.onSuccess,
  }),
  portal: useMutation({ mutationFn: () => openBillingPortal(), ...redirect }),
  change: useMutation({ mutationFn: (body: PlanChangeBody) => changePlan({ data: body }) }),
});

export const useCanManagePlan = () => {
  const { user } = useRouteContext({ from: "/_app" });
  return hasAccessPower(user?.powers ?? [], "company:plan:manage");
};
