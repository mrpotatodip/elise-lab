import type { ReactNode } from "react";
import { ArrowUpRight, ChevronDown, ChevronRight, CircleCheck, Download, ExternalLink, GitBranch, Link2, Lock, Search, Settings } from "lucide-react";
import { Collapse, Scroll, Swap } from "./kit";
import { Pill } from "./Pill";
import type { S } from "./tour-state";

// The dashboard's other screens, drawn from their own components (repo-detail,
// scan-verdict-card, scan-overview, file-list, the Connections page). Every repository,
// number and file on them is made up; the page's caption says so.

// -----
// Shared: a page header and the dashboard's Card (muted header strip, inset body).
// -----
export function PageHead({ title, desc, badge, actions }: { title: string; desc?: string; badge?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="pg-head">
      <div className="pg-head__text">
        <div className="pg-head__title">
          <h3 className="dash-title">{title}</h3>
          {badge}
        </div>
        {desc && <p className="dash-desc">{desc}</p>}
      </div>
      {actions}
    </div>
  );
}

export function Card({ title, sub, right, flush, tight, className, children, ...rest }: { title: ReactNode; sub?: ReactNode; right?: ReactNode; flush?: boolean; tight?: boolean; className?: string; children: ReactNode } & Record<`data-${string}`, unknown>) {
  return (
    <div {...rest} className={`dl-card${className ? ` ${className}` : ""}`}>
      <div className="dl-card__head" data-tight={tight || undefined}>
        <div className="pg-card__titles">
          <span className="dl-card__title">{title}</span>
          {sub && <span className="pg-card__sub">{sub}</span>}
        </div>
        {right}
      </div>
      <div className="dl-card__body" data-flush={flush || undefined} data-pad={!flush || undefined}>{children}</div>
    </div>
  );
}

const Dots = ({ high = 0, medium = 0, low = 0 }: { high?: number; medium?: number; low?: number }) => (
  <span className="dt-found__row">
    {([["high", high], ["medium", medium], ["low", low]] as const).filter(([, n]) => n > 0).map(([tone, n]) => (
      <span key={tone} className="dt-sev"><i data-tone={tone} /><span className="dt-num">{n}</span> {tone}</span>
    ))}
  </span>
);

// -----
// Ready to ship?: the branch page and its verdict.
// -----
export function ShipScene({ s }: { s: S }) {
  return (
    <Scroll name="ship" bar="none" className="pg-scroll">
      <div className="pg-stack">
      <PageHead title="acme/billing-api" badge={<Pill tone="outline"><Lock size={12} strokeWidth={1.5} />Private</Pill>} actions={<span className="dash-btn">Scan this branch</span>} />
      <div className="pg-branch">
        <span className="pg-branch__row">
          <span className="pg-chip"><GitBranch size={14} strokeWidth={1.5} /><span className="dt-mono">main</span><ChevronDown size={14} strokeWidth={1.5} /></span>
          <span className="pg-sq"><ExternalLink size={16} strokeWidth={1.5} /></span>
        </span>
        <span className="pg-meta">
          <Pill tone="success" dot>Succeeded</Pill>
          <span>Last scan <span className="pg-time">Nov 12, 10:12 AM</span></span>
          <span aria-hidden>·</span>
          <span>7 scans of this branch</span>
        </span>
      </div>

      <Card
        tight
        title="Ready to ship?"
        sub="Nothing blocks this commit."
        right={<span className="pg-commit"><span className="pg-muted">Commit</span><span className="dt-mono">4f2a9c1</span><ExternalLink size={12} strokeWidth={1.5} /></span>}
      >
        <div className="pg-verdict">
          <div className="pg-alert">
            <CircleCheck size={20} strokeWidth={1.5} className="pg-alert__icon" />
            <div className="pg-alert__text">
              <h4 className="pg-alert__title">Passed the scan policy</h4>
              <p>Scanned enough times and nothing open is over the limits. An AI audit can miss problems, so this is advice and not proof that the commit is safe.</p>
            </div>
          </div>
          <div className="pg-again">
            <div>
              <div className="pg-again__title">Want another look at this exact commit?</div>
              <div className="pg-muted">Scans exactly 4f2a9c1, even if the branch has moved on. The worst result counts.</div>
            </div>
            <span className="pg-obtn">Run another scan of this commit</span>
          </div>
          <div className="pg-details">
            <div className="pg-details__sum" data-target="decide" data-cursor="pointer">
              <ChevronRight className="pg-details__chev" data-open={s.decide || undefined} size={16} strokeWidth={1.5} />
              <span className="pg-details__title">How this is decided</span>
              <span className="pg-muted">3 of 3 checks met.</span>
            </div>
            <Collapse open={s.decide}>
              <div className="pg-checks">
                <p className="pg-muted">A commit passes when all three are met. The answer uses every scan of this commit and the decisions your team recorded. A new push starts again at zero.</p>
                {[
                  ["At least 2 scans of this commit", "This commit has 2 scans."],
                  ["Earlier problems re-checked", "The scans checked every problem that was already open."],
                  ["Nothing open over the limits", "2 open, all within the limits. Allowed: 0 critical, 0 high, up to 5 medium."],
                ].map(([label, detail]) => (
                  <div key={label} className="pg-check">
                    <CircleCheck size={16} strokeWidth={1.5} />
                    <span><strong>{label}</strong> <span className="pg-muted">{detail}</span></span>
                  </div>
                ))}
              </div>
            </Collapse>
          </div>
        </div>
      </Card>
      </div>
    </Scroll>
  );
}

