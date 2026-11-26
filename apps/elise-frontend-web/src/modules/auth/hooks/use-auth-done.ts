import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { authKeys } from "./auth-queries";

export function useAuthDone(redirectTo?: string) {
  const router = useRouter();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return {
    onSuccess: async (to?: "/two-factor-setup") => {
      queryClient.removeQueries({ queryKey: authKeys.session() });
      await router.invalidate();
      if (to) await navigate({ to });
      else if (redirectTo) await navigate({ href: redirectTo });
      else await navigate({ to: "/overview" });
    },
    onError: (error: Error) => toast.error(error.message || "Something went wrong"),
  };
}
