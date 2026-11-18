import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileArchive, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  UPLOAD_ARCHIVE_MAX_MB,
  UPLOAD_ARCHIVE_RETENTION_DAYS,
  UPLOAD_ARCHIVES_PER_APP_MAX,
  UPLOAD_FILES_MAX,
  UPLOAD_PATH_DEPTH_MAX,
  UPLOAD_STORAGE_PER_TENANT_MAX_MB,
  UPLOAD_UNPACKED_MAX_MB,
} from "@repo/contracts/elise";
import { Alert, AlertDescription } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import { Skeleton } from "#/components/ui/skeleton";
import { cn } from "#/lib/utils";
import { removeUploadArchive, uploadArchive } from "#/providers/upload/api";
import { uploadArchivesQuery, uploadKeys } from "#/providers/upload/hooks";
import type { UploadArchive } from "#/providers/upload/schemas";
import { uploadRefusalOf } from "#/providers/upload/utils";
import { UploadRemoveDialog } from "./upload-remove-dialog";

const MB = 1024 * 1024;

const sizeOf = (bytes: number) => (bytes < MB ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / MB).toFixed(1)} MB`);

const dayOf = (iso: string) => new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

export const UPLOAD_LIMITS_NOTE = `A zip can be up to ${UPLOAD_ARCHIVE_MAX_MB} MB, and unpack to at most ${UPLOAD_UNPACKED_MAX_MB} MB, ${UPLOAD_FILES_MAX.toLocaleString("en-US")} files and ${UPLOAD_PATH_DEPTH_MAX} folder levels. An app holds up to ${UPLOAD_ARCHIVES_PER_APP_MAX} zips, and your account up to ${UPLOAD_STORAGE_PER_TENANT_MAX_MB} MB of them.`;

export const UPLOAD_RETENTION_NOTE = `A zip that no audit has read is deleted ${UPLOAD_ARCHIVE_RETENTION_DAYS} days after you upload it.`;

type UploadZipListProps = {
  repoId: string;
  selectedId?: string | null;
  onSelect?: (archive: UploadArchive) => void;
};

// -----
// The zips of one upload app, newest first as the engine sends
// them: upload one, remove one, and (in the new-scan form) pick
// the one a Scan reads. A zip over a limit is refused here,
// before it is sent, with the limit it broke.
// -----
export function UploadZipList({ repoId, selectedId, onSelect }: UploadZipListProps) {
  const { data, isPending, isError } = useQuery(uploadArchivesQuery(repoId));
  const archives = data?.archives ?? [];
  const [problem, setProblem] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const upload = useMutation({
    mutationFn: (form: FormData) => uploadArchive({ data: form }),
    onSuccess: async (archive) => {
      toast.success(`${archive.label} uploaded.`);
      await queryClient.invalidateQueries({ queryKey: uploadKeys.archives(repoId) });
      onSelect?.(archive);
    },
    onError: (error) => setProblem(error.message),
  });

  const remove = useMutation({
    mutationFn: (archiveId: string) => removeUploadArchive({ data: { repoId, archiveId } }),
    onSuccess: async () => {
      toast.success("Zip removed. The audits that read it stay in the History.");
      await queryClient.invalidateQueries({ queryKey: uploadKeys.archives(repoId) });
    },
    onError: (error) => toast.error(`We couldn't remove the zip. ${error.message}`),
  });

  const send = async (file: File) => {
    setProblem(null);
    setChecking(true);
    const readable = file.size <= UPLOAD_ARCHIVE_MAX_MB * MB && file.name.toLowerCase().endsWith(".zip");
    const bytes = readable ? new Uint8Array(await file.arrayBuffer()) : new Uint8Array();
    setChecking(false);
    const refusal = uploadRefusalOf({ name: file.name, sizeBytes: file.size, bytes, zipsInApp: archives.length });
    if (refusal !== null) {
      setProblem(refusal);
      return;
    }
    const form = new FormData();
    form.set("repoId", repoId);
    form.set("file", file);
    upload.mutate(form);
  };

  const busy = checking || upload.isPending;

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">
          Zips <span className="font-normal text-muted-foreground">({archives.length} of {UPLOAD_ARCHIVES_PER_APP_MAX})</span>
        </span>
        <input
          ref={input}
          type="file"
          accept=".zip,application/zip"
          className="sr-only"
          aria-label="Choose a zip to upload"
          tabIndex={-1}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void send(file);
          }}
        />
        <Button type="button" variant="outline" size="sm" disabled={busy || isPending} onClick={() => input.current?.click()}>
          <Upload aria-hidden="true" className="size-4" />
          {checking ? "Checking…" : upload.isPending ? "Uploading…" : "Upload a zip"}
        </Button>
      </div>

      {problem !== null && (
        <Alert variant="destructive">
          <AlertDescription>{problem}</AlertDescription>
        </Alert>
      )}

      {isPending ? (
        <Skeleton className="h-12 w-full" />
      ) : isError ? (
        <Alert variant="destructive">
          <AlertDescription>We couldn&apos;t load the zips of this app.</AlertDescription>
        </Alert>
      ) : archives.length === 0 ? (
        <p className="rounded-md border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">No zips yet. Upload a zip of your source code to scan it.</p>
      ) : (
        <ul className="grid gap-1.5">
          {archives.map((archive) => {
            const selected = archive.id === selectedId;
            const details = `${sizeOf(archive.sizeBytes)} · uploaded ${dayOf(archive.uploadedAt)} · ${archive.contentSha256.slice(0, 7)}`;
            return (
              <li key={archive.id} className={cn("flex items-center gap-2 rounded-md border bg-card px-2 py-1.5", selected && "border-primary ring-1 ring-primary")}>
                {onSelect ? (
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onSelect(archive)}
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <FileArchive aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                    <span className="grid min-w-0">
                      <span className="truncate text-sm font-medium">{archive.label}</span>
                      <span className="truncate text-xs text-muted-foreground">{details}</span>
                    </span>
                  </button>
                ) : (
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <FileArchive aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                    <span className="grid min-w-0">
                      <span className="truncate text-sm font-medium">{archive.label}</span>
                      <span className="truncate text-xs text-muted-foreground">{details}</span>
                    </span>
                  </span>
                )}
                <UploadRemoveDialog
                  trigger="Remove"
                  triggerLabel={`Remove ${archive.label}`}
                  title="Remove this zip?"
                  description={`${archive.label} is deleted from Elise for good. The audits that read it stay in the History, marked "file removed".`}
                  confirm="Remove zip"
                  pending={remove.isPending}
                  onConfirm={async () => {
                    await remove.mutateAsync(archive.id);
                  }}
                />
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-xs leading-relaxed text-muted-foreground">
        {UPLOAD_LIMITS_NOTE} {UPLOAD_RETENTION_NOTE}
      </p>
    </div>
  );
}
