use crate::access;
use crate::commands::fail;
use crate::json;
use crate::repos::print_table;
use crate::results_args::Request;
use crate::store::Store;
use crate::Exit;
use elise_runner_core::cli_repos;
use elise_runner_core::cli_results::{self, Filter, FindingRow, ScanDetail, SeverityCounts, Summary};
use elise_runner_core::engine_client::{Denied, EngineClient, Scope};
use serde_json::{json, Value};
use std::io::{IsTerminal, Write};
use std::path::PathBuf;

const TOP_FINDINGS: usize = 5;
const NO_FINDINGS: &str = "No findings recorded. That is not proof the code is safe: it only covers what the review looked at.";

pub async fn run(store: &Store, request: Request) -> Exit {
    match request {
        Request::Report { scan, full, json } => report(store, &scan, full, json).await,
        Request::Findings { scan, repo, severity, status, json } => {
            findings(store, scan.as_deref(), repo.as_deref(), Filter { repo: None, severity, status }, json).await
        }
        Request::Files { scan, json } => files(store, &scan, json).await,
        Request::FilesGet { scan, name, out, json } => files_get(store, &scan, &name, out.as_deref(), json).await,
        Request::Diff { scan, json } => diff(store, &scan, json).await,
        Request::Verdict { repo, commit, json } => verdict(store, &repo, commit.as_deref(), json).await,
    }
}

fn short(commit: &str) -> &str {
    commit.get(..7).unwrap_or(commit)
}

fn place(file: Option<&str>, line: Option<i64>) -> String {
    match (file, line) {
        (Some(file), Some(line)) => format!("{file}:{line}"),
        (Some(file), None) => file.to_string(),
        _ => "-".to_string(),
    }
}

fn status_text(status: &str) -> String {
    status.replace('_', " ")
}

fn finding_json(finding: &FindingRow) -> Value {
    json!({
        "scanId": finding.scan_id,
        "repo": finding.repo,
        "fingerprint": finding.fingerprint,
        "status": finding.status,
        "severity": finding.severity,
        "title": finding.title,
        "class": finding.class,
        "file": finding.file,
        "line": finding.line,
        "actor": finding.actor,
        "impact": finding.impact,
        "evidence": finding.evidence,
        "fix": finding.fix,
        "needs": finding.needs,
        "triage": finding.triage.as_ref().map(|triage| json!({ "status": triage.status, "note": triage.note })),
    })
}

fn counts_text(counts: &SeverityCounts) -> String {
    format!(
        "critical {}, high {}, medium {}, low {}, informational {}",
        counts.critical, counts.high, counts.medium, counts.low, counts.informational
    )
}

fn summary_json(summary: &Summary, computed: bool) -> Value {
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
        "new": if computed { Value::Null } else { json!(summary.new) },
        "carried": if computed { Value::Null } else { json!(summary.carried) },
    })
}

fn summary_of(findings: &[FindingRow]) -> Summary {
    let mut counts = SeverityCounts::default();
    let kept: Vec<&FindingRow> = findings.iter().filter(|finding| finding.status != "rejected").collect();
    for finding in &kept {
        match finding.severity.as_deref() {
            Some("critical") => counts.critical += 1,
            Some("high") => counts.high += 1,
            Some("medium") => counts.medium += 1,
            Some("low") => counts.low += 1,
            Some("informational") => counts.informational += 1,
            _ => {}
        }
    }
    let needs_validation = kept.iter().filter(|finding| finding.status == "needs_validation").count() as u64;
    Summary { total: kept.len() as u64, severity: counts, needs_validation, new: 0, carried: 0 }
}

fn finding_row(finding: &FindingRow, with_repo: bool) -> Vec<String> {
    let mut row = vec![
        finding.severity.clone().unwrap_or_else(|| "-".to_string()),
        status_text(&finding.status),
        finding.title.clone(),
        place(finding.file.as_deref(), finding.line),
    ];
    if with_repo {
        row.push(finding.repo.clone());
    }
    row.push(finding.triage.as_ref().map(|triage| status_text(&triage.status)).unwrap_or_default());
    row
}

