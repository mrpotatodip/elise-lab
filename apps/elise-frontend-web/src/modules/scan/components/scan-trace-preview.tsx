import { useState } from "react";
import { Button } from "#/components/ui/button";
import { TRACE_QUIET_MS } from "../constants";
import { useNow } from "../hooks";
import { FAKE_TRACE_TOTAL_MS, fakeTraceAt } from "../utils";
import { TraceShell, TraceView } from "./scan-trace";

const SCENARIOS = [
  { key: "live", label: "Running (moves)", active: true },
  { key: "quiet", label: "Running, quiet 4 min", active: true },
  { key: "start", label: "Running, no entries yet", active: true },
  { key: "finished", label: "Finished", active: false },
  { key: "failed", label: "Failed mid-run", active: false },
  { key: "old", label: "Old Scan, no entries", active: false },
] as const;

type ScenarioKey = (typeof SCENARIOS)[number]["key"];

const FIVE_MINUTES = 5 * 60 * 1000;

function PreviewBody({ scenario }: { scenario: ScenarioKey }) {
  const browserNow = useNow();
  const [mountedAt] = useState(() => Date.now());
  const [speed, setSpeed] = useState(1);
  const active = SCENARIOS.find((item) => item.key === scenario)?.active ?? false;
  const startedAt = mountedAt - FIVE_MINUTES;

  const elapsed = {
    live: FIVE_MINUTES + (browserNow - mountedAt) * speed,
    quiet: FIVE_MINUTES,
    start: -1,
    finished: FAKE_TRACE_TOTAL_MS,
    failed: FAKE_TRACE_TOTAL_MS * 0.55,
    old: -1,
  }[scenario];
  const now = scenario === "quiet" ? startedAt + elapsed + TRACE_QUIET_MS + 60_000 : scenario === "finished" || scenario === "failed" ? startedAt + elapsed + 90_000 : startedAt + elapsed;
  const entries = elapsed < 0 ? [] : fakeTraceAt(elapsed, startedAt);

  return (
    <div className="grid gap-4">
      {scenario === "live" && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          Speed
          {[1, 5, 20].map((value) => (
            <Button key={value} size="sm" variant={speed === value ? "default" : "outline"} onClick={() => setSpeed(value)}>
              {value}x
            </Button>
          ))}
        </div>
      )}
      <TraceShell active={active}>
        <TraceView
          entries={entries}
          candidateFindings={entries.length > 40 ? Math.floor(entries.length / 9) : null}
          now={scenario === "live" ? browserNow + (startedAt + elapsed - browserNow) : now}
          active={active}
          quiet={scenario === "quiet"}
          empty={<p>{active ? "Waiting for the first entries." : "Live detail needs a newer Runner."}</p>}
        />
      </TraceShell>
    </div>
  );
}

// -----
// A dev-only page for designing the Trace panel on made-up data: pick a
// state and the real panel renders it. No Scan, Runner or engine involved.
// -----
export function ScanTracePreview() {
  const [scenario, setScenario] = useState<ScenarioKey>("live");
  return (
    <main className="mx-auto grid max-w-3xl gap-6 p-6">
      <header className="grid gap-3">
        <h1 className="text-xl font-semibold">Trace panel preview</h1>
        <div className="flex flex-wrap gap-2">
          {SCENARIOS.map((item) => (
            <Button key={item.key} size="sm" variant={scenario === item.key ? "default" : "outline"} onClick={() => setScenario(item.key)}>
              {item.label}
            </Button>
          ))}
        </div>
      </header>
      <PreviewBody key={scenario} scenario={scenario} />
    </main>
  );
}
