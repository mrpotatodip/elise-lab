import { ArrowLeft, ArrowRight, ChevronDown, ChevronRight, ClipboardCheck, FileText, FolderGit2, LayoutDashboard, Lock, Plug, RefreshCw, ScanSearch, Search, Settings, Users, X } from "lucide-react";
import { Collapse, Stage, Swap, Window, type Act } from "./kit";
import { DASHBOARD_LOOK } from "./look";
import { Pill, STATUS } from "./Pill";
import { RunnersScene, FilesScene, OverviewScene, PageHead, ShipScene } from "./scenes";
import { STILLS, initial, poster, type Page, type S } from "./tour-state";
import "./daylight.css";
import "./card.css";
import "./scenes.css";

// A tour of the dashboard in its Daylight theme, rebuilt from the dashboard's own components
// (shell-sidebar, shell-topbar, scan-list, repo-detail, scan-verdict-card, scan-overview, the
// files and Runners pages). It plays once when it scrolls into view, as one loop: a scan is
// started and its finding opens, the Ready to ship? answer, the Overview, the reports in Files,
// and the Runners. Every repository and finding on it is made up, and the page says so.

const NAV: { label: string; icon: typeof LayoutDashboard; page: Page; target: string }[] = [
  { label: "Overview", icon: LayoutDashboard, page: "overview", target: "nav-overview" },
  { label: "Security status", icon: ClipboardCheck, page: "scans", target: "" },
  { label: "Repositories", icon: FolderGit2, page: "ship", target: "nav-repos" },
  { label: "Scans", icon: ScanSearch, page: "scans", target: "" },
  { label: "Files", icon: FileText, page: "files", target: "nav-files" },
];
const ACCOUNT: { label: string; icon: typeof Plug; page?: Page; target?: string }[] = [
  { label: "Runners", icon: Plug, page: "runners", target: "nav-runners" },
  { label: "Team", icon: Users },
  { label: "Settings", icon: Settings },
];

const CRUMBS: Record<Page, string[]> = {
  scans: ["Scans"],
  ship: ["Repositories", "acme/example-app", "main"],
  overview: ["Overview"],
  files: ["Files"],
  runners: ["Runners"],
};

type Severity = "high" | "medium" | "low";
export type Found = { total: number; severity: Partial<Record<Severity, number>>; byHand?: number };
export type Scan = { owner: string; name: string; priv?: boolean; branch: string; sha: string; status: keyof typeof STATUS; found: Found | null; review: string; cost: string; started: string };

export const FRESH: Scan = { owner: "acme/", name: "example-app", priv: true, branch: "main", sha: "4f2a9c1", status: "succeeded", found: { total: 4, severity: { high: 1, medium: 2, low: 1 }, byHand: 1 }, review: "Focused", cost: "$0.42", started: "Nov 12, 10:12 AM" };

export const OLDER: Scan[] = [
  { owner: "acme/", name: "web-app", branch: "main", sha: "b81d03e", status: "succeeded", found: { total: 1, severity: { low: 1 } }, review: "Focused", cost: "$0.31", started: "Nov 11, 4:40 PM" },
  { owner: "acme/", name: "docs-site", branch: "main", sha: "9c0e5a2", status: "succeeded", found: { total: 0, severity: {} }, review: "Focused", cost: "$0.12", started: "Nov 11, 11:05 AM" },
  { owner: "acme/", name: "mobile-api", priv: true, branch: "auth", sha: "e47b1f8", status: "failed", found: null, review: "Balanced", cost: "-", started: "Nov 10, 6:48 PM" },
  { owner: "acme/", name: "example-app", priv: true, branch: "rounding", sha: "21ad7c4", status: "succeeded", found: { total: 1, severity: { medium: 1 } }, review: "Focused", cost: "$0.28", started: "Nov 10, 9:03 AM" },
  { owner: "acme/", name: "web-app", branch: "main", sha: "03fe8b6", status: "succeeded", found: { total: 2, severity: { low: 2 } }, review: "Balanced", cost: "$1.84", started: "Nov 9, 6:21 PM" },
];

export const MODEL = "Claude Opus 5.5";

