import { useState } from "react";
import { useRouteContext, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "#/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "#/components/ui/dialog";
import { removeRepo } from "../api";
import { useRestoreRepo } from "../hooks";
import { canRemoveRepos, repoRemoveCopy } from "../utils";

type RepoRemoveButtonProps = { repoId: string; name: string; isArchive: boolean; removedAt?: string | null };

export function RepoRemoveButton({ repoId, name, isArchive, removedAt }: RepoRemoveButtonProps) {
  const { user } = useRouteContext({ from: "/_app" });
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const remove = useMutation({
    mutationFn: () => removeRepo({ data: { repoId } }),
    onSuccess: async () => {
      toast.success(`${name} removed. Its Scans stay on the Scans page.`);
      setOpen(false);
      await queryClient.invalidateQueries();
      await navigate({ to: "/repos" });
    },
    onError: (error) => toast.error(`We couldn't remove ${name}. ${error.message}`),
  });
  const restore = useRestoreRepo(repoId, name);
  const copy = repoRemoveCopy(name, isArchive);

  if (!canRemoveRepos(user?.powers ?? [])) return null;

  if (removedAt) {
    return (
      <div className="flex items-center justify-between gap-3 border-t pt-4">
        <p className="text-sm text-muted-foreground">This Repo is removed. It is not on your list or in your counts, and its Scans stay here as History.</p>
        <Button type="button" variant="outline" disabled={restore.isPending} onClick={() => restore.mutate()}>
          {restore.isPending ? "Restoring" : "Restore"}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex justify-end border-t pt-4">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger render={<Button type="button" variant="outline" className="text-status-danger hover:text-status-danger" />}>Remove</DialogTrigger>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{copy.title}</DialogTitle>
            <DialogDescription>{copy.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Keep it</DialogClose>
            <Button type="button" variant="destructive" disabled={remove.isPending} onClick={() => remove.mutate()}>
              {remove.isPending ? "Removing" : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
