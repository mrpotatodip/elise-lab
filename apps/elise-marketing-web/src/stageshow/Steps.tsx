import { ArrowLeft, ChevronDown, ChevronRight, Copy, ExternalLink, GitBranch, Globe, Link2, LoaderCircle, Lock, Search, X } from "lucide-react";
import { Collapse, Roll, Stage, Swap, type Act } from "./kit";
import { DASHBOARD_LOOK } from "./look";
import { Pill, type PillTone } from "./Pill";
import "./daylight.css";
import "./steps.css";

// Three pictures, one per step of "How it works", drawn from the dashboard's own screens: the
// New scan dialog, a scan page while it runs, and a finished scan's report. Each plays once
// when it scrolls into view and ends on its payoff, which is also its still under reduced
// motion. The repository and findings are made up, and the page's text says so.

const SIZE = { width: 760, height: 540, compact: { below: 560, width: 358, height: 440 } } as const;

function Sky() {
  return <div className="sv-sky" aria-hidden />;
}

// -----
// 1. Connect a repository: the New scan dialog, a link is pasted, the audit is started.
// -----
type Connect = { pasted: boolean; picked: boolean; starting: boolean };
const LINK = "github.com/acme/web-app";

async function connectScript(a: Act<Connect>) {
  await a.wait(1000);
  await a.key("cmd+v");
  await a.set({ pasted: true });
  await a.wait(1000);
  await a.click("linkrow");
  await a.set({ picked: true });
  await a.wait(1600);
  await a.click("start");
  await a.set({ starting: true });
  await a.wait(2200);
}

function RepoRow({ icon, name, note, tag, target }: { icon: "globe" | "lock" | "link"; name: string; note: string; tag: string; target?: string }) {
  const Icon = icon === "globe" ? Globe : icon === "lock" ? Lock : Link2;
  return (
    <div className="sv-row" data-target={target} data-cursor={target ? "pointer" : undefined}>
      <span className="sv-tile-icon"><Icon size={16} strokeWidth={1.5} /></span>
      <span className="sv-row__text"><span className="sv-row__name">{name}</span><span className="sv-row__note">{note}</span></span>
      <span className="sv-row__tag">{tag}</span>
    </div>
  );
}

export function ConnectStep() {
  return (
    <Stage {...SIZE} initial={{ pasted: false, picked: false, starting: false }} poster={{ pasted: true, picked: true, starting: false }} script={connectScript} play="once" tokens={DASHBOARD_LOOK} cursor={{ at: { wide: { x: 560, y: 380 }, compact: { x: 250, y: 300 } }, style: "arrow" }} className="sv dl">
      {(s) => (
        <>
          <Sky />
          <div className="sv-scrim" aria-hidden />
          <div className="sv-dialog">
            <header className="sv-dialog__head">
              <h4>Start a security audit</h4>
              <X className="sv-dialog__x" size={16} strokeWidth={1.5} />
            </header>
            <div className="sv-dialog__body">
              <div className="sv-search">
                <Search size={16} strokeWidth={1.5} />
                <Swap id={s.pasted ? "v" : "p"}>{s.pasted ? <span className="sv-search__v">{LINK}</span> : <span className="sv-search__p">Search your repositories or paste a GitHub link</span>}</Swap>
              </div>
              <Swap id={s.picked ? "c" : s.pasted ? "b" : "a"}>
                {s.picked ? (
                  <div className="sv-card-view">
                    <div className="sv-repocard">
                      <span className="sv-tile-icon"><Link2 size={16} strokeWidth={1.5} /></span>
                      <span className="sv-row__text"><span className="sv-row__name">acme/web-app</span><span className="sv-row__note">Public repository</span></span>
                      <span className="sv-ghost">Change</span>
                    </div>
                    <div className="sv-field">
                      <span className="sv-field__label">Branch, tag or commit (optional)</span>
                      <span className="sv-input sv-input--mono">Leave empty for the default branch</span>
                    </div>
                    <div className="sv-radios">
                      <div className="sv-radio" data-on>
                        <i /><span className="sv-radio__t">Quick review</span>
                        <span className="sv-radio__d">A fast first look for common security mistakes.</span>
                      </div>
                      <div className="sv-radio">
                        <i /><span className="sv-radio__t">Full audit</span>
                        <span className="sv-radio__d">Deeper, with every finding checked independently. Takes longer and uses more budget.</span>
                      </div>
                    </div>
                  </div>
                ) : s.pasted ? (
                  <div className="sv-list"><RepoRow icon="link" name="Scan acme/web-app" note="Public repository, from the link" tag="Public" target="linkrow" /></div>
                ) : (
                  <div className="sv-list">
                    <span className="sv-group">Public</span>
                    <RepoRow icon="globe" name="acme/web-app" note="Last scan succeeded" tag="Public" />
                    <RepoRow icon="globe" name="acme/docs-site" note="Not scanned yet" tag="Public" />
                    <span className="sv-group">Private</span>
                    <RepoRow icon="lock" name="acme/billing-api" note="Private, connected on GitHub" tag="Private" />
                  </div>
                )}
              </Swap>
            </div>
            <footer className="sv-dialog__foot">
              <span className="sv-dialog__budget">$18.40 of this month&apos;s budget is left. Each audit stops at its own spend limit.</span>
              <span className="sv-btn sv-btn--outline">Cancel</span>
              <span className="sv-btn" data-off={!s.picked || undefined} aria-disabled={!s.picked || undefined} data-target="start" data-cursor="pointer"><Swap id={s.starting ? "s" : "a"}>{s.starting ? "Starting…" : "Start audit"}</Swap></span>
            </footer>
          </div>
        </>
      )}
    </Stage>
  );
}

