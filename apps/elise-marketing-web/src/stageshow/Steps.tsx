import { ChevronDown, ChevronRight, Copy, ExternalLink, GitBranch, Globe, Link2, LoaderCircle, Lock, Search, X } from "lucide-react";
import { Collapse, Roll, Stage, Swap, type Act } from "./kit";
import { DASHBOARD_LOOK } from "./look";
import { Pill } from "./Pill";
import { ACT_LABEL, ACTS, ENTRIES, FINDINGS, Phase, STEP_MS, countOf, created } from "./RunnerScene";
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
// The dashboard's provider list and the Runner a new scan picks up first, as scan-new-form.tsx shows them.
const PROVIDERS = ["GitHub", "GitLab", "GitLab server", "Upload"] as const;
const RUNNER_NAME = "maya-macbook";
const COVERAGE = ["Focused", "Balanced", "Exhaustive"] as const;

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
  // scan-new-search.tsx: the row names the repository, a note says how it was last scanned, and the
  // right-hand tag says Public or Private.
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
    <Stage {...SIZE} height={740} initial={{ pasted: false, picked: false, starting: false }} poster={{ pasted: true, picked: true, starting: false }} script={connectScript} play="once" tokens={DASHBOARD_LOOK} cursor={{ at: { wide: { x: 560, y: 380 }, compact: { x: 250, y: 300 } }, style: "arrow" }} className="sv dl">
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
              <div className="sv-radios sv-radios--four" role="presentation">
                {PROVIDERS.map((provider, i) => (
                  <div key={provider} className="sv-radio sv-radio--chip" data-on={i === 0 || undefined}><span className="sv-radio__t">{provider}</span></div>
                ))}
              </div>
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
                      <span className="sv-radio__d">Capital letters count. A branch, tag or commit of the repository.</span>
                    </div>
                    <div className="sv-field">
                      <span className="sv-field__label">Coverage</span>
                      <div className="sv-radios sv-radios--three" role="presentation">
                        {COVERAGE.map((option, i) => (
                          <div key={option} className="sv-radio sv-radio--chip" data-on={i === 1 || undefined}><span className="sv-radio__t">{option}</span></div>
                        ))}
                      </div>
                      <span className="sv-radio__d">Recommended for most repositories. Good coverage without the longest run time.</span>
                    </div>
                    <div className="sv-customize">
                      {[RUNNER_NAME, "Claude Sonnet 5.5", "High effort"].map((chip) => <span key={chip} className="sv-pillchip">{chip}</span>)}
                      <span className="sv-customize__more">Customize<ChevronDown size={14} strokeWidth={1.5} /></span>
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
                    <RepoRow icon="lock" name="acme/example-app" note="Last scan succeeded" tag="Private" />
                  </div>
                )}
              </Swap>
            </div>
            <footer className="sv-dialog__foot">
              <span className="sv-dialog__hint">Your Runner clones with this computer&apos;s git login. If a private repository fails, run `elise-runner doctor`.</span>
              <span className="sv-dialog__row">
                <span className="sv-dialog__budget">{`This audit runs on ${RUNNER_NAME}'s own Claude. Elise charges nothing per audit. It stops at its own spend limit and shows what it would have cost.`}</span>
                <span className="sv-btn sv-btn--outline">Cancel</span>
                <span className="sv-btn" data-off={!s.picked || undefined} aria-disabled={!s.picked || undefined} data-target="start" data-cursor="pointer"><Swap id={s.starting ? "s" : "a"}>{s.starting ? "Starting…" : "Start audit"}</Swap></span>
              </span>
            </footer>
          </div>
        </>
      )}
    </Stage>
  );
}

// -----
// 2. The Runner audits the code: the scan page while it runs, the Trace by Phase (Recon, Hunt,
//    Check, Report, as scan-trace.tsx shows them), then Succeeded.
// -----
type Audit = { lines: number; step: number; done: boolean; details: boolean };
// Phase i starts at line 2 + 2i and ends at line 3 + 2i, as in the hero (RunnerScene).
const ELAPSED = ["Running for 41s", "Running for 1m 53s", "Running for 2m 42s", "Running for 3m 04s"];

