import { ArrowLeft, ArrowRight, Bot, Check, ChevronDown, ChevronRight, ClipboardCheck, CreditCard, ExternalLink, FileText, FolderGit2, GitBranch, LayoutDashboard, LoaderCircle, Lock, MessageSquare, Pencil, RefreshCw, ScanSearch, Search, ShieldCheck, Terminal, Users, X, type LucideIcon } from "lucide-react";
import { Caret, Collapse, Count, Prompt, Scroll, Stage, Swap, Window, type Act } from "./kit";
import { DASHBOARD_LOOK } from "./look";
import { Pill, type PillTone } from "./Pill";
import { Cells, FRESH, MODEL, OLDER, Repo } from "./ScansCard";
import { Card } from "./scenes";
import "./daylight.css";
import "./card.css";
import "./scenes.css";
import "./runner.css";

// How Elise works with a Runner, as the dashboard shows it today. `elise-runner run` in a terminal
// claims a Scan started in Elise. The Scans list says "In progress" and nothing more (as
// scan-list.tsx does); the Scan page (scan-detail.tsx) is where the work shows: the info notice, a
// "Findings so far" table that fills as the checks decide, and the Trace, grouped by Phase. Then
// the Scan succeeds and its first finding opens. The terminal lines are the headless Runner's own
// log (`Event` in apps/elise-runner-cli/cli/src/commands.rs). The repository, costs, trace entries
// and findings are made up, and the page says so.

const COMMAND = "elise-runner run";

// What the Runner prints for one Scan, in order.
const LOG = [
  "Scan claimed",
  "the recon phase started",
  "the recon phase ended: spent $0.06",
  "the hunt phase started",
  "the hunt phase ended: spent $0.21",
  "the check phase started",
  "the check phase ended: spent $0.09",
  "the report phase started",
  "the report phase ended: spent $0.06",
  "result sent to Elise",
  "Scan succeeded.",
];
// How long the scene rests after each line. The hunt takes its time; the check is where findings land.
const PACE = [800, 400, 600, 1500, 700, 300, 700, 500, 600, 500, 900];

type Page = "list" | "scan";
type S = { cmd: string; waiting: boolean; added: boolean; lines: number; found: number; page: Page; open: boolean };

const initial: S = { cmd: "", waiting: false, added: false, lines: 0, found: 0, page: "list", open: false };
const poster: S = { cmd: COMMAND, waiting: true, added: true, lines: LOG.length, found: 4, page: "scan", open: true };

const statusOf = (lines: number) => (lines === 0 ? "queued" : lines >= LOG.length ? "done" : "running");

// Phase i starts at log line 2 + 2i and ends at line 3 + 2i (counting lines shown).
const PHASES = ["Recon", "Hunt", "Check", "Report"];
const started = (lines: number, i: number) => lines >= 2 + 2 * i;
const ended = (lines: number, i: number) => lines >= 3 + 2 * i;
const newestPhase = (lines: number) => [3, 2, 1, 0].find((i) => started(lines, i)) ?? -1;
const SPENT = ["41s", "1m 12s", "49s", "22s"];

// What the Trace shows for the phase that is running: its newest entries, as the dashboard lists them.
type Leaf = { icon: LucideIcon; label: string; times?: number; ago: string };
const LEAVES: Leaf[][] = [
  [
    { icon: FileText, label: "Reading files", times: 8, ago: "2s ago" },
    { icon: Search, label: "Searching the code", times: 3, ago: "6s ago" },
  ],
  [
    { icon: Search, label: "Searching the code", times: 9, ago: "2s ago" },
    { icon: FileText, label: "Reading files", times: 21, ago: "4s ago" },
    { icon: MessageSquare, label: "Reasoning", ago: "9s ago" },
  ],
  [
    { icon: Terminal, label: "Running a command", times: 4, ago: "2s ago" },
    { icon: FileText, label: "Reading files", times: 6, ago: "5s ago" },
    { icon: MessageSquare, label: "Reasoning", ago: "8s ago" },
  ],
  [
    { icon: Pencil, label: "Writing", times: 3, ago: "2s ago" },
    { icon: MessageSquare, label: "Reasoning", ago: "7s ago" },
  ],
];

