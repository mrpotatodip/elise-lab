use crate::access;
use crate::commands;
use crate::json;
use crate::repos::{day, print_table};
use crate::store::Store;
use crate::Exit;
use elise_runner_core::cli_scans::{self, ScanDetail, Spend, Summary};
use elise_runner_core::engine_client::{Denied, EngineClient, Scope};
use elise_runner_core::scan;
use elise_runner_core::scan_ref::{self, ScanRow};
use serde_json::{json, Value};

const LIST_LIMIT: usize = 100;

pub fn take_repo(rest: &[String]) -> Result<(Vec<String>, Option<String>), String> {
    let mut kept = Vec::new();
    let mut repo = None;
    let mut items = rest.iter();
    while let Some(item) = items.next() {
        if item != "--repo" && !item.starts_with("--repo=") {
            kept.push(item.clone());
            continue;
        }
        let value = if item == "--repo" { items.next().map(String::as_str) } else { item.strip_prefix("--repo=") };
        match value {
            Some(value) if !value.is_empty() && !value.starts_with("--") => repo = Some(value.to_string()),
            _ => return Err("`--repo` takes a repo: a URL, owner/name, gitlab:owner/name, an ID or `.`".to_string()),
        }
    }
    Ok((kept, repo))
}

fn money(usd: f64) -> String {
    format!("${usd:.2}")
}

fn duration(ms: u64) -> String {
    let seconds = ms / 1000;
    match (seconds / 3600, seconds / 60 % 60) {
        (0, 0) => format!("{seconds}s"),
        (0, minutes) => format!("{minutes}m {:02}s", seconds % 60),
        (hours, minutes) => format!("{hours}h {minutes:02}m"),
    }
}

fn scan_row_json(scan: &ScanRow) -> Value {
    json!({
        "id": scan.scan_id,
        "repo": scan.repo,
        "repoId": scan.repo_id,
        "branch": scan.branch,
        "status": scan.status,
        "profile": scan.profile,
        "createdAt": scan.created_at,
        "finishedAt": scan.finished_at,
    })
}

pub async fn scans(store: &Store, repo: Option<&str>, json: bool) -> Exit {
    let client = match access::client(store, Scope::Read, json) {
        Ok(client) => client,
        Err(exit) => return exit,
    };
    let target = match repo {
        Some(text) => match access::repo(&client, text, json).await {
            Ok(target) => Some(target),
            Err(exit) => return exit,
        },
        None => None,
    };
    let listed = match scan_ref::list_scans(&client, target.as_ref().map(|target| target.repo.id.as_str()), LIST_LIMIT).await {
        Ok(listed) => listed,
        Err(why) => return access::denied(json, why),
    };
    if json {
        let shown: Vec<Value> = listed.iter().map(scan_row_json).collect();
        return json::emit(Exit::Ok, json!({ "scans": shown }), None);
    }
    if listed.is_empty() {
        println!("No Scans yet.");
        return Exit::Ok;
    }
    let mut rows = vec![["SCAN", "REPO", "BRANCH", "PROFILE", "STATUS", "STARTED"].map(String::from).to_vec()];
    for scan in &listed {
        rows.push(vec![
            scan.scan_id.clone(),
            scan.repo.clone(),
            scan.branch.clone().unwrap_or_else(|| "-".to_string()),
            scan.profile.clone().unwrap_or_else(|| "-".to_string()),
            scan.status.clone(),
            day(&scan.created_at).to_string(),
        ]);
    }
    print_table(&rows);
    Exit::Ok
}

fn spend_json(spend: &Spend) -> Value {
    let phases: Vec<Value> = spend
        .phases
        .iter()
        .flatten()
        .map(|phase| json!({ "phase": phase.phase, "costUsd": phase.cost_usd, "durationMs": phase.duration_ms }))
        .collect();
    json!({
        "costUsd": spend.cost_usd,
        "inputTokens": spend.input_tokens,
        "outputTokens": spend.output_tokens,
        "cacheReadTokens": spend.cache_read_tokens,
        "cacheWriteTokens": spend.cache_write_tokens,
        "turns": spend.turns,
        "durationMs": spend.duration_ms,
        "phases": phases,
    })
}

