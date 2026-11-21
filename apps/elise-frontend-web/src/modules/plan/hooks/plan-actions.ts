import { useRouteContext } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { hasAccessPower } from "@repo/contracts/elise";
import { changePlan, openBillingPortal, startPlanCheckout } from "../api";

const redirect = {
  onSuccess: ({ url }: { url: string }) => window.location.assign(url),
  onError: (error: Error) => toast.error(`We couldn't open the payment page. ${error.message}`),
};

export const usePlanActions = () => ({
  checkout: useMutation({ mutationFn: (planKey: string) => startPlanCheckout({ data: { planKey } }), ...redirect }),
  portal: useMutation({ mutationFn: () => openBillingPortal(), ...redirect }),
  change: useMutation({ mutationFn: (planKey: string) => changePlan({ data: { planKey } }) }),
});

export const useCanManagePlan = () => {
  const { user } = useRouteContext({ from: "/_app" });
  return hasAccessPower(user?.powers ?? [], "company:plan:manage");
};