// The findings, in the table's order (worst first). `at` is the order the checks decide them in.
type Row = { at: number; tone: PillTone; severity: string; title: string; file: string; folder: string; line: number; needsPerson?: boolean };
const FINDINGS: Row[] = [
  { at: 3, tone: "high", severity: "High", title: "Open redirect on the login page", file: "login.ts", folder: "src/routes", line: 42 },
  { at: 1, tone: "medium", severity: "Medium", title: "Session cookie is missing the Secure flag", file: "session.ts", folder: "src/auth", line: 58 },
  { at: 4, tone: "medium", severity: "Medium", title: "Webhook signature is not compared in constant time", file: "stripe.ts", folder: "src/webhooks", line: 17, needsPerson: true },
  { at: 2, tone: "low", severity: "Low", title: "Error message names the database", file: "errors.ts", folder: "src/api", line: 21 },
];

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
const CRUMBS: Record<Page, string[]> = {
  list: ["Scans"],
  scan: ["Repositories", "acme/billing-api", "main", "Scan 4f2a9c1"],
};

async function script(a: Act<S>) {
  const wide = a.layout === "wide";
  await a.wait(700);
  a.mark("command");
  await a.type("cmd", COMMAND, { interval: 45 });
  await a.wait(350);
  await a.set({ waiting: true });
  await a.wait(900);

  a.mark("scan");
  await a.click("new");
  await a.set({ added: true });
  await a.wait(1000);

  a.mark("run");
  for (let i = 0; i < LOG.length; i++) {
    await a.set({ lines: i + 1 });
    if (wide && i === 1) {
      // The row only says "In progress", so the cursor opens the Scan page to watch it.
      await a.wait(500);
      await a.click("fresh");
      await a.set({ page: "scan" });
      await a.wait(900);
      await a.scroll("scan", "trace", { duration: 800, offset: 24 });
    }
    if (wide && i === 5) {
      // The check phase decides findings: back up to the table to watch them arrive.
      await a.scroll("scan", 0, { duration: 700 });
      for (const n of [1, 2, 3, 4]) {
        await a.wait(600);
        await a.set({ found: n });
      }
    }
    await a.wait(PACE[i]);
  }

  if (!wide) return;
  a.mark("finding");
  await a.wait(700);
  await a.click("row-0");
  await a.set({ open: true });
  await a.wait(3200);
}