async function script(a: Act<S>) {
  // Scans: a scan is started, finishes, and its first finding opens.
  await a.wait(900);
  a.mark("scan");
  await a.click("new");
  await a.set({ added: true });
  await a.wait(2000);
  await a.set({ done: true });
  await a.wait(1100);
  a.mark("finding");
  await a.click({ at: "fresh", x: 0.16, y: 0.5 });
  await a.set({ open: true });
  await a.wait(2600);
  // The phone-width picture tells only this first part.
  if (a.layout === "compact") return;

  a.mark("close");
  await a.click("close");
  await a.set({ open: false });
  await a.wait(600);

  a.mark("ship");
  await a.click("nav-repos");
  await a.set({ page: "ship" });
  await a.wait(900);
  await a.scroll("ship", "decide", { duration: 900, offset: 380 });
  await a.wait(300);
  await a.click("decide");
  await a.set({ decide: true });
  await a.wait(2600);

  a.mark("overview");
  await a.click("nav-overview");
  await a.set({ page: "overview" });
  await a.wait(1800);
  await a.scroll("ov", "ov-3", { duration: 900 });
  await a.set({ live: true });
  await a.wait(2400);

  a.mark("files");
  await a.click("nav-files");
  await a.set({ page: "files" });
  await a.wait(1400);
  await a.click("tab-report");
  await a.set({ tab: "report" });
  await a.wait(2200);

  a.mark("runners");
  await a.click("nav-runners");
  await a.set({ page: "runners" });
  await a.wait(700);
  for (let i = 1; i <= 3; i++) {
    await a.set({ repos: i });
    await a.wait(260);
  }
  await a.wait(2600);
}

export function Repo({ scan }: { scan: Scan }) {
  return (
    <>
      <span className="dt-repo">
        <span className="dt-owner">{scan.owner}</span>
        <span>{scan.name}</span>
        {scan.priv && <Lock className="dt-lock" size={12} strokeWidth={1.5} aria-hidden />}
      </span>
      <span className="dt-origin">
        <span className="dt-mono">{scan.branch}</span>
        <span className="dt-mono">{scan.sha}</span>
      </span>
    </>
  );
}

export function Findings({ found }: { found: Found | null }) {
  if (!found) return <span className="dt-muted">No report</span>;
  if (found.total === 0) return <span className="dt-muted">None found</span>;
  return (
    <span className="dt-found">
      <span className="dt-found__row">
        <span className="dt-strong">{found.total} {found.total === 1 ? "finding" : "findings"}</span>
        {(["high", "medium", "low"] as const).filter((s) => found.severity[s]).map((s) => (
          <span key={s} className="dt-sev">
            <i data-tone={s} />
            <span className="dt-num">{found.severity[s]}</span> {s}
          </span>
        ))}
      </span>
      {found.byHand ? <span className="dt-byhand">{found.byHand} to check by hand</span> : null}
    </span>
  );
}

export function Cells({ scan }: { scan: Scan }) {
  return (
    <>
      <div className="dt-cell dt-cell--repo"><Repo scan={scan} /></div>
      <div className="dt-cell dt-cell--status"><Pill tone={STATUS[scan.status].tone} dot>{STATUS[scan.status].label}</Pill></div>
      <div className="dt-cell dt-cell--found"><Findings found={scan.found} /></div>
      <div className="dt-cell dt-cell--review">
        <span className="dt-review">{scan.review}</span>
        <span className="dt-origin">{MODEL}</span>
      </div>
      <div className="dt-cell dt-cell--cost">{scan.cost}</div>
      <div className="dt-cell dt-cell--time">{scan.started}</div>
      <div className="dt-cell dt-cell--open"><ChevronRight size={16} strokeWidth={1.5} aria-hidden /></div>
    </>
  );
}

