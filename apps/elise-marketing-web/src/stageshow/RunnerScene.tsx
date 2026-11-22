import { ArrowLeft, ArrowRight, Bot, ChevronDown, ChevronRight, ClipboardCheck, CreditCard, FileText, FolderGit2, LayoutDashboard, RefreshCw, ScanSearch, Search, Users, X } from "lucide-react";
import { Caret, Collapse, Count, Prompt, Stage, Swap, Window, type Act } from "./kit";
import { DASHBOARD_LOOK } from "./look";
import { Pill } from "./Pill";
import { Cells, FRESH, Findings, MODEL, OLDER, Repo } from "./ScansCard";
import { PageHead } from "./scenes";
import "./daylight.css";
import "./card.css";
import "./scenes.css";
import "./runner.css";

// How Elise works, as one picture: a Runner on your own computer picks up a Scan started in the
// dashboard, works through its four Phases in a terminal, and the dashboard's Scans list follows
// it (Queued, Running, Succeeded) until the first finding opens. The terminal lines are the
// headless Runner's own log (apps/elise-runner-cli, `Event` in cli/src/commands.rs); the costs,
// repository and finding are made up, and the page says so.

const COMMAND = "elise-runner run";

// What the Runner prints for one Scan, in order. `spent` is the Phase's cost when it ends.
const LOG: { text: string; spent?: number; ok?: boolean }[] = [
  { text: "Scan claimed" },
  { text: "the recon phase started" },
  { text: "the recon phase ended: spent $0.06", spent: 0.06 },
  { text: "the hunt phase started" },
  { text: "the hunt phase ended: spent $0.21", spent: 0.21 },
  { text: "the check phase started" },
  { text: "the check phase ended: spent $0.09", spent: 0.09 },
  { text: "the report phase started" },
  { text: "the report phase ended: spent $0.06", spent: 0.06 },
  { text: "result sent to Elise" },
  { text: "Scan succeeded.", ok: true },
];
// How long each line takes to arrive: a Phase starts quickly and takes its time to end.
const PACE = [900, 500, 800, 300, 900, 300, 800, 500, 650, 600, 1000];

type S = { cmd: string; waiting: boolean; added: boolean; lines: number; found: number; open: boolean };

const initial: S = { cmd: "", waiting: false, added: false, lines: 0, found: 0, open: false };
const poster: S = { cmd: COMMAND, waiting: true, added: true, lines: LOG.length, found: 4, open: true };

const spentBy = (lines: number) => Math.round(LOG.slice(0, lines).reduce((sum, l) => sum + (l.spent ?? 0), 0) * 100) / 100;
const phase = (lines: number) => (lines === 0 ? "queued" : lines >= LOG.length ? "done" : "running");

// The row's Phase line follows the log: the Phase that has started and not yet ended.
const PHASES = ["Recon", "Hunt", "Check", "Report"];
const phaseOf = (lines: number) => (lines >= 8 ? 3 : lines >= 6 ? 2 : lines >= 4 ? 1 : lines >= 2 ? 0 : -1);

// Findings arrive while the Runner works: three during the hunt, the fourth during the check. The
// last one is the High one, so the count and the dots change as they land. They end as the row's
// finished findings (FRESH.found: one High, two Medium, one Low).
type Level = "high" | "medium" | "low";
const ARRIVALS: Level[] = ["medium", "low", "high", "medium"];
const DRIP: Record<number, number[]> = { 3: [1, 2, 3], 5: [4] };
const liveFound = (n: number) => {
  const severity: Partial<Record<Level, number>> = {};
  for (const level of ARRIVALS.slice(0, n)) severity[level] = (severity[level] ?? 0) + 1;
  return { total: n, severity };
};

const NAV = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Security status", icon: ClipboardCheck },
  { label: "Repositories", icon: FolderGit2 },
  { label: "Scans", icon: ScanSearch, on: true },
  { label: "Files", icon: FileText },
];
const ACCOUNT = [
  { label: "Runners", icon: Bot, mark: true },
  { label: "Team", icon: Users },
  { label: "Plan", icon: CreditCard },
];

async function script(a: Act<S>) {
  await a.wait(700);
  a.mark("command");
  await a.type("cmd", COMMAND, { interval: 45 });
  await a.wait(350);
  await a.set({ waiting: true });
  await a.wait(1000);

  a.mark("scan");
  await a.click("new");
  await a.set({ added: true });
  await a.wait(1400);

  a.mark("run");
  for (let i = 0; i < LOG.length; i++) {
    await a.set({ lines: i + 1 });
    for (const n of DRIP[i] ?? []) {
      await a.wait(550);
      await a.set({ found: n });
    }
    await a.wait(PACE[i]);
  }

  a.mark("finding");
  await a.wait(500);
  await a.click({ at: "fresh", x: 0.16, y: 0.5 });
  await a.set({ open: true });
  await a.wait(3200);
}

