import type { ReactNode } from "react";
import { Card } from "#/components/ui/card";
import { repoName } from "#/modules/repo";
import { ScanTime } from "#/modules/scan";
import { FILE_LABELS } from "../constants";
import type { FileEntry } from "../schemas";
import { FileDownloadButton } from "./file-download-button";

type ColumnProps = { label: string; children: ReactNode };

function Column({ label, children }: ColumnProps) {
  return (
    <section aria-label={label} className="grid content-start gap-4 p-6">
      <h2 className="text-sm font-medium text-muted-foreground">{label}</h2>
      {children}
    </section>
  );
}

type FileListSummaryProps = {
  files: readonly FileEntry[];
  counts: readonly { name: FileEntry["name"]; count: number }[] | undefined;
  more: boolean;
};

export function FileListSummary({ files, counts, more }: FileListSummaryProps) {
  const names: FileEntry["name"][] = ["REPORT.md", "FINDINGS-DETAIL.md", "NEEDS-VALIDATION.md"];
  const countOf = (name: FileEntry["name"]) =>
    counts?.find((entry) => entry.name === name)?.count ?? files.filter((file) => file.name === name).length;
  const total = counts ? counts.reduce((sum, entry) => sum + entry.count, 0) : files.length;
  const newest = files[0];

  return (
    <section aria-label="Files summary">
      <Card className="grid overflow-hidden lg:grid-cols-3 lg:divide-x">
        <Column label="Files">
          <p className="text-[40px] font-semibold leading-none tracking-tight tabular-nums">
            {total}
            {more && !counts ? "+" : ""}
            <span className="ml-1.5 text-sm font-normal tracking-normal text-muted-foreground">
              {total === 1 ? "file" : "files"}
            </span>
          </p>
          <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">
            {newest ? (
              <>
                The newest was saved <ScanTime value={newest.createdAt} utc /> UTC.{" "}
              </>
            ) : (
              "A scan saves its files when it finishes. "
            )}
            Open a file's scan to read its findings.
          </p>
        </Column>

        <Column label="What is in them">
          <ul className="grid gap-3 text-sm leading-relaxed">
            {names.map((name) => (
              <li key={name} className="grid grid-cols-[1fr_auto] items-baseline gap-x-4">
                <span className="font-medium">{FILE_LABELS[name].label}</span>
                <span className="font-semibold tabular-nums">{countOf(name)}</span>
                <span className="col-span-2 text-xs leading-relaxed text-muted-foreground">
                  {FILE_LABELS[name].hint}
                </span>
              </li>
            ))}
          </ul>
        </Column>

        <Column label="Newest">
          {files.length === 0 ? (
            <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">Nothing has been saved yet.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {files.slice(0, 3).map((file) => (
                <li key={`${file.scanId}-${file.name}`} className="flex items-center justify-between gap-4 px-4 py-3">
                  <span className="grid min-w-0 gap-0.5">
                    <span className="truncate text-sm font-medium">{FILE_LABELS[file.name].label}</span>
                    <span className="truncate text-xs text-muted-foreground">{repoName(file.repo)}</span>
                  </span>
                  <FileDownloadButton
                    scanId={file.scanId}
                    name={file.name}
                    description={`${FILE_LABELS[file.name].label} of ${repoName(file.repo)}`}
                  />
                </li>
              ))}
            </ul>
          )}
        </Column>
      </Card>
    </section>
  );
}
