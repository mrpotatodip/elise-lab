import { useRouteContext } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { hasAccessPower } from "@repo/contracts/elise";
import { changePlan, openBillingPortal, startPlanCheckout } from "../api";

export const usePlanCheckout = () =>
  useMutation({
    mutationFn: (planKey: string) => startPlanCheckout({ data: { planKey } }),
    onSuccess: ({ url }) => window.location.assign(url),
    onError: (error) => toast.error(`We couldn't open the payment page. ${error.message}`),
  });

export const useBillingPortal = () =>
  useMutation({
    mutationFn: () => openBillingPortal(),
    onSuccess: ({ url }) => window.location.assign(url),
    onError: (error) => toast.error(`We couldn't open the payment page. ${error.message}`),
  });

export const usePlanChange = () => useMutation({ mutationFn: (planKey: string) => changePlan({ data: { planKey } }) });

export const useCanManagePlan = () => {
  const { user } = useRouteContext({ from: "/_app" });
  return hasAccessPower(user?.powers ?? [], "company:plan:manage");
};