fn print_findings(findings: &[FindingRow], with_repo: bool) {
    let mut header = vec!["SEVERITY", "STATUS", "TITLE", "LOCATION"];
    if with_repo {
        header.push("REPO");
    }
    header.push("DECISION");
    let mut rows = vec![header.into_iter().map(String::from).collect::<Vec<String>>()];
    rows.extend(findings.iter().map(|finding| finding_row(finding, with_repo)));
    print_table(&rows);
}

fn text_of(value: &Value, key: &str) -> String {
    value.get(key).and_then(Value::as_str).unwrap_or_default().to_string()
}

fn list_of<'a>(value: &'a Value, key: &str) -> &'a [Value] {
    value.get(key).and_then(Value::as_array).map(Vec::as_slice).unwrap_or_default()
}

fn problem_line(problem: &Value) -> String {
    let severity = problem.get("severity").and_then(Value::as_str).unwrap_or("-");
    let line = problem.get("line").and_then(Value::as_i64);
    let file = problem.get("file").and_then(Value::as_str);
    format!("  {severity}  {}  {}", text_of(problem, "title"), place(file, line))
}

fn print_verdict(branch: Option<&str>, verdict: &Value) {
    let commit = text_of(verdict, "commit");
    match branch {
        Some(branch) => println!("Verdict on {branch} at {}: {}", short(&commit), text_of(verdict, "verdict")),
        None => println!("Verdict at {}: {}", short(&commit), text_of(verdict, "verdict")),
    }
    for reason in list_of(verdict, "reasons") {
        println!("  {}", text_of(reason, "message"));
    }
    let scans = &verdict["scans"];
    if let (Some(counted), Some(required)) = (scans["counted"].as_f64(), scans["required"].as_f64()) {
        println!("Scans counted: {counted} of {required} needed");
    }
    let counts = &verdict["counts"];
    let count = |key: &str| counts.get(key).and_then(Value::as_u64).unwrap_or(0);
    println!(
        "Open problems by severity: critical {}, high {}, medium {}, low {}, informational {}; {} need a person to check by hand",
        count("critical"),
        count("high"),
        count("medium"),
        count("low"),
        count("informational"),
        count("needsValidation")
    );
    for (key, heading) in [("open", "Open problems"), ("accepted", "Accepted risks"), ("dismissed", "Dismissed")] {
        let items = list_of(verdict, key);
        if items.is_empty() {
            continue;
        }
        println!("{heading} ({}):", items.len());
        for item in items {
            println!("{}", problem_line(item));
        }
    }
}

async fn detail_of(client: &EngineClient<'_>, text: &str, repo: Option<&cli_repos::RepoRow>, json: bool) -> Result<ScanDetail, Exit> {
    let row = access::scan(client, text, repo, json).await?;
    cli_results::scan_detail(client, &row.scan_id).await.map_err(|why| access::denied(json, why))
}

fn has_findings(detail: &ScanDetail) -> bool {
    detail.status == "succeeded"
        && (detail.summary.is_some() || detail.files.as_ref().is_some_and(|files| files.iter().any(|name| name == "findings.json")))
}