fn summary_json(summary: &Summary) -> Value {
    json!({
        "total": summary.total,
        "severity": {
            "critical": summary.severity.critical,
            "high": summary.severity.high,
            "medium": summary.severity.medium,
            "low": summary.severity.low,
            "informational": summary.severity.informational,
        },
        "needsValidation": summary.needs_validation,
        "new": summary.new,
        "carried": summary.carried,
    })
}

fn detail_json(scan: &ScanDetail) -> Value {
    json!({
        "id": scan.scan_id,
        "repo": scan.repo,
        "repoId": scan.repo_id,
        "branch": scan.branch,
        "commit": scan.commit_sha,
        "status": scan.status,
        "step": scan.step,
        "profile": scan.profile,
        "profileMet": scan.profile_met,
        "model": scan.model,
        "effort": scan.effort,
        "budgetUsd": scan.max_budget_usd,
        "createdAt": scan.created_at,
        "updatedAt": scan.updated_at,
        "finishedAt": scan.finished_at,
        "error": scan.error,
        "failureCode": scan.failure_code,
        "runner": scan.runner.as_ref().map(|runner| json!({ "id": runner.id, "name": runner.name })),
        "resumes": scan.resumes_scan_id,
        "resumedBy": scan.resumed_by_scan_id,
    })
}

fn print_detail(scan: &ScanDetail) {
    println!("Scan {}  {}", scan.scan_id, scan.status);
    let commit = scan.commit_sha.as_deref().map(|commit| format!("  at {}", commit.get(..7).unwrap_or(commit))).unwrap_or_default();
    println!("Repo: {}  branch {}{commit}", scan.repo, scan.branch.as_deref().unwrap_or("none"));
    println!("Profile: {}  model {}  effort {}  cap {}", scan.profile, scan.model, scan.effort, money(scan.max_budget_usd));
    if let Some(runner) = &scan.runner {
        println!("Runner: {}", runner.name);
    }
    if let Some(step) = &scan.step {
        println!("Step: {step}");
    }
    println!("Started: {}", scan.created_at);
    if let Some(finished) = &scan.finished_at {
        println!("Finished: {finished}");
    }
    if let Some(spend) = &scan.usage {
        let turns = spend.turns.map(|turns| format!(", {turns} turns")).unwrap_or_default();
        let took = spend.duration_ms.map(|ms| format!(", {}", duration(ms))).unwrap_or_default();
        println!("Cost: {}{turns}{took}", money(spend.cost_usd));
        for phase in spend.phases.iter().flatten() {
            println!("  {}  {}", phase.phase, money(phase.cost_usd));
        }
    }
    if let Some(summary) = &scan.summary {
        let severity = &summary.severity;
        println!(
            "Findings: {} (critical {}, high {}, medium {}, low {}, informational {}), {} need validation",
            summary.total,
            severity.critical,
            severity.high,
            severity.medium,
            severity.low,
            severity.informational,
            summary.needs_validation
        );
    }
    if let Some(earlier) = &scan.resumes_scan_id {
        println!("Resumes Scan {earlier}");
    }
    if let Some(later) = &scan.resumed_by_scan_id {
        println!("Resumed by Scan {later}");
    }
    if let Some(error) = &scan.error {
        println!("Error: {error}");
    }
}

async fn read_scan(client: &EngineClient<'_>, text: &str, json: bool) -> Result<ScanDetail, Exit> {
    let row = access::scan(client, text, None, json).await?;
    cli_scans::get_scan(client, &row.scan_id).await.map_err(|why| access::denied(json, why))
}

pub async fn show(store: &Store, text: &str, json: bool) -> Exit {
    let client = match access::client(store, Scope::Read, json) {
        Ok(client) => client,
        Err(exit) => return exit,
    };
    let scan = match read_scan(&client, text, json).await {
        Ok(scan) => scan,
        Err(exit) => return exit,
    };
    if json {
        let fields = json!({
            "scan": detail_json(&scan),
            "cost": scan.usage.as_ref().map(spend_json),
            "summary": scan.summary.as_ref().map(summary_json),
        });
        return json::emit(Exit::Ok, fields, None);
    }
    print_detail(&scan);
    Exit::Ok
}