// -----
// Overview: what needs a decision, then budget, success rate and activity.
// -----
const WHERE = [
  { owner: "acme/", name: "billing-api", reason: "main · Verified and waiting for a decision", dots: { high: 1, medium: 2, low: 1 }, open: 4 },
  { owner: "acme/", name: "mobile-api", reason: "auth · Verified and waiting for a decision", dots: { medium: 2 }, open: 2 },
  { owner: "acme/", name: "web-app", reason: "main · Verified and waiting for a decision", dots: { low: 1 }, open: 1 },
  { owner: "acme/", name: "docs-site", reason: "main · Nothing is open", clear: true },
];
const RECENT = [
  { owner: "acme/", name: "billing-api", priv: true, ref: "main", sha: "4f2a9c1", tone: "success", label: "Succeeded", time: "Nov 12, 10:12 AM" },
  { owner: "acme/", name: "web-app", ref: "main", sha: "b81d03e", tone: "success", label: "Succeeded", time: "Nov 11, 4:40 PM" },
  { owner: "acme/", name: "docs-site", ref: "main", sha: "9c0e5a2", tone: "success", label: "Succeeded", time: "Nov 11, 11:05 AM" },
  { owner: "acme/", name: "mobile-api", priv: true, ref: "auth", sha: "e47b1f8", tone: "danger", label: "Failed", time: "Nov 10, 6:48 PM" },
] as const;
// Scans started per day for 14 days: [succeeded, failed, in progress].
const DAYS: [number, number, number][] = [[1, 0, 0], [2, 0, 0], [0, 0, 0], [3, 1, 0], [2, 0, 0], [4, 0, 0], [1, 0, 0], [0, 0, 0], [2, 1, 0], [3, 0, 0], [5, 1, 0], [2, 0, 0], [4, 0, 0], [3, 0, 1]];
const DAY_LABELS = ["30", "31", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];
const PEAK = 6;
const RING = 2 * Math.PI * 52;