async fn report(store: &Store, text: &str, full: bool, json: bool) -> Exit {
    let client = match access::client(store, Scope::Read, json) {
        Ok(client) => client,
        Err(exit) => return exit,
    };
    let detail = match detail_of(&client, text, None, json).await {
        Ok(detail) => detail,
        Err(exit) => return exit,
    };
    let markdown = if full {
        match cli_results::scan_file(&client, &detail.scan_id, "REPORT.md").await {
            Ok(bytes) => Some(String::from_utf8_lossy(&bytes).into_owned()),
            Err(Denied::NotFound(_)) => {
                let message = format!("Scan {} has no REPORT.md: it kept no report.", detail.scan_id);
                return fail(json, Exit::Error, "no_report", &message, "elise files");
            }
            Err(why) => return access::denied(json, why),
        }
    } else {
        None
    };
    let mut findings = if has_findings(&detail) {
        match cli_results::findings_of_scan(&client, &detail).await {
            Ok(findings) => findings,
            Err(why) => return access::denied(json, why),
        }
    } else {
        Vec::new()
    };
    cli_results::sort_worst_first(&mut findings);
    let verdict = match (&detail.commit_sha, detail.status.as_str()) {
        (Some(commit), "succeeded") => match cli_results::verdict(&client, &detail.repo_id, commit).await {
            Ok(verdict) => Some(verdict),
            Err(Denied::NotFound(_)) => None,
            Err(why) => return access::denied(json, why),
        },
        _ => None,
    };
    let summary = match (&detail.summary, has_findings(&detail)) {
        (Some(summary), _) => Some((summary_json(summary, false), summary.clone())),
        (None, true) => {
            let computed = summary_of(&findings);
            Some((summary_json(&computed, true), computed))
        }
        (None, false) => None,
    };
    let top: Vec<&FindingRow> = findings.iter().filter(|finding| finding.status != "rejected").take(TOP_FINDINGS).collect();
    if json {
        let mut fields = json!({
            "scan": {
                "id": detail.scan_id,
                "repo": detail.repo,
                "repoId": detail.repo_id,
                "branch": detail.branch,
                "status": detail.status,
                "profile": detail.profile,
                "commit": detail.commit_sha,
                "createdAt": detail.created_at,
                "finishedAt": detail.finished_at,
                "costUsd": detail.usage.as_ref().map(|usage| usage.cost_usd),
                "runner": detail.runner.as_ref().map(|runner| runner.name.clone()),
                "error": detail.error,
            },
            "summary": summary.as_ref().map(|(shown, _)| shown.clone()),
            "verdict": verdict,
            "topFindings": top.iter().map(|finding| finding_json(finding)).collect::<Vec<Value>>(),
        });
        if let Some(markdown) = markdown {
            fields["reportMarkdown"] = json!(markdown);
        }
        return json::emit(Exit::Ok, fields, None);
    }
    if let Some(markdown) = markdown {
        print!("{markdown}");
        if !markdown.ends_with('\n') {
            println!();
        }
        return Exit::Ok;
    }
    println!("{}  {}  Scan {}", detail.repo, detail.branch.as_deref().unwrap_or("-"), detail.scan_id);
    let mut line = format!("Status: {}", detail.status);
    if let Some(profile) = &detail.profile {
        line.push_str(&format!("  Profile: {profile}"));
    }
    if let Some(commit) = &detail.commit_sha {
        line.push_str(&format!("  Commit: {}", short(commit)));
    }
    println!("{line}");
    if let Some(error) = &detail.error {
        println!("Error: {error}");
    }
    if let Some(usage) = &detail.usage {
        let ran = detail.runner.as_ref().map(|runner| format!(" It ran on {}, so nothing was billed.", runner.name)).unwrap_or_default();
        println!("Cost: ${:.2}, estimated at list price.{ran}", usage.cost_usd);
    }
    if let Some((_, summary)) = &summary {
        let noun = if summary.total == 1 { "finding" } else { "findings" };
        println!("Findings: {} {noun} ({})", summary.total, counts_text(&summary.severity));
        println!(
            "  {} confirmed by the Scan, {} need a person to check by hand",
            summary.total.saturating_sub(summary.needs_validation),
            summary.needs_validation
        );
        if detail.summary.is_some() {
            println!("  {} new, {} carried over from earlier Scans and seen again", summary.new, summary.carried);
        }
    }
    match &verdict {
        Some(verdict) => print_verdict(None, verdict),
        None if detail.status == "succeeded" => println!("Verdict: none for this commit"),
        None => {}
    }
    if summary.as_ref().is_some_and(|(_, summary)| summary.total == 0) {
        println!("{NO_FINDINGS}");
    }
    if !top.is_empty() {
        println!("Top findings:");
        let owned: Vec<FindingRow> = top.into_iter().cloned().collect();
        print_findings(&owned, false);
        println!("`elise findings --scan {}` lists them all; `elise report {} --full` prints REPORT.md.", detail.scan_id, detail.scan_id);
    }
    Exit::Ok
}

