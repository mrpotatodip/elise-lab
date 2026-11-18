type FindingLocationProps = {
  file: string | null;
  line: number | null;
};

// -----
// The file name and line lead on one line; the folder sits under it, cut
// from the start so its last folders stay visible. The full path is the
// tooltip, so a deep path never stretches the row.
// -----
export function FindingLocation({ file, line }: FindingLocationProps) {
  if (!file) return <span className="text-muted-foreground">-</span>;
  const slash = file.lastIndexOf("/");
  const name = file.slice(slash + 1);
  const folder = slash > 0 ? file.slice(0, slash) : "";
  const full = line ? `${file}:${line}` : file;
  return (
    <span title={full} className="grid w-44 gap-0.5 font-mono text-xs">
      <span aria-hidden="true" className="truncate text-foreground">
        {name}
        {line ? `:${line}` : null}
      </span>
      {folder && (
        <span aria-hidden="true" className="truncate text-left text-muted-foreground [direction:rtl]">
          <bdi>{folder}</bdi>
        </span>
      )}
      <span className="sr-only">{full}</span>
    </span>
  );
}