// -----
// 2. Elise audits the code: the scan page while it runs, then Succeeded.
// -----
type Audit = { step: 0 | 1 | 2 | 3; details: boolean };
const STEP_TITLE = ["Cloning the repository", "Reading the code for security issues", "Saving the report"];
const STEP_NOTE = ["Downloading the code to scan.", "This is the longest step.", "Almost done."];
const ELAPSED = ["Running for 12s", "Running for 1m 24s", "Running for 2m 38s", "Took 2m 41s"];

async function auditScript(a: Act<Audit>) {
  await a.wait(1100);
  await a.set({ step: 1 });
  await a.wait(1800);
  await a.set({ step: 2 });
  await a.wait(1800);
  await a.set({ step: 3 });
  await a.wait(1100);
  // The finished scan: Run details opens on what the scan ran with.
  await a.click("details");
  await a.set({ details: true });
  await a.wait(2600);
}

export function AuditStep() {
  return (
    <Stage {...SIZE} height={480} initial={{ step: 0, details: false }} poster={{ step: 3, details: true }} script={auditScript} play="once" tokens={DASHBOARD_LOOK} cursor={{ at: { wide: { x: 600, y: 300 }, compact: { x: 250, y: 300 } }, style: "arrow" }} className="sv dl">
      {(s) => {
        const done = s.step === 3;
        return (
          <>
            <Sky />
            <div className="sv-page">
              <span className="sv-back"><ArrowLeft size={14} strokeWidth={1.5} />All scans</span>
              <div className="sv-pagehead">
                <h4 className="sv-h1"><span className="sv-owner">acme/</span>web-app</h4>
                <span className="sv-btn sv-btn--outline sv-hide-compact">Scan this branch again</span>
              </div>
              <div className="sv-branch">
                <span className="sv-chip"><GitBranch size={16} strokeWidth={1.5} /><span className="sv-mono">main</span><ChevronRight size={16} strokeWidth={1.5} /></span>
                <span className="sv-sq"><ExternalLink size={16} strokeWidth={1.5} /></span>
              </div>
              <div className="sv-status">
                <Swap id={done ? "d" : "r"}>{done ? <Pill tone="success" dot>Succeeded</Pill> : <Pill tone="info" dot pulse>Running</Pill>}</Swap>
                <span>Started <span className="sv-num">Nov 12, 10:12 AM</span></span>
                <span aria-hidden>·</span>
                <Swap id={s.step}>{ELAPSED[s.step]}</Swap>
                <span aria-hidden>·</span>
                <Swap id={done ? "c" : "b"}>{done ? <span className="sv-mono sv-commit">Read commit a1b2c3d<ExternalLink size={12} strokeWidth={1.5} /></span> : "Reading the default branch"}</Swap>
              </div>
              <Collapse open={!done}>
                <div className="sv-alert">
                  <LoaderCircle className="sv-spin" size={16} strokeWidth={1.5} />
                  <span className="sv-alert__text">
                    <Swap id={s.step} className="sv-alert__title">{STEP_TITLE[Math.min(s.step, 2)]}</Swap>
                    <Swap id={s.step}>{STEP_NOTE[Math.min(s.step, 2)]} This page updates by itself. You can leave and come back.</Swap>
                  </span>
                </div>
              </Collapse>
              <div className="dl-card">
                <div className="dl-card__head" data-target="details" data-cursor="pointer">
                  <span className="sv-cardtitleblock">
                    <span className="sv-cardtitle"><span>Run details</span><ChevronDown className="sv-chev" data-open={s.details || undefined} size={16} strokeWidth={1.5} /></span>
                    <span className="sv-cardsub sv-cardsub--tight">The kind of review, the model and the effort this scan ran with.</span>
                  </span>
                </div>
                <Collapse open={s.details}>
                  <div className="dl-card__body">
                    <dl className="sv-terms">
                      {[["Kind of review", "Quick review"], ["Model", "Claude Sonnet 5.5"], ["Effort", "High"]].map(([k, v]) => (
                        <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
                      ))}
                    </dl>
                  </div>
                </Collapse>
              </div>
            </div>
          </>
        );
      }}
    </Stage>
  );
}