async fn findings(store: &Store, scan: Option<&str>, repo: Option<&str>, filter: Filter, json: bool) -> Exit {
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
    let scan_id;
    let mut found = match scan {
        Some(text) => {
            let detail = match detail_of(&client, text, target.as_ref().map(|target| &target.repo), json).await {
                Ok(detail) => detail,
                Err(exit) => return exit,
            };
            scan_id = Some(detail.scan_id.clone());
            match cli_results::findings_of_scan(&client, &detail).await {
                Ok(found) => found.into_iter().filter(|finding| filter.keeps(finding)).collect(),
                Err(why) => return access::denied(json, why),
            }
        }
        None => {
            scan_id = None;
            let filter = Filter { repo: target.as_ref().map(|target| target.repo.url.clone()), ..filter };
            match cli_results::findings_of_branches(&client, &filter).await {
                Ok(found) => found,
                Err(why) => return access::denied(json, why),
            }
        }
    };
    cli_results::sort_worst_first(&mut found);
    if json {
        let listed: Vec<Value> = found.iter().map(finding_json).collect();
        return json::emit(Exit::Ok, json!({ "scanId": scan_id, "findings": listed }), None);
    }
    if found.is_empty() {
        println!("{NO_FINDINGS}");
        return Exit::Ok;
    }
    print_findings(&found, scan_id.is_none());
    Exit::Ok
}

fn file_entries(detail: &ScanDetail) -> Vec<(String, Option<u64>, Option<String>)> {
    match (&detail.artifacts, &detail.files) {
        (Some(artifacts), _) if !artifacts.is_empty() => artifacts
            .iter()
            .map(|artifact| (artifact.name.clone(), Some(artifact.size_bytes), Some(artifact.content_type.clone())))
            .collect(),
        (_, Some(files)) => files.iter().map(|name| (name.clone(), None, None)).collect(),
        _ => Vec::new(),
    }
}

async fn files(store: &Store, text: &str, json: bool) -> Exit {
    let client = match access::client(store, Scope::Read, json) {
        Ok(client) => client,
        Err(exit) => return exit,
    };
    let detail = match detail_of(&client, text, None, json).await {
        Ok(detail) => detail,
        Err(exit) => return exit,
    };
    let entries = file_entries(&detail);
    if json {
        let listed: Vec<Value> =
            entries.iter().map(|(name, size, kind)| json!({ "name": name, "sizeBytes": size, "contentType": kind })).collect();
        return json::emit(Exit::Ok, json!({ "scanId": detail.scan_id, "files": listed }), None);
    }
    if entries.is_empty() {
        println!("Scan {} saved no files.", detail.scan_id);
        return Exit::Ok;
    }
    let mut rows = vec![["NAME", "SIZE", "TYPE"].map(String::from).to_vec()];
    for (name, size, kind) in &entries {
        rows.push(vec![name.clone(), size.map(|size| format!("{size} bytes")).unwrap_or_default(), kind.clone().unwrap_or_default()]);
    }
    print_table(&rows);
    println!("`elise files get {} <name>` saves one.", detail.scan_id);
    Exit::Ok
}

fn is_text(bytes: &[u8]) -> bool {
    !bytes.contains(&0) && std::str::from_utf8(bytes).is_ok()
}

fn stdout_is_terminal() -> bool {
    std::io::stdout().is_terminal() || std::env::var_os("ELISE_TEST_TERMINAL").is_some()
}

async fn files_get(store: &Store, text: &str, name: &str, out: Option<&str>, json: bool) -> Exit {
    let client = match access::client(store, Scope::Read, json) {
        Ok(client) => client,
        Err(exit) => return exit,
    };
    let detail = match detail_of(&client, text, None, json).await {
        Ok(detail) => detail,
        Err(exit) => return exit,
    };
    let names: Vec<String> = file_entries(&detail).into_iter().map(|(name, _, _)| name).collect();
    if detail.files.is_some() && !names.iter().any(|known| known == name) {
        let message = format!("Scan {} has no file `{name}`. It saved: {}.", detail.scan_id, names.join(", "));
        return fail(json, Exit::Error, "file_not_found", &message, "elise files");
    }
    let bytes = match cli_results::scan_file(&client, &detail.scan_id, name).await {
        Ok(bytes) => bytes,
        Err(why) => return access::denied(json, why),
    };
    let Some(out) = out else {
        if json {
            if !is_text(&bytes) {
                let message = format!("`{name}` is not text, so --json cannot hold it. Add --out <path> to save it.");
                return fail(json, Exit::Usage, "binary_needs_out", &message, "elise help files");
            }
            let content = String::from_utf8_lossy(&bytes).into_owned();
            return json::emit(Exit::Ok, json!({ "scanId": detail.scan_id, "name": name, "bytes": bytes.len(), "content": content }), None);
        }
        if stdout_is_terminal() && !is_text(&bytes) {
            let message = format!("`{name}` is not text and stdout is a terminal. Add --out <path> to save it, or pipe it.");
            return fail(json, Exit::Usage, "binary_to_terminal", &message, "elise help files");
        }
        let mut stdout = std::io::stdout();
        return if stdout.write_all(&bytes).and_then(|()| stdout.flush()).is_ok() { Exit::Ok } else { Exit::Error };
    };
    let mut path = PathBuf::from(out);
    if path.is_dir() {
        path.push(name);
    }
    if let Err(why) = std::fs::write(&path, &bytes) {
        let message = format!("Could not write {}: {why}.", path.display());
        return fail(json, Exit::Error, "write_failed", &message, "elise help files");
    }
    if json {
        let fields = json!({ "scanId": detail.scan_id, "name": name, "bytes": bytes.len(), "path": path.display().to_string() });
        return json::emit(Exit::Ok, fields, None);
    }
    println!("Saved {} bytes to {}", bytes.len(), path.display());
    Exit::Ok
}