function Phase({ i, lines, done }: { i: number; lines: number; done: boolean }) {
  const running = started(lines, i) && !ended(lines, i);
  return (
    <Collapse open={started(lines, i)}>
      <li className="sp-node" data-last={i === 0 || undefined}>
        <span className="sp-node__head">
          <span className="sp-mark" data-state={running ? "running" : "done"}>
            {running ? <i /> : <Check size={14} strokeWidth={1.5} />}
          </span>
          <span className="sp-node__title">
            {PHASES[i]}
            {!running && <span className="sp-time">{SPENT[i]}</span>}
          </span>
          <ChevronDown className="sp-node__chev" size={16} strokeWidth={1.5} data-open={running || undefined} />
        </span>
        <Collapse open={running && !done}>
          <ul className="sp-leaves">
            {LEAVES[i].map((leaf, n) => (
              <li key={leaf.label} className="sp-leaf" data-last={n === LEAVES[i].length - 1 || undefined}>
                <leaf.icon size={14} strokeWidth={1.5} />
                <span>{leaf.label}</span>
                {leaf.times && <span className="sp-times">×{leaf.times}</span>}
                <span className="sp-time">{leaf.ago}</span>
              </li>
            ))}
          </ul>
        </Collapse>
      </li>
    </Collapse>
  );
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
        const status = statusOf(s.lines);
        const done = status === "done";
        const page: Page = compact ? "list" : s.page;
        const all = 11 + (s.added ? 1 : 0);
        const succeeded = 9 + (done ? 1 : 0);
        const prefix = compact ? "" : "[acme/billing-api] ";
        const typing = s.cmd.length < COMMAND.length;
        const now = newestPhase(s.lines);
        const candidates = s.lines >= 5 ? 9 : 5;
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
                    <span className="dash-crumbs">
                      <Swap id={page}>
                        <span className="dash-crumbs__trail">
                          {CRUMBS[page].map((crumb, i, trail) => (
                            <span key={crumb} className="dash-crumb" data-last={i === trail.length - 1 || undefined}>
                              {i > 0 && <ChevronRight size={14} strokeWidth={1.5} />}
                              {crumb}
                            </span>
                          ))}
                        </span>
                      </Swap>
                    </span>
                    <span className="dash-actions">
                      <span className="dash-iconbtn" aria-hidden><RefreshCw size={16} strokeWidth={1.5} /></span>
                      <span className="dash-btn" data-target="new" data-cursor="pointer">New scan</span>
                    </span>
                  </header>

                  <div className="dash-pages">
                    <section className="dash-page" data-active={page === "list" || undefined}>
                      <div className="pg-head">
                        <div className="pg-head__text">
                          <div className="pg-head__title"><h3 className="dash-title">Scans</h3></div>
                          <p className="dash-desc">Every audit you have run, newest first. Open one to read its report.</p>
                        </div>
                      </div>
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
                                ["In progress", s.added && !done ? 1 : 0, false],
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
                                    {done ? <Pill tone="success" dot>Succeeded</Pill> : status === "running" ? <Pill tone="info" dot pulse>Running</Pill> : <Pill tone="neutral" dot>Queued</Pill>}
                                  </Swap>
                                </div>
                                <div className="dt-cell dt-cell--found">
                                  <Swap id={done ? "done" : "wait"}>
                                    {done ? (
                                      <span className="dt-found">
                                        <span className="dt-found__row">
                                          <span className="dt-strong">4 findings</span>
                                          <span className="dt-sev"><i data-tone="high" /><span className="dt-num">1</span> high</span>
                                          <span className="dt-sev"><i data-tone="medium" /><span className="dt-num">2</span> medium</span>
                                          <span className="dt-sev"><i data-tone="low" /><span className="dt-num">1</span> low</span>
                                        </span>
                                        <span className="dt-byhand">1 to check by hand</span>
                                      </span>
                                    ) : (
                                      <span className="dt-muted">In progress</span>
                                    )}
                                  </Swap>
                                </div>
                                <div className="dt-cell dt-cell--review">
                                  <span className="dt-review">{FRESH.review}</span>
                                  <span className="dt-origin">{MODEL}</span>
                                </div>
                                <div className="dt-cell dt-cell--cost"><Swap id={done ? "done" : "wait"}>{done ? FRESH.cost : "-"}</Swap></div>
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

                    {!compact && (
                      <section className="dash-page dash-page--flush" data-active={page === "scan" || undefined}>
                        <Scroll name="scan" bar="none" className="pg-scroll">
                          <div className="pg-stack">
                            <div className="pg-head">
                              <div className="pg-head__text">
                                <div className="pg-head__title">
                                  <h3 className="dash-title"><span className="dt-owner">acme/</span>billing-api</h3>
                                  <Pill tone="outline"><Lock size={12} strokeWidth={1.5} />Private</Pill>
                                </div>
                              </div>
                              <Swap id={done ? "again" : "stop"}>
                                {done ? <span className="pg-obtn">Scan this branch again</span> : <span className="pg-obtn">Stop</span>}
                              </Swap>
                            </div>
                            <div className="pg-branch">
                              <span className="pg-branch__row">
                                <span className="pg-chip"><GitBranch size={14} strokeWidth={1.5} /><span className="dt-mono">main</span><ChevronRight size={14} strokeWidth={1.5} /></span>
                                <span className="pg-sq"><ExternalLink size={16} strokeWidth={1.5} /></span>
                              </span>
                              <span className="pg-meta">
                                <Swap id={done ? "done" : "run"}>
                                  {done ? <Pill tone="success" dot>Succeeded</Pill> : <Pill tone="info" dot pulse>Running</Pill>}
                                </Swap>
                                <span>Started <span className="pg-time">Nov 12, 10:12 AM</span></span>
                                <span aria-hidden>·</span>
                                <span><Swap id={done ? "took" : "for"}>{done ? "Took 3m 12s" : "Running for 2m 05s"}</Swap></span>
                                <span aria-hidden>·</span>
                                <span>Coverage {FRESH.review}</span>
                                <span aria-hidden>·</span>
                                <span>Commit <span className="dt-mono">4f2a9c1</span></span>
                              </span>
                            </div>

                            <Collapse open={!done}>
                              <div className="sp-alert">
                                <LoaderCircle className="sp-spin" size={16} strokeWidth={1.5} />
                                <div className="sp-alert__text">
                                  <span className="sp-alert__title">Scanning.</span>
                                  <span className="sp-alert__note">A scan usually takes a few minutes. This page updates by itself. You can leave and come back.</span>
                                </div>
                              </div>
                            </Collapse>

                            <Card
                              title={done ? "Findings" : "Findings so far"}
                              sub={<Swap id={done ? "done" : "live"}>{done ? "4 findings: 3 confirmed, 1 need a person to check. Open a row for the impact, evidence and fix." : "Found so far, still being checked. They can change before the Report."}</Swap>}
                              flush
                            >
                              <Collapse open={done}>
                                <div className="sp-copyrow"><span className="pg-obtn pg-obtn--sm">Copy all 4 findings for coding agent</span></div>
                              </Collapse>
                              <Collapse open={s.found === 0 && !done}>
                                <div className="sp-empty">
                                  <span className="sp-empty__icon"><ShieldCheck size={20} strokeWidth={1.5} /></span>
                                  <span className="sp-empty__title">Nothing verified yet</span>
                                  <span className="sp-empty__text">A finding shows here as soon as it is checked. This page updates by itself.</span>
                                </div>
                              </Collapse>
                              <Collapse open={s.found > 0}>
                                <div className="sp-table">
                                  <div className="sp-tr sp-tr--head"><span>Severity</span><span>Finding</span><span>Where</span><span /></div>
                                  {FINDINGS.map((row, index) => (
                                    <Collapse key={row.title} open={s.found >= row.at}>
                                      <div className="sp-tr" data-target={index === 0 ? "row-0" : undefined} data-cursor={index === 0 ? "pointer" : undefined}>
                                        <span className="sp-sev">
                                          <Pill tone={row.tone} dot>{row.severity}</Pill>
                                          {row.needsPerson && <Pill tone="warning">Needs a person</Pill>}
                                        </span>
                                        <span className="sp-title">{row.title}</span>
                                        <span className="sp-where">
                                          <span className="sp-where__file">{row.file}:{row.line}</span>
                                          <span className="sp-where__folder">{row.folder}</span>
                                        </span>
                                        <ChevronRight size={16} strokeWidth={1.5} />
                                      </div>
                                    </Collapse>
                                  ))}
                                </div>
                              </Collapse>
                            </Card>

                            <Card
                              data-target="trace"
                              title={done ? "Trace" : "Trace"}
                              sub={done ? "What the scan did, by phase." : "What the scan is doing now."}
                              right={done ? <ChevronDown className="sp-node__chev" size={16} strokeWidth={1.5} /> : undefined}
                            >
                              <Collapse open={!done}>
                                <div className="sp-trace">
                                  <div className="sp-now">
                                    <span className="sp-ping"><i /><i /></span>
                                    <span className="sp-now__label">
                                      <Swap id={now}>{now < 0 ? "Waiting for the first entries" : LEAVES[now][0].label}</Swap>
                                      {now >= 0 && LEAVES[now][0].times && <span className="sp-times">×{LEAVES[now][0].times}</span>}
                                      {now >= 0 && <span className="sp-time">2s ago</span>}
                                    </span>
                                    <Collapse open={s.lines >= 4}>
                                      <span className="sp-cand"><Count value={candidates} format={(n) => `${n} candidates`} duration={500} /></span>
                                    </Collapse>
                                  </div>
                                  <ol className="sp-phases">
                                    {[3, 2, 1, 0].map((i) => <Phase key={i} i={i} lines={s.lines} done={done} />)}
                                  </ol>
                                </div>
                              </Collapse>
                            </Card>
                          </div>
                        </Scroll>
                      </section>
                    )}
                  </div>
                </div>

                {!compact && (
                  <>
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
                  </>
                )}
              </div>
            </Window>

            {/* The Runner, on your own computer: the log of `elise-runner run`, newest line at the foot. */}
            <Window chrome="terminal" lights="grey" title="elise-runner" className="rn-term">
              <div className="rn-log">
                <Prompt path="~/code">
                  {s.cmd}
                  {typing && <Caret still />}
                </Prompt>
                <Collapse open={s.waiting}>
                  <div className="dim">Waiting for Scans from Elise. Stop with Ctrl-C.</div>
                </Collapse>
                {LOG.map((line, i) => (
                  <Collapse key={line} open={s.lines > i}>
                    <div className={i === LOG.length - 1 ? "ok" : undefined}>
                      <span className="dim">{prefix}</span>
                      {line}
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