// -----
// 3. Read the report: the summary and the findings of a finished scan.
// -----
type Report = { shown: number; nums: boolean };
const FINDINGS: { sev: PillTone; label: string; title: string; where: string; status: string; tone: PillTone }[] = [
  { sev: "high", label: "High", title: "Open redirect at login", where: "src/routes/login.ts:42", status: "Confirmed", tone: "success" },
  { sev: "medium", label: "Medium", title: "Token in the request log", where: "src/lib/log.ts:17", status: "Confirmed", tone: "success" },
  { sev: "low", label: "Low", title: "Cookie missing SameSite", where: "src/lib/session.ts:9", status: "Confirmed", tone: "success" },
  { sev: "outline", label: "Unrated", title: "SQL from request input", where: "src/db/search.ts:88", status: "Needs a person", tone: "warning" },
];

async function reportScript(a: Act<Report>) {
  await a.wait(900);
  await a.set({ nums: true });
  await a.wait(900);
  for (let i = 1; i <= FINDINGS.length; i++) {
    await a.set({ shown: i });
    await a.wait(320);
  }
  await a.wait(500);
  await a.move({ at: "row1", x: 0.9, y: 0.5 });
  await a.wait(2600);
}

export function ReportStep() {
  return (
    <Stage {...SIZE} height={700} initial={{ shown: 0, nums: false }} poster={{ shown: 4, nums: true }} script={reportScript} play="once" tokens={DASHBOARD_LOOK} cursor={{ at: { wide: { x: 620, y: 150 }, compact: { x: 250, y: 150 } }, style: "arrow" }} className="sv dl">
      {(s) => (
        <>
          <Sky />
          <div className="sv-page">
            <div className="dl-card sv-summary">
              {[
                ["Findings", "4", "1 high, 1 medium, 1 low confirmed.", true],
                ["Needs a person", "1", "1 finding is likely but unverified. Check by hand before acting.", false],
                ["New since last scan", "2", "2 carried over from earlier scans and seen again.", false],
                ["What it cost", "$0.42", "Took 2m 41s, 186K tokens, 38 turns. Estimated at list price.", false],
              ].map(([label, value, note, lead]) => (
                <div key={String(label)} className="sv-cell">
                  <span className="sv-cell__label">{label}</span>
                  <span className="sv-cell__n" data-lead={lead || undefined}><Roll>{s.nums ? String(value) : "0"}</Roll></span>
                  <span className="sv-cell__note">{note}</span>
                </div>
              ))}
            </div>
            <div className="dl-card">
              <div className="dl-card__head">
                <span className="sv-cardtitleblock">
                  <span className="dl-card__title">Findings</span>
                  <span className="sv-cardsub sv-cardsub--tight">4 findings: 3 confirmed, 1 need a person to check. Open a row for the impact, evidence and fix.</span>
                </span>
              </div>
              <div className="dl-card__body">
                <div className="sv-toolbar"><span className="sv-btn sv-btn--outline sv-btn--sm"><Copy size={14} strokeWidth={1.5} />Copy all 4 findings for coding agent</span></div>
                <div className="sv-table">
                  <div className="sv-trow sv-trow--head"><span>Severity</span><span>Finding</span><span className="sv-hide-compact">Where</span><span className="sv-hide-compact">Status</span><span /></div>
                  {FINDINGS.map((f, i) => (
                    <Collapse key={f.title} open={s.shown > i}>
                      <div className="sv-trow" data-target={i === 0 ? "row1" : undefined} data-cursor={i === 0 ? "pointer" : undefined}>
                        <span><Pill tone={f.sev} dot={f.sev !== "outline"}>{f.label}</Pill></span>
                        <span className="sv-ftitle">{f.title}</span>
                        <span className="sv-mono sv-where sv-hide-compact">{f.where}</span>
                        <span className="sv-hide-compact"><Pill tone={f.tone}>{f.status}</Pill></span>
                        <ChevronRight size={16} strokeWidth={1.5} />
                      </div>
                    </Collapse>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </Stage>
  );
}