async fn diff(store: &Store, text: &str, json: bool) -> Exit {
    let client = match access::client(store, Scope::Read, json) {
        Ok(client) => client,
        Err(exit) => return exit,
    };
    let row = match access::scan(&client, text, None, json).await {
        Ok(row) => row,
        Err(exit) => return exit,
    };
    let diff = match cli_results::scan_diff(&client, &row.scan_id).await {
        Ok(diff) => diff,
        Err(why) => return access::denied(json, why),
    };
    if json {
        return json::emit(Exit::Ok, diff, None);
    }
    match diff.get("previousScanId").and_then(Value::as_str) {
        Some(previous) => println!("Scan {} compared with {previous}", row.scan_id),
        None => {
            println!("Scan {} has no earlier Scan to compare with.", row.scan_id);
            return Exit::Ok;
        }
    }
    let mut shown = false;
    for (key, heading) in
        [("new", "New"), ("regressed", "Regressed"), ("stillOpen", "Still open"), ("fixed", "Fixed"), ("notRechecked", "Not rechecked")]
    {
        let items = list_of(&diff, key);
        if items.is_empty() {
            continue;
        }
        shown = true;
        println!("{heading} ({}):", items.len());
        for item in items {
            println!("{}", problem_line(item));
        }
    }
    if !shown {
        println!("No changes.");
    }
    Exit::Ok
}

async fn verdict(store: &Store, text: &str, commit: Option<&str>, json: bool) -> Exit {
    let client = match access::client(store, Scope::Read, json) {
        Ok(client) => client,
        Err(exit) => return exit,
    };
    let target = match access::repo(&client, text, json).await {
        Ok(target) => target,
        Err(exit) => return exit,
    };
    let (branch, commit) = match commit {
        Some(commit) => (None, commit.to_string()),
        None => {
            let detail = match cli_repos::get_repo(&client, &target.repo.id).await {
                Ok(detail) => detail,
                Err(why) => return access::denied(json, why),
            };
            let wanted = target.branch.as_deref();
            let chosen = detail.branches.iter().find(|branch| match wanted {
                Some(name) => branch.name == name,
                None => branch.is_default,
            });
            match chosen.and_then(|branch| branch.latest_commit.clone().map(|commit| (branch.name.clone(), commit))) {
                Some((branch, commit)) => (Some(branch), commit),
                None => {
                    let which = wanted.map(|name| format!("The branch {name}")).unwrap_or_else(|| "The default branch".to_string());
                    let message = format!(
                        "{which} of {} has no succeeded Scan, so there is no commit to judge. Pass --commit <sha>.",
                        target.repo.name()
                    );
                    return fail(json, Exit::Error, "no_commit", &message, "elise help verdict");
                }
            }
        }
    };
    let answer = match cli_results::verdict(&client, &target.repo.id, &commit).await {
        Ok(answer) => answer,
        Err(why) => return access::denied(json, why),
    };
    if json {
        return json::emit(
            Exit::Ok,
            json!({ "repo": { "id": target.repo.id, "name": target.repo.name() }, "branch": branch, "verdict": answer }),
            None,
        );
    }
    print_verdict(branch.as_deref(), &answer);
    Exit::Ok
}