export default function RunnerScene() {
  return (
    <Stage
      width={1440}
      height={760}
      compact={{ below: 640, width: 358, height: 440 }}
      initial={initial}
      poster={poster}
      script={script}
      play="once"
      tokens={DASHBOARD_LOOK}
      cursor={{ at: { wide: { x: 1180, y: 240 }, compact: { x: 250, y: 120 } }, style: "arrow" }}
      className="dl ed-card rn"
    >
      {(s, _rect, layout) => {
        const compact = layout === "compact";
        const status = phase(s.lines);
        const spent = spentBy(s.lines);
        const all = 11 + (s.added ? 1 : 0);
        const succeeded = 9 + (status === "done" ? 1 : 0);
        const prefix = compact ? "" : "[acme/billing-api] ";
        const typing = s.cmd.length < COMMAND.length;
        return (
          <>
            <Window url="app.eliselab.com" className="ed-window ss-fade-b" body={{ className: "ed-body" }}>
              <div className="dash">
                <div className="dash-sky" aria-hidden />

                <aside className="dash-side">
                  <div className="dash-brand">
                    <span className="dash-brand__name">Elise</span>
                    <span className="dash-brand__tag">Security audits</span>
                  </div>
                  <nav className="dash-nav">
                    {NAV.map(({ label, icon: Icon, on }) => (
                      <div key={label} className="dash-row" data-on={on || undefined}>
                        <Icon size={18} strokeWidth={1.5} />
                        <span className="dash-row__label">{label}</span>
                        {label === "Scans" && (
                          <>
                            <span className="dash-live" data-on={status === "running" || undefined} />
                            <span className="dash-count"><Swap id={all}>{all}</Swap></span>
                          </>
                        )}
                      </div>
                    ))}
                  </nav>
                  <nav className="dash-nav dash-nav--account">
                    {ACCOUNT.map(({ label, icon: Icon, mark }) => (
                      <div key={label} className="dash-row">
                        <Icon size={18} strokeWidth={1.5} />
                        <span className="dash-row__label">{label}</span>
                        {mark && <span className="rn-mark" />}
                      </div>
                    ))}
                  </nav>
                </aside>

                <div className="dash-col">
                  <header className="dash-top">
                    <span className="dash-crumbs"><span className="dash-crumb" data-last>Scans</span></span>
                    <span className="dash-actions">
                      <span className="dash-iconbtn" aria-hidden><RefreshCw size={16} strokeWidth={1.5} /></span>
                      <span className="dash-btn" data-target="new" data-cursor="pointer">New scan</span>
                    </span>
                  </header>

                  <div className="dash-pages">
                    <section className="dash-page" data-active>
                      <PageHead title="Scans" desc="Every audit you have run, newest first. Open one to read its report." />
                      <div className="dl-card">
                        <div className="dl-card__head">
                          <span className="dl-card__title">All scans</span>
                          <span className="dl-card__count"><Swap id={all}>{all} scans</Swap></span>
                        </div>
                        <div className="dl-card__body">
                          <div className="dash-filter">
                            <div className="dash-tabs">
                              {[
                                ["All", all, true],
                                ["In progress", s.added && status !== "done" ? 1 : 0, false],
                                ["Succeeded", succeeded, false],
                                ["Failed", 2, false],
                              ].map(([label, count, on]) => (
                                <span key={String(label)} className="dash-tab" data-on={on || undefined}>
                                  {label}
                                  <span className="dash-tab__n"><Swap id={String(count)}>{String(count)}</Swap></span>
                                </span>
                              ))}
                            </div>
                            <span className="dash-search">
                              <Search size={16} strokeWidth={1.5} aria-hidden />
                              <span>Search by repository, branch or commit</span>
                            </span>
                          </div>

                          <div className="dt">
                            <div className="dt-row dt-row--head">
                              <div className="dt-cell dt-cell--repo">Repository</div>
                              <div className="dt-cell dt-cell--status">Status</div>
                              <div className="dt-cell dt-cell--found">Findings</div>
                              <div className="dt-cell dt-cell--review">Review</div>
                              <div className="dt-cell dt-cell--cost">Cost</div>
                              <div className="dt-cell dt-cell--time">Started</div>
                              <div className="dt-cell dt-cell--open" />
                            </div>

                            <Collapse open={s.added}>
                              <div className="dt-row" data-target="fresh" data-cursor="pointer">
                                <div className="dt-cell dt-cell--repo"><Repo scan={FRESH} /></div>
                                <div className="dt-cell dt-cell--status">
                                  <Swap id={status}>
                                    {status === "done" ? <Pill tone="success" dot>Succeeded</Pill> : status === "running" ? <Pill tone="info" dot pulse>Running</Pill> : <Pill tone="neutral" dot>Queued</Pill>}
                                  </Swap>
                                  <Collapse open={status === "running"}>
                                    <span className="rn-phase">
                                      <span className="rn-steps" aria-hidden>
                                        {PHASES.map((name, i) => (
                                          <i key={name} data-state={i < phaseOf(s.lines) ? "done" : i === phaseOf(s.lines) ? "now" : undefined} />
                                        ))}
                                      </span>
                                      <Swap id={phaseOf(s.lines)}>
                                        {phaseOf(s.lines) < 0 ? "Starting" : `${PHASES[phaseOf(s.lines)]} · ${phaseOf(s.lines) + 1} of 4`}
                                      </Swap>
                                    </span>
                                  </Collapse>
                                </div>
                                <div className="dt-cell dt-cell--found">
                                  <Swap id={status === "running" && s.found > 0 ? "live" : status}>
                                    {status === "done" ? (
                                      <Findings found={FRESH.found} />
                                    ) : status === "running" && s.found > 0 ? (
                                      <span className="dt-found">
                                        <Findings found={liveFound(s.found)} />
                                        <span className="dt-byhand rn-live">found so far, still checking</span>
                                      </span>
                                    ) : (
                                      <span className="dt-muted">{status === "running" ? "In progress" : "Waiting for a Runner"}</span>
                                    )}
                                  </Swap>
                                </div>
                                <div className="dt-cell dt-cell--review">
                                  <span className="dt-review">{FRESH.review}</span>
                                  <span className="dt-origin">{MODEL}</span>
                                </div>
                                <div className="dt-cell dt-cell--cost">
                                  <Swap id={spent === 0 ? "none" : "sum"}>
                                    {spent === 0 ? "-" : <Count value={spent} format={(n) => `$${n.toFixed(2)}`} duration={500} />}
                                  </Swap>
                                </div>
                                <div className="dt-cell dt-cell--time">{FRESH.started}</div>
                                <div className="dt-cell dt-cell--open"><ChevronRight size={16} strokeWidth={1.5} aria-hidden /></div>
                              </div>
                            </Collapse>

                            {OLDER.map((scan) => (
                              <div key={scan.branch + scan.sha} className="dt-row">
                                <Cells scan={scan} />
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </section>
                  </div>
                </div>

                <div className="dash-scrim" data-open={s.open || undefined} aria-hidden />
                <aside className="dash-sheet" data-open={s.open || undefined} aria-hidden>
                  <span className="dash-sheet__close"><X size={16} strokeWidth={1.5} /></span>
                  <header className="dash-sheet__head">
                    <div className="dash-sheet__badges">
                      <Pill tone="high" dot>High</Pill>
                      <Pill tone="success">Confirmed</Pill>
                      <span className="dash-sheet__n">1 of 4</span>
                    </div>
                    <h4 className="dash-sheet__title">Open redirect on the login page</h4>
                    <span className="dash-sheet__path">src/routes/login.ts:42</span>
                  </header>
                  <div className="dash-sheet__body">
                    <section>
                      <h5 className="dash-sec" data-tone="danger">What could happen</h5>
                      <p className="dash-sheet__p">A crafted link can send people from your login page to another site, where a lookalike page can ask for their password.</p>
                    </section>
                    <section>
                      <h5 className="dash-sec">Evidence in the code</h5>
                      <div className="dash-evidence">
                        <p className="dash-sheet__p">The login route sends people to whatever address the next parameter holds.</p>
                        <code className="dash-code">res.redirect(req.query.next)</code>
                      </div>
                    </section>
                    <section>
                      <h5 className="dash-sec" data-tone="success">Suggested fix</h5>
                      <p className="dash-sheet__p">Check the address against a list of allowed pages before redirecting.</p>
                    </section>
                  </div>
                  <footer className="dash-sheet__foot">
                    <span className="dash-decide">
                      <span className="dash-decide__label">Your decision</span>
                      <span className="dash-select">Open<ChevronDown size={16} strokeWidth={1.5} /></span>
                    </span>
                    <span className="dash-nav-btns">
                      <span className="dash-obtn" data-off><ArrowLeft size={16} strokeWidth={1.5} />Previous</span>
                      <span className="dash-obtn">Next<ArrowRight size={16} strokeWidth={1.5} /></span>
                    </span>
                  </footer>
                </aside>
              </div>
            </Window>

            {/* The Runner, on your own computer: the log of `elise-runner run`, newest line at the foot. */}
            <Window chrome="terminal" lights="grey" title="elise-runner" className="rn-term" data-compact={compact || undefined}>
              <div className="rn-log">
                <Prompt path="~/code">
                  {s.cmd}
                  {typing && <Caret still />}
                </Prompt>
                <Collapse open={s.waiting}>
                  <div className="dim">Waiting for Scans from Elise. Stop with Ctrl-C.</div>
                </Collapse>
                {LOG.map((line, i) => (
                  <Collapse key={line.text} open={s.lines > i}>
                    <div className={line.ok ? "ok" : undefined}>
                      <span className="dim">{prefix}</span>
                      {line.text}
                    </div>
                  </Collapse>
                ))}
              </div>
            </Window>
          </>
        );
      }}
    </Stage>
  );
}