// `still` shows one page at its payoff and plays nothing.
export default function ScansCard({ still }: { still?: Page }) {
  const fixed = still ? STILLS[still] : undefined;
  return (
    <Stage
      width={1440}
      height={760}
      compact={{ below: 640, width: 358, height: 440 }}
      initial={fixed ?? initial}
      poster={fixed ?? poster}
      script={fixed ? undefined : script}
      play="once"
      tokens={DASHBOARD_LOOK}
      cursor={{ at: { wide: { x: 1000, y: 330 }, compact: { x: 250, y: 120 } }, style: "arrow" }}
      className="dl ed-card"
    >
      {(s, _rect, layout) => {
        const running = s.added && !s.done;
        const all = 11 + (s.added ? 1 : 0);
        const succeeded = 9 + (s.done ? 1 : 0);
        const compact = layout === "compact";
        return (
          <Window url="app.eliselab.com" className="ed-window ss-fade-b" body={{ className: "ed-body" }}>
            <div className="dash">
              <div className="dash-sky" aria-hidden />

              <aside className="dash-side">
                <div className="dash-brand">
                  <span className="dash-brand__name">Elise</span>
                  <span className="dash-brand__tag">Security audits</span>
                </div>
                <nav className="dash-nav">
                  {NAV.map(({ label, icon: Icon, page, target }) => (
                    <div key={label} className="dash-row" data-on={(label === "Security status" ? false : page === s.page) || undefined} data-target={target || undefined} data-cursor={target ? "pointer" : undefined}>
                      <Icon size={18} strokeWidth={1.5} />
                      <span className="dash-row__label">{label}</span>
                      {label === "Scans" && (
                        <>
                          <span className="dash-live" data-on={running || undefined} />
                          <span className="dash-count"><Swap id={all}>{all}</Swap></span>
                        </>
                      )}
                    </div>
                  ))}
                </nav>
                <nav className="dash-nav dash-nav--account">
                  {ACCOUNT.map(({ label, icon: Icon, page, target }) => (
                    <div key={label} className="dash-row" data-on={(page !== undefined && page === s.page) || undefined} data-target={target} data-cursor={target ? "pointer" : undefined}>
                      <Icon size={18} strokeWidth={1.5} />
                      <span className="dash-row__label">{label}</span>
                    </div>
                  ))}
                </nav>
              </aside>

              <div className="dash-col">
                <header className="dash-top">
                  <span className="dash-crumbs">
                    <Swap id={s.page}>
                      <span className="dash-crumbs__trail">
                        {CRUMBS[s.page].map((crumb, i, all) => (
                          <span key={crumb} className="dash-crumb" data-last={i === all.length - 1 || undefined}>
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
                  <section className="dash-page" data-active={s.page === "scans" || undefined}>
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
                              ["In progress", running ? 1 : 0, false],
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
                            <div className="dt-cell dt-cell--review">Coverage</div>
                            <div className="dt-cell dt-cell--cost">Cost</div>
                            <div className="dt-cell dt-cell--time">Started</div>
                            <div className="dt-cell dt-cell--open" />
                          </div>

                          <Collapse open={s.added}>
                            <div className="dt-row" data-target="fresh" data-cursor="pointer">
                              <div className="dt-cell dt-cell--repo"><Repo scan={FRESH} /></div>
                              <div className="dt-cell dt-cell--status">
                                <Swap id={s.done ? "done" : "run"}>
                                  {s.done ? <Pill tone="success" dot>Succeeded</Pill> : <Pill tone="info" dot pulse>Running</Pill>}
                                </Swap>
                              </div>
                              <div className="dt-cell dt-cell--found">
                                <Swap id={s.done ? "done" : "run"}>
                                  {s.done ? <Findings found={FRESH.found} /> : <span className="dt-muted">In progress</span>}
                                </Swap>
                              </div>
                              <div className="dt-cell dt-cell--review">
                                <span className="dt-review">{FRESH.review}</span>
                                <span className="dt-origin">{MODEL}</span>
                              </div>
                              <div className="dt-cell dt-cell--cost"><Swap id={s.done ? "done" : "run"}>{s.done ? FRESH.cost : "-"}</Swap></div>
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
                    <>
                      <section className="dash-page dash-page--flush" data-active={s.page === "ship" || undefined}><ShipScene s={s} /></section>
                      <section className="dash-page dash-page--flush" data-active={s.page === "overview" || undefined}><OverviewScene s={s} /></section>
                      <section className="dash-page" data-active={s.page === "files" || undefined}><FilesScene s={s} /></section>
                      <section className="dash-page" data-active={s.page === "runners" || undefined}><RunnersScene s={s} /></section>
                    </>
                  )}
                </div>
              </div>

              <div className="dash-scrim" data-open={s.open || undefined} aria-hidden />
              <aside className="dash-sheet" data-open={s.open || undefined} aria-hidden>
                <button className="dash-sheet__close" tabIndex={-1} aria-hidden data-target="close" data-cursor="pointer"><X size={16} strokeWidth={1.5} /></button>
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
        );
      }}
    </Stage>
  );
}
