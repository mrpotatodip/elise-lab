import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "#/components/ui/button";
import { FieldError } from "#/components/ui/field-error";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Skeleton } from "#/components/ui/skeleton";
import type { SourceArchivePickerProps } from "#/providers/port";
import { createUploadApp } from "#/providers/upload/api";
import { uploadAppsQuery } from "#/providers/upload/hooks";
import { CreateUploadAppInputSchema, type UploadArchive } from "#/providers/upload/schemas";
import { UploadZipList } from "./upload-zip-list";

const NEW_APP = "new";

// -----
// The upload provider's part of a new scan: pick an app or name
// a new one, upload zips under it, and choose the one zip the
// Scan reads. The form gets the app and the zip's id.
// -----
export function UploadScanPicker({ startRepoId, onPick }: SourceArchivePickerProps) {
  const { data: apps, isPending } = useQuery(uploadAppsQuery());
  const [appId, setAppId] = useState<string | null>(startRepoId ?? null);
  const [name, setName] = useState("");
  const [nameProblem, setNameProblem] = useState<string | null>(null);
  const [zip, setZip] = useState<UploadArchive | null>(null);
  const queryClient = useQueryClient();
  const current = apps?.find((app) => app.id === appId) ?? apps?.[0];
  const creating = appId === NEW_APP || (apps !== undefined && apps.length === 0);

  const create = useMutation({
    mutationFn: (appName: string) => createUploadApp({ data: { name: appName } }),
    onSuccess: async (app) => {
      await queryClient.invalidateQueries();
      setAppId(app.id);
      setName("");
      setZip(null);
    },
    onError: (error) => setNameProblem(error.message),
  });

  const submitName = () => {
    const parsed = CreateUploadAppInputSchema.safeParse({ name });
    if (!parsed.success) {
      setNameProblem(parsed.error.issues[0]?.message ?? "Check the name.");
      return;
    }
    const taken = apps?.find((app) => app.canonical === parsed.data.name.toLowerCase());
    if (taken !== undefined) {
      setNameProblem(`You already have an app named ${taken.url}. Pick it from the list, or choose another name.`);
      return;
    }
    setNameProblem(null);
    create.mutate(parsed.data.name);
  };

  if (isPending) return <Skeleton className="h-24 w-full" />;

  return (
    <div className="grid gap-4">
      <p className="px-1 text-sm leading-relaxed text-muted-foreground">
        Upload a zip of your source code under an app, and pick one zip for each audit. All the zips of an app share one
        History, so you can follow a problem from one version to the next. An upload audit runs on one of your Runners.
      </p>

      {apps !== undefined && apps.length > 0 && (
        <div className="grid gap-1.5">
          <Label htmlFor="upload-app">App</Label>
          <Select
            value={creating ? NEW_APP : (current?.id ?? NEW_APP)}
            items={[...apps.map((app) => ({ value: app.id, label: app.url })), { value: NEW_APP, label: "New app…" }]}
            onValueChange={(next) => {
              if (next === null) return;
              setAppId(next);
              setZip(null);
            }}
          >
            <SelectTrigger id="upload-app" className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {apps.map((app) => (
                <SelectItem key={app.id} value={app.id}>
                  {app.url}
                </SelectItem>
              ))}
              <SelectItem value={NEW_APP}>New app…</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {creating ? (
        <div className="grid gap-1.5">
          <Label htmlFor="upload-app-name">Name of the new app</Label>
          <div className="flex gap-2">
            <Input
              id="upload-app-name"
              value={name}
              autoComplete="off"
              placeholder="Billing API"
              aria-invalid={nameProblem !== null}
              aria-describedby={nameProblem === null ? "upload-app-name-help" : "upload-app-name-error"}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                submitName();
              }}
            />
            <Button type="button" disabled={create.isPending || name.trim() === ""} onClick={submitName}>
              {create.isPending ? "Creating…" : "Create app"}
            </Button>
          </div>
          {nameProblem === null ? (
            <p id="upload-app-name-help" className="text-sm leading-relaxed text-muted-foreground">
              A name is unique in your account, whatever its case.
            </p>
          ) : (
            <FieldError id="upload-app-name" message={nameProblem} />
          )}
        </div>
      ) : (
        current !== undefined && (
          <>
            <UploadZipList key={current.id} repoId={current.id} selectedId={zip?.id ?? null} onSelect={setZip} />
            <div className="flex justify-end">
              <Button
                type="button"
                disabled={zip === null}
                onClick={() => {
                  if (zip !== null)
                    onPick({
                      repo: current.url,
                      repoId: current.id,
                      appName: current.url,
                      archiveId: zip.id,
                      archiveLabel: zip.label,
                    });
                }}
              >
                {zip === null ? "Pick a zip to scan" : `Scan ${zip.label}`}
              </Button>
            </div>
          </>
        )
      )}
    </div>
  );
}