pub async fn trace(store: &Store, text: &str, json: bool) -> Exit {
    let client = match access::client(store, Scope::Read, json) {
        Ok(client) => client,
        Err(exit) => return exit,
    };
    let row = match access::scan(&client, text, None, json).await {
        Ok(row) => row,
        Err(exit) => return exit,
    };
    let trace = match cli_scans::get_trace(&client, &row.scan_id).await {
        Ok(trace) => trace,
        Err(why) => return access::denied(json, why),
    };
    if json {
        let entries: Vec<Value> = trace
            .entries
            .iter()
            .map(|entry| {
                json!({
                    "id": entry.id,
                    "label": entry.label,
                    "phase": entry.phase,
                    "startedAt": entry.started_at,
                    "endedAt": entry.ended_at,
                    "count": entry.count,
                })
            })
            .collect();
        let fields = json!({ "scanId": row.scan_id, "entries": entries, "candidateFindings": trace.candidate_findings });
        return json::emit(Exit::Ok, fields, None);
    }
    if trace.entries.is_empty() {
        println!("Scan {} has no Trace yet.", row.scan_id);
        return Exit::Ok;
    }
    let mut rows = vec![["PHASE", "LABEL", "COUNT", "STARTED", "ENDED"].map(String::from).to_vec()];
    for entry in &trace.entries {
        rows.push(vec![
            entry.phase.clone().unwrap_or_else(|| "-".to_string()),
            entry.label.clone(),
            entry.count.to_string(),
            entry.started_at.clone(),
            entry.ended_at.clone(),
        ]);
    }
    print_table(&rows);
    if let Some(found) = trace.candidate_findings {
        println!("Candidate findings so far: {found}");
    }
    Exit::Ok
}

pub async fn stop(store: &Store, text: &str, json: bool) -> Exit {
    let client = match access::client(store, Scope::Start, json) {
        Ok(client) => client,
        Err(exit) => return exit,
    };
    let row = match access::scan(&client, text, None, json).await {
        Ok(row) => row,
        Err(exit) => return exit,
    };
    let stopped = match cli_scans::stop(&client, &row.scan_id).await {
        Ok(stopped) => stopped,
        Err(why) => return access::denied(json, why),
    };
    json::say(json, &format!("Scan {} is {}.", stopped.scan_id, stopped.status));
    if json {
        return json::emit(Exit::Ok, json!({ "scanId": stopped.scan_id, "status": stopped.status, "repo": stopped.repo }), None);
    }
    Exit::Ok
}

pub async fn resume(store: &Store, text: &str, json: bool) -> Exit {
    let client = match EngineClient::open(store.access.tokens(), store.access.is_read_only(), Scope::Start) {
        Ok(client) => client,
        Err(Denied::NoAccess) => return commands::resume(text, json),
        Err(why) => return access::denied(json, why),
    };
    let row = match access::scan(&client, text, None, json).await {
        Ok(row) => row,
        Err(exit) => return exit,
    };
    let queued = match cli_scans::resume(&client, &row.scan_id).await {
        Ok(queued) => queued,
        Err(why) => return access::denied(json, why),
    };
    let kept = scan::check_kept(&row.scan_id);
    let (resumable, phases) = match &kept {
        Ok(done) => (true, done.clone()),
        Err(_) => (false, Vec::new()),
    };
    let local = match &kept {
        Ok(done) if done.is_empty() => "This computer's work folder holds no finished Phase yet and can be resumed.".to_string(),
        Ok(done) => format!("This computer's work folder holds the finished Phases {} and can be resumed.", done.join(", ")),
        Err(_) => "This computer holds no work folder that can be resumed; the Runner that ran it carries on from its own.".to_string(),
    };
    json::say(
        json,
        &format!(
            "Started a resume of Scan {} as Scan {} ({}). {local} `elise run` on that Runner claims it.",
            row.scan_id, queued.scan_id, queued.status
        ),
    );
    if json {
        let fields = json!({
            "scanId": row.scan_id,
            "resumable": resumable,
            "phases": phases,
            "started": true,
            "newScanId": queued.scan_id,
            "status": queued.status,
        });
        return json::emit(Exit::Ok, fields, None);
    }
    Exit::Ok
}