export function OverviewScene({ s }: { s: S }) {
  return (
    <Scroll name="ov" bar="none" className="pg-scroll">
      <div className="pg-stack">
        <PageHead title="Overview" desc="What needs a decision across your repositories, and how your scans are going." />

        <div className="dl-card">
          <div className="pg-strip">
            {[
              ["Open findings", "7", <Dots key="d" high={1} medium={4} low={2} />, true],
              ["Came back", "0", "Nothing that was fixed has returned.", false],
              ["Needs a person", "0", "Every open finding was verified.", false],
              ["Not re-checked", "0", "The latest scans re-checked every open finding.", false],
            ].map(([label, n, note, lead]) => (
              <div key={String(label)} className="pg-cell">
                <h4 className="pg-cell__label">{label}</h4>
                <span className="pg-cell__n" data-lead={lead || undefined} data-zero={n === "0" || undefined}>{n}</span>
                <span className="pg-cell__note">{note}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="pg-two">
          <Card title="Where to look first" sub="Every repository, the most urgent first." right={<span className="pg-link">All repositories<ArrowUpRight size={14} strokeWidth={1.5} /></span>}>
            <div className="pg-list">
              {WHERE.map((r) => (
                <div key={r.name} className="pg-listrow">
                  <span className="pg-listrow__main">
                    <span className="dt-repo"><span className="dt-owner">{r.owner}</span><span>{r.name}</span></span>
                    <span className="dt-origin">{r.reason}</span>
                  </span>
                  {r.clear ? (
                    <span className="pg-clear"><CircleCheck size={16} strokeWidth={1.5} />Clear</span>
                  ) : (
                    <span className="pg-listrow__end"><Dots {...r.dots} /><span className="dt-strong">{r.open} open</span><ChevronRight size={16} strokeWidth={1.5} /></span>
                  )}
                </div>
              ))}
            </div>
          </Card>
          <Card title="Recent scans" sub="The latest scans, newest first." right={<span className="pg-link">View all<ArrowUpRight size={14} strokeWidth={1.5} /></span>}>
            <div className="pg-list">
              {RECENT.map((r) => (
                <div key={r.sha} className="pg-listrow">
                  <span className="pg-listrow__main">
                    <span className="dt-repo"><span className="dt-owner">{r.owner}</span><span>{r.name}</span>{"priv" in r && <Lock className="dt-lock" size={12} strokeWidth={1.5} />}</span>
                    <span className="dt-origin"><span className="dt-mono">{r.ref}</span><span className="dt-mono">{r.sha}</span></span>
                  </span>
                  <span className="pg-listrow__stack"><Pill tone={r.tone} dot>{r.label}</Pill><span className="dt-origin">{r.time}</span></span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="pg-three" data-target="ov-3">
          <Card title="Monthly budget" sub="November 2026.">
            <div className="pg-budget">
              <div className="pg-budget__top"><span className="pg-money">$12.40</span><span className="pg-muted">of $50.00</span></div>
              <span className="pg-obtn pg-obtn--sm"><Settings size={16} strokeWidth={1.5} />Manage budget</span>
              <div className="pg-bar"><i style={{ width: s.live ? "25%" : "0%" }} /></div>
              <dl className="pg-dl">
                {[["Remaining", "$37.60"], ["Held by running scans", "$0.00"], ["Scans this month", "9"], ["Tokens", "1.2M"]].map(([k, v]) => (
                  <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
                ))}
              </dl>
            </div>
          </Card>
          <Card title="Success rate" sub="Finished scans that completed.">
            <div className="pg-rate">
              <div className="pg-ring">
                <svg viewBox="0 0 128 128" width="160" height="160" aria-hidden>
                  <circle cx="64" cy="64" r="52" fill="none" stroke="var(--muted)" strokeWidth="12" />
                  <circle className="pg-ring__arc" cx="64" cy="64" r="52" fill="none" stroke="var(--mark-success)" strokeWidth="12" strokeLinecap="round" strokeDasharray={`${s.live ? RING * 0.89 : 0} ${RING}`} transform="rotate(-90 64 64)" />
                </svg>
                <span className="pg-ring__n"><strong>89</strong><span>percent</span></span>
              </div>
              <div className="pg-rate__figs">
                <span><span className="pg-muted">Succeeded</span><b data-tone="success">8</b></span>
                <span><span className="pg-muted">Failed</span><b data-tone="danger">1</b></span>
              </div>
            </div>
          </Card>
          <Card className="pg-three__wide" title="Scan activity" sub="Scans started per day, last 14 days.">
            <div className="pg-activity">
              <div className="pg-legend">
                <span><i style={{ background: "var(--mark-success)" }} />Succeeded</span>
                <span><i style={{ background: "var(--mark-critical)" }} />Failed</span>
                <span><i style={{ background: "var(--mark-info)" }} />In progress</span>
              </div>
              <div className="pg-plot">
                <div className="pg-axis"><span>6</span><span>3</span><span>0</span></div>
                <div className="pg-bars">
                  {DAYS.map(([ok, bad, run], i) => (
                    <div key={i} className="pg-bar-col">
                      <div className="pg-stackbar" style={{ transitionDelay: `${i * 40}ms` }} data-live={s.live || undefined}>
                        {run > 0 && <i style={{ height: `${(run / PEAK) * 100}%`, background: "var(--mark-info)" }} />}
                        {bad > 0 && <i style={{ height: `${(bad / PEAK) * 100}%`, background: "var(--mark-critical)" }} />}
                        {ok > 0 && <i style={{ height: `${(ok / PEAK) * 100}%`, background: "var(--mark-success)" }} />}
                        {ok + bad + run === 0 && <i className="pg-empty" />}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="pg-days">{DAY_LABELS.map((d, i) => <span key={i}>{i % 2 === 1 ? d : ""}</span>)}</div>
            </div>
          </Card>
        </div>
      </div>
    </Scroll>
  );
}

// -----
// Files: the written reports, filtered by type.
// -----
const FILES = [
  { type: "report", label: "Report", name: "REPORT.md", repo: "billing-api", priv: true, status: "Succeeded", size: "4.2 KB", saved: "Nov 12, 10:12 AM" },
  { type: "detail", label: "Finding details", name: "FINDINGS-DETAIL.md", repo: "billing-api", priv: true, status: "Succeeded", size: "12.8 KB", saved: "Nov 12, 10:12 AM" },
  { type: "hand", label: "To check by hand", name: "NEEDS-VALIDATION.md", repo: "billing-api", priv: true, status: "Succeeded", size: "1.1 KB", saved: "Nov 12, 10:12 AM" },
  { type: "report", label: "Report", name: "REPORT.md", repo: "web-app", status: "Succeeded", size: "2.6 KB", saved: "Nov 11, 4:40 PM" },
  { type: "detail", label: "Finding details", name: "FINDINGS-DETAIL.md", repo: "web-app", status: "Succeeded", size: "3.9 KB", saved: "Nov 11, 4:40 PM" },
  { type: "hand", label: "To check by hand", name: "NEEDS-VALIDATION.md", repo: "web-app", status: "Succeeded", size: "812 B", saved: "Nov 11, 4:40 PM" },
  { type: "report", label: "Report", name: "REPORT.md", repo: "docs-site", status: "Succeeded", size: "1.4 KB", saved: "Nov 11, 11:05 AM" },
  { type: "detail", label: "Finding details", name: "FINDINGS-DETAIL.md", repo: "docs-site", status: "Succeeded", size: "1.0 KB", saved: "Nov 11, 11:05 AM" },
  { type: "hand", label: "To check by hand", name: "NEEDS-VALIDATION.md", repo: "docs-site", status: "Succeeded", size: "624 B", saved: "Nov 11, 11:05 AM" },
] as const;

export function FilesScene({ s }: { s: S }) {
  const report = s.tab === "report";
  const tabs = [["all", "All files", 9], ["report", "Report", 3], ["detail", "Finding details", 3], ["hand", "To check by hand", 3]] as const;
  return (
    <>
      <PageHead title="Files" desc="The reports your scans wrote, newest first. Download a file, or open its scan to read the findings." />
      <Card title="All files" right={<span className="dl-card__count"><Swap id={report ? 3 : 9}>{report ? "3 files" : "9 files"}</Swap></span>} flush>
        <div className="pg-filters">
          <div className="dash-tabs">
            {tabs.map(([id, label, n]) => (
              <span key={id} className="dash-tab" data-on={(id === "all" ? !report : id === "report" ? report : false) || undefined} data-target={id === "report" ? "tab-report" : undefined} data-cursor={id === "report" ? "pointer" : undefined}>
                {label}<span className="dash-tab__n">{n}</span>
              </span>
            ))}
          </div>
          <p className="pg-hint"><Swap id={report ? "r" : "a"}>{report ? "The written summary of the audit. Dates and times on this page are in UTC." : "Dates and times on this page are in UTC."}</Swap></p>
          <div className="pg-fields">
            <label><span className="pg-muted">Repository</span><span className="pg-select">All repositories<ChevronDown size={16} strokeWidth={1.5} /></span></label>
            <label><span className="pg-muted">From (UTC)</span><span className="pg-select pg-select--date">mm/dd/yyyy</span></label>
            <label><span className="pg-muted">To (UTC)</span><span className="pg-select pg-select--date">mm/dd/yyyy</span></label>
            <span className="dash-search"><Search size={16} strokeWidth={1.5} aria-hidden /><span>Search repositories, press Enter</span></span>
          </div>
        </div>
        <div className="dt dt--files">
          <div className="dt-row dt-row--head">
            <div className="dt-cell">File</div><div className="dt-cell">Repository</div><div className="dt-cell">Branch</div><div className="dt-cell">Scan status</div><div className="dt-cell dt-cell--cost">Size</div><div className="dt-cell">Saved (UTC)</div><div className="dt-cell" />
          </div>
          {FILES.map((f, i) => (
            <Collapse key={i} open={!report || f.type === "report"}>
              <div className="dt-row">
                <div className="dt-cell"><span className="dt-review">{f.label}</span><span className="dt-origin">{f.name}</span></div>
                <div className="dt-cell"><span className="dt-repo"><span className="dt-owner">acme/</span><span>{f.repo}</span>{"priv" in f && <Lock className="dt-lock" size={12} strokeWidth={1.5} />}</span></div>
                <div className="dt-cell dt-muted">main</div>
                <div className="dt-cell"><Pill tone="success" dot>{f.status}</Pill></div>
                <div className="dt-cell dt-cell--cost">{f.size}</div>
                <div className="dt-cell dt-cell--time">{f.saved}</div>
                <div className="dt-cell"><span className="pg-obtn pg-obtn--sm"><Download size={16} strokeWidth={1.5} />Download</span></div>
              </div>
            </Collapse>
          ))}
        </div>
      </Card>
    </>
  );
}

// -----
// Connections: GitHub, and the repositories Elise can read through it.
// -----
const READABLE = [
  { name: "billing-api", priv: true },
  { name: "web-app" },
  { name: "docs-site" },
  { name: "mobile-api", priv: true },
  { name: "status-page" },
];

export function ConnectScene({ s }: { s: S }) {
  return (
    <>
      <PageHead title="Connections" desc="Where Elise reads your code from. Connect GitHub to scan your private repositories; public ones need no connection." />
      <Card title="GitHub" sub="Elise reads the repositories you chose. It can read code and cannot change it." right={<span className="pg-obtn pg-obtn--sm"><Link2 size={14} strokeWidth={1.5} />Connect another account</span>} flush>
        <div className="pg-account">
          <span className="pg-account__who">
            <span className="dt-strong">acme-inc</span>
            <span className="dt-origin">All repositories · connected Nov 4, 2026</span>
          </span>
          <span className="pg-account__end">
            <Pill tone="success">Connected</Pill>
            <span className="pg-link"><ExternalLink size={14} strokeWidth={1.5} />Manage on GitHub</span>
            <span className="pg-danger">Disconnect</span>
          </span>
        </div>
      </Card>
      <Card
        title="Repositories Elise can read"
        sub="What the connections above let Elise scan. To add or remove one, use Manage on GitHub. Pick one when you add a repository, or when you start a scan."
        right={<span className="dl-card__count"><Swap id={s.repos}>{s.repos === 1 ? "1 repository" : `${s.repos} repositories`}</Swap></span>}
        flush
      >
        <div className="pg-readable">
          {READABLE.map((r, i) => (
            <Collapse key={r.name} open={s.repos > i}>
              <div className="pg-readable__row">
                <span className="dt-repo"><span className="dt-owner">acme/</span><span>{r.name}</span></span>
                {r.priv && <Pill tone="outline"><Lock size={12} strokeWidth={1.5} />Private</Pill>}
              </div>
            </Collapse>
          ))}
        </div>
      </Card>
    </>
  );
}
