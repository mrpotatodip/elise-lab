import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Globe, Link2, Lock, Search } from "lucide-react";
import { Input } from "#/components/ui/input";
import type { GitSourceProvider } from "#/providers/port";
import { scanRepoPickMatches, type ScanRepoPick } from "../utils";

export function ScanRepoIcon({ pick }: { pick: ScanRepoPick }) {
  const Icon = pick.fromLink ? Link2 : pick.isPrivate ? Lock : Globe;
  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
      <Icon className="size-4" />
    </span>
  );
}

type ScanNewSearchProps = {
  provider: GitSourceProvider;
  picks: readonly ScanRepoPick[];
  onPick: (pick: ScanRepoPick) => void;
  hint?: ReactNode;
};

// -----
// One field takes a name or a pasted link, so the person is never asked
// whether the repository is public or private: the list shows every
// repository the account can scan, a lock marks the private ones, and the
// choice itself says which kind it is. The arrow keys walk the field and the
// rows as one list. The field reads a link by the chosen provider's rules,
// and lists only that provider's repositories.
// -----
export function ScanNewSearch({ provider, picks, onPick, hint }: ScanNewSearchProps) {
  const [query, setQuery] = useState("");
  const wrap = useRef<HTMLDivElement>(null);
  const matches = scanRepoPickMatches(picks, query, provider.id);
  // -----
  // Only a provider that lists repositories (github) knows which are
  // private; another provider's rows claim neither.
  // -----
  const knowsPrivacy = provider.capabilities.canListRepos;
  const rows = [...matches.filter((item) => !item.isPrivate), ...matches.filter((item) => item.isPrivate)];

  const walk = (event: KeyboardEvent) => {
    const step = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
    if (step === 0) return;
    const stops = [...(wrap.current?.querySelectorAll<HTMLElement>("[data-stop]") ?? [])];
    const at = stops.findIndex((item) => item === document.activeElement);
    event.preventDefault();
    stops[Math.min(Math.max(at + step, 0), stops.length - 1)]?.focus();
  };

  return (
    <div ref={wrap} role="presentation" onKeyDown={walk} className="grid gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          data-stop
          aria-label="Find a repository"
          className="h-11 pl-9"
          placeholder={provider.address.searchPlaceholder}
          autoComplete="off"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            const first = rows[0];
            if (event.key === "Enter" && first) {
              event.preventDefault();
              onPick(first);
            }
          }}
        />
      </div>
      <div className="grid max-h-[min(24rem,50svh)] gap-0.5 overflow-y-auto">
        {rows.length === 0 && (
          <p className="px-3 py-6 text-center text-sm leading-relaxed text-muted-foreground">{query.trim() === "" ? provider.address.emptyNote : `No repository matches. ${provider.address.emptyNote}`}</p>
        )}
        {rows.map((row, index) => {
          const group = row.fromLink || !knowsPrivacy ? null : row.isPrivate ? "Private" : "Public";
          const startsGroup = group !== null && rows.slice(0, index).every((item) => item.fromLink || (item.isPrivate ? "Private" : "Public") !== group);
          return (
            <div key={row.url} className="grid gap-0.5">
              {startsGroup && <p className="px-3 pb-0.5 pt-2 text-xs text-muted-foreground">{group}</p>}
              <button
                type="button"
                data-stop
                onClick={() => onPick(row)}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ScanRepoIcon pick={row} />
                <span className="grid min-w-0 flex-1">
                  <span className="truncate text-sm font-medium">{row.fromLink ? `Scan ${row.label}` : row.label}</span>
                  <span className="truncate text-xs text-muted-foreground">{row.note}</span>
                </span>
                {knowsPrivacy && <span className="text-xs text-muted-foreground">{row.isPrivate ? "Private" : "Public"}</span>}
              </button>
            </div>
          );
        })}
      </div>
      {hint}
    </div>
  );
}
