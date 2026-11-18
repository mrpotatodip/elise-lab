import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { SourceRepoPanelProps } from "#/providers/port";
import { removeUploadApp } from "#/providers/upload/api";
import { UploadRemoveDialog } from "./upload-remove-dialog";
import { UploadZipList } from "./upload-zip-list";

// -----
// An upload app's own part of its Repo page: its zips, with
// upload and remove, and a way to remove the whole app. Removing
// the app deletes every zip; its audits stay, reachable from
// the Scans list.
// -----
export function UploadAppPanel({ repoId, name, onRemoved }: SourceRepoPanelProps) {
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: () => removeUploadApp({ data: { repoId } }),
    onSuccess: async () => {
      toast.success(`${name} removed. Its audits stay on the Scans page.`);
      await queryClient.invalidateQueries();
      onRemoved();
    },
    onError: (error) => toast.error(`We couldn't remove the app. ${error.message}`),
  });

  return (
    <section aria-label="Zips of this app" className="grid gap-3 rounded-xl border bg-card p-4 shadow-control">
      <UploadZipList repoId={repoId} />
      <div className="flex items-center justify-between gap-3 border-t pt-3">
        <p className="text-sm leading-relaxed text-muted-foreground">Remove the app and every zip under it. Its audits stay on the Scans page.</p>
        <UploadRemoveDialog
          trigger="Remove app"
          triggerLabel={`Remove the app ${name}`}
          title={`Remove ${name}?`}
          description="Every zip of this app is deleted from Elise for good, and the app leaves your Repos list. Its audits and their findings stay on the Scans page."
          confirm="Remove app"
          pending={remove.isPending}
          onConfirm={async () => {
            await remove.mutateAsync();
          }}
        />
      </div>
    </section>
  );
}
