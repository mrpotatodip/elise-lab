import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { restoreRepo } from "../api";

export function useRestoreRepo(repoId: string, name: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => restoreRepo({ data: { repoId } }),
    onSuccess: async () => {
      toast.success(`${name} is back in your list.`);
      await queryClient.invalidateQueries();
    },
    onError: (error) => toast.error(error.message),
  });
}
