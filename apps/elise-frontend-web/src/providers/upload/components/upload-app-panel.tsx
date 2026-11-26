import type { SourceRepoPanelProps } from "#/providers/port";
import { UploadZipList } from "./upload-zip-list";

// -----
// An upload app's own part of its Repo page: its zips, with
// upload and remove. Removing the app is the Repo page's own
// Remove button.
// -----
export function UploadAppPanel({ repoId }: SourceRepoPanelProps) {
  return (
    <section aria-label="Zips of this app" className="grid gap-3 rounded-xl border bg-card p-4 shadow-control">
      <UploadZipList repoId={repoId} />
    </section>
  );
}
