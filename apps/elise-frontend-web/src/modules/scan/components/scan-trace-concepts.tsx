import { useState } from "react";
import { Button } from "#/components/ui/button";
import { useNow } from "../hooks";
import { fakeTraceAt } from "../utils";
import { TraceShell } from "./scan-trace";
import { ConceptConsole } from "./trace-concepts/concept-console";
import { ConceptPulse } from "./trace-concepts/concept-pulse";
import { ConceptTimeline } from "./trace-concepts/concept-timeline";

const CONCEPTS = [
  { name: "Timeline", Concept: ConceptTimeline },
  { name: "Pulse", Concept: ConceptPulse },
  { name: "Console", Concept: ConceptConsole },
];

const FIVE_MINUTES = 5 * 60 * 1000;

const PICKER_CSS = `
.proto-picker{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:2147483647;display:flex;align-items:center;gap:2px;padding:4px;border-radius:999px;background:rgba(10,10,10,.82);-webkit-backdrop-filter:blur(12px) saturate(1.4);backdrop-filter:blur(12px) saturate(1.4);box-shadow:0 0 0 1px rgba(255,255,255,.08) inset,0 8px 24px rgba(0,0,0,.24),0 2px 6px rgba(0,0,0,.12);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:13px;line-height:1;-webkit-font-smoothing:antialiased;user-select:none;-webkit-user-select:none}
.proto-picker-highlight{position:absolute;top:4px;left:0;height:28px;border-radius:999px;background:rgba(255,255,255,.12);will-change:transform}
.proto-picker[data-ready] .proto-picker-highlight{transition:transform 250ms cubic-bezier(.23,1,.32,1),width 250ms cubic-bezier(.23,1,.32,1)}
@media (prefers-reduced-motion:reduce){.proto-picker[data-ready] .proto-picker-highlight{transition:none}}
.proto-picker-item{position:relative;display:flex;align-items:center;height:28px;padding:0 12px;border:0;border-radius:999px;background:transparent;color:rgba(255,255,255,.55);font:inherit;cursor:pointer;transition:color 150ms ease-out}
.proto-picker-item:hover{color:rgba(255,255,255,.85)}
.proto-picker-item:active{transform:scale(.97)}
.proto-picker-item:focus-visible{outline:2px solid rgba(255,255,255,.4);outline-offset:2px}
.proto-picker-item[data-active]{color:#fff}
.proto-picker-divider{width:1px;height:16px;margin:0 4px;background:rgba(255,255,255,.12)}
.proto-picker-replay{padding:0 10px;font-size:14px}
@keyframes trace-in{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
.trace-line{animation:trace-in 200ms cubic-bezier(.23,1,.32,1)}
@media (prefers-reduced-motion:reduce){.trace-line{animation:none}}
`;

type PickerProps = { index: number; onChange: (index: number) => void; onReplay: () => void };

function Picker({ index, onChange, onReplay }: PickerProps) {
  const bind = (nav: HTMLElement | null) => {
    if (!nav) return;
    const highlight = nav.querySelector<HTMLElement>(".proto-picker-highlight");
    const active = nav.querySelector<HTMLElement>("[data-active]");
    if (highlight && active) {
      highlight.style.width = `${active.offsetWidth}px`;
      highlight.style.transform = `translateX(${active.offsetLeft}px)`;
    }
    if (!nav.hasAttribute("data-ready")) requestAnimationFrame(() => requestAnimationFrame(() => nav.setAttribute("data-ready", "")));
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const num = Number.parseInt(event.key, 10);
      if (num >= 1 && num <= CONCEPTS.length) onChange(num - 1);
      else if (event.key === "ArrowRight") onChange((index + 1) % CONCEPTS.length);
      else if (event.key === "ArrowLeft") onChange((index - 1 + CONCEPTS.length) % CONCEPTS.length);
      else if (event.key === "r" || event.key === "R") onReplay();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  };

  return (
    <nav ref={bind} className="proto-picker" aria-label="Prototype variants">
      <span className="proto-picker-highlight" aria-hidden="true" />
      {CONCEPTS.map((item, position) => (
        <button
          key={item.name}
          type="button"
          className="proto-picker-item"
          data-active={position === index ? "" : undefined}
          aria-current={position === index ? "true" : undefined}
          onClick={() => onChange(position)}
        >
          {item.name}
        </button>
      ))}
      <span className="proto-picker-divider" aria-hidden="true" />
      <button type="button" className="proto-picker-item proto-picker-replay" aria-label="Replay animation (R)" onClick={onReplay}>
        ↻
      </button>
    </nav>
  );
}

function Stage({ index }: { index: number }) {
  const browserNow = useNow();
  const [mountedAt] = useState(() => Date.now());
  const [speed, setSpeed] = useState(1);
  const startedAt = mountedAt - FIVE_MINUTES;
  const elapsed = FIVE_MINUTES + (browserNow - mountedAt) * speed;
  const entries = fakeTraceAt(elapsed, startedAt);
  const Concept = CONCEPTS[index]?.Concept ?? ConceptTimeline;
  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        Speed
        {[1, 5, 20].map((value) => (
          <Button key={value} size="sm" variant={speed === value ? "default" : "outline"} onClick={() => setSpeed(value)}>
            {value}x
          </Button>
        ))}
      </div>
      <TraceShell active>
        <Concept entries={entries} now={startedAt + elapsed} candidateFindings={Math.floor(entries.length / 9)} />
      </TraceShell>
    </div>
  );
}

// -----
// Three directions for the running Trace panel, behind a picker, on the
// fake live Scan. Prototype only: delete it when one concept is chosen.
// -----
export function ScanTraceConcepts({ index, onChange }: { index: number; onChange: (index: number) => void }) {
  const [replays, setReplays] = useState(0);
  return (
    <main className="mx-auto grid max-w-3xl gap-6 px-6 pb-24 pt-20">
      <style>{PICKER_CSS}</style>
      <Stage key={`${index}-${replays}`} index={index} />
      <Picker index={index} onChange={onChange} onReplay={() => setReplays(replays + 1)} />
    </main>
  );
}