async function auditScript(a: Act<Audit>) {
  await a.wait(900);
  for (let i = 0; i < ACTS.length; i++) {
    await a.set({ lines: 2 + 2 * i, step: 0 });
    for (let n = 1; n <= ACTS[i].length; n++) {
      await a.wait(STEP_MS[i]);
      await a.set({ step: n });
    }
    await a.set({ lines: 3 + 2 * i, step: 0 });
  }
  await a.wait(700);
  await a.set({ done: true });
  await a.wait(1000);
  // The finished scan: Run details opens on what the scan ran with.
  await a.click("details");
  await a.set({ details: true });
  await a.wait(2600);
}

export function AuditStep() {
  return (
    <Stage {...SIZE} height={660} initial={{ lines: 0, step: 0, done: false, details: false }} poster={{ lines: 9, step: 0, done: true, details: true }} script={auditScript} play="once" tokens={DASHBOARD_LOOK} cursor={{ at: { wide: { x: 600, y: 300 }, compact: { x: 250, y: 300 } }, style: "arrow" }} className="sv dl rn">
      {(s) => {
        const { done } = s;
        // The newest Phase started, and the newest entry in it: the bar at the top of the Trace.
        const now = s.lines >= 2 ? Math.min(ACTS.length - 1, Math.floor((s.lines - 2) / 2)) : -1;
        const made = now >= 0 ? created(now, s.step) : 0;
        const newest = made > 0 ? ENTRIES[now][made - 1] : undefined;
        const newestCount = newest ? countOf(newest, s.step) : 0;
        return (
          <>
            <Sky />
            <div className="sv-page">
              <div className="sv-pagehead">
                <h4 className="sv-h1"><span className="sv-owner">acme/</span>example-app</h4>
                <Swap id={done ? "again" : "stop"}><span className="sv-btn sv-btn--outline sv-hide-compact">{done ? "Scan this branch again" : "Stop"}</span></Swap>
              </div>
              <div className="sv-branch">
                <span className="sv-chip"><GitBranch size={16} strokeWidth={1.5} /><span className="sv-mono">main</span><ChevronRight size={16} strokeWidth={1.5} /></span>
                <span className="sv-sq"><ExternalLink size={16} strokeWidth={1.5} /></span>
              </div>
              <div className="sv-status">
                <Swap id={done ? "d" : "r"}>{done ? <Pill tone="success" dot>Succeeded</Pill> : <Pill tone="info" dot pulse>Running</Pill>}</Swap>
                <span>Started <span className="sv-num">Nov 12, 10:12 AM</span></span>
                <span aria-hidden>·</span>
                <Swap id={done ? "took" : Math.max(now, 0)}>{done ? "Took 3m 12s" : ELAPSED[Math.max(now, 0)]}</Swap>
                <span aria-hidden>·</span>
                <span>Coverage Balanced</span>
                <span aria-hidden>·</span>
                <span>Commit <span className="sv-mono">4f2a9c1</span></span>
              </div>
              <Collapse open={!done}>
                <div className="sv-alert">
                  <LoaderCircle className="sv-spin" size={16} strokeWidth={1.5} />
                  <span className="sv-alert__text">
                    <span className="sv-alert__title">Scanning.</span>
                    <span>A scan usually takes a few minutes. This page updates by itself. You can leave and come back.</span>
                  </span>
                </div>
              </Collapse>
              <div className="dl-card">
                <div className="dl-card__head">
                  <span className="sv-cardtitleblock">
                    <span className="dl-card__title">Trace</span>
                    <span className="sv-cardsub sv-cardsub--tight">{done ? "What the scan did, by phase." : "What the scan is doing now."}</span>
                  </span>
                </div>
                <Collapse open={!done}>
                  <div className="dl-card__body sv-tracebody">
                    <div className="sp-trace">
                      <div className="sp-now">
                        <span className="sp-ping"><i /><i /></span>
                        <span className="sp-now__label">
                          <Swap id={newest ? `${now}-${newest.from}` : "none"}>{newest ? ACT_LABEL[newest.act].label : "Waiting for the first entries"}</Swap>
                          {newest && newestCount > 1 && <span className="sp-times">×{newestCount}</span>}
                          {newest && <span className="sp-time">just now</span>}
                        </span>
                      </div>
                      <ol className="sp-phases">
                        {[3, 2, 1, 0].map((i) => <Phase key={i} i={i} lines={s.lines} step={s.step} done={done} />)}
                      </ol>
                    </div>
                  </div>
                </Collapse>
              </div>
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
                      {[["Kind of review", "Full audit, balanced"], ["Model", "Claude Sonnet 5.5"], ["Effort", "High"]].map(([k, v]) => (
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
// 3. Read the report: the summary and the findings of a finished scan (scan-summary.tsx and
//    scan-findings-table.tsx). The findings are the hero's, so the two pictures tell one story.
// -----
type Report = { shown: number; nums: boolean };
const SEVERITY_LINE = [["high", "1 high"], ["medium", "2 medium"], ["low", "1 low"]] as const;

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
    <Stage {...SIZE} height={860} initial={{ shown: 0, nums: false }} poster={{ shown: 4, nums: true }} script={reportScript} play="once" tokens={DASHBOARD_LOOK} cursor={{ at: { wide: { x: 620, y: 150 }, compact: { x: 250, y: 150 } }, style: "arrow" }} className="sv dl">
      {(s) => (
        <>
          <Sky />
          <div className="sv-page">
            <div className="dl-card sv-summary">
              <div className="sv-cell">
                <span className="sv-cell__label">What it found</span>
                <span className="sv-cell__n" data-lead><Roll>{s.nums ? "4" : "0"}</Roll><span className="sv-cell__unit">findings</span></span>
                <span className="sv-dots">
                  {SEVERITY_LINE.map(([tone, text]) => <span key={tone}><i data-tone={tone} />{text}</span>)}
                </span>
                <span className="sv-lines">
                  <span><span>Confirmed by the scan</span><b>3</b></span>
                  <span><span>Needs a person to check by hand</span><b>1</b></span>
                </span>
                <span className="sv-cell__note">1 finding is likely but unverified. Check by hand before acting.</span>
              </div>
              <div className="sv-cell">
                <span className="sv-cell__label">Compared with earlier scans</span>
                <span className="sv-cell__n sv-cell__n--word">None</span>
                <span className="sv-cell__note">This is the first scan of this branch, so there is nothing to compare with yet.</span>
              </div>
              <div className="sv-cell">
                <span className="sv-cell__label">What it would cost</span>
                <span className="sv-cell__n sv-cell__n--word"><Roll>{s.nums ? "$3.24" : "$0.00"}</Roll></span>
                <span className="sv-lines">
                  <span><span>Took</span><b>3m 12s</b></span>
                  <span><span>Tokens</span><b>1.8M</b></span>
                  <span><span>Turns</span><b>41</b></span>
                </span>
                <span className="sv-cell__note">Estimated at list price. It ran on maya-macbook, so nothing was billed.</span>
              </div>
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
                  <div className="sv-trow sv-trow--head"><span>Severity</span><span>Finding</span><span className="sv-hide-compact">Where</span><span /></div>
                  {FINDINGS.map((f, i) => (
                    <Collapse key={f.title} open={s.shown > i}>
                      <div className="sv-trow" data-target={i === 0 ? "row1" : undefined} data-cursor={i === 0 ? "pointer" : undefined}>
                        <span className="sv-sev">
                          <Pill tone={f.tone} dot>{f.severity}</Pill>
                          {f.needsPerson && <Pill tone="warning">Needs a person</Pill>}
                        </span>
                        <span className="sv-ftitle">{f.title}</span>
                        <span className="sv-mono sv-where sv-hide-compact"><span>{f.file}:{f.line}</span><span className="sv-where__folder">{f.folder}</span></span>
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
