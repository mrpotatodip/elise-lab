use crate::access;
use crate::json;
use crate::store::Store;
use crate::Exit;
use elise_runner_core::cli_repos::{self, project_name, ProjectRow, RepoRow, VerdictRow};
use elise_runner_core::engine_client::Scope;
use serde_json::{json, Value};

pub fn day(at: &str) -> &str {
    at.get(..10).unwrap_or(at)
}

fn visibility(repo: &RepoRow) -> &'static str {
    match repo.is_private {
        Some(true) => "private",
        Some(false) => "public",
        None => "unknown",
    }
}

fn last_scan(repo: &RepoRow) -> Option<Value> {
    let (id, status) = (repo.last_scan_id.as_ref()?, repo.last_scan_status.as_ref()?);
    Some(json!({ "id": id, "status": status, "at": repo.last_scan_at }))
}

fn repo_json(repo: &RepoRow, projects: &[ProjectRow]) -> Value {
    json!({
        "id": repo.id,
        "name": repo.name(),
        "provider": repo.provider(),
        "host": repo.host(),
        "url": repo.url,
        "project": project_name(projects, repo),
        "private": repo.is_private,
        "defaultBranch": repo.default_branch,
    })
}

fn last_scan_text(repo: &RepoRow) -> String {
    match (&repo.last_scan_status, &repo.last_scan_at) {
        (Some(status), Some(at)) => format!("{status} {}", day(at)),
        (Some(status), None) => status.clone(),
        _ => "none".to_string(),
    }
}

pub fn print_table(rows: &[Vec<String>]) {
    let widths: Vec<usize> =
        (0..rows[0].len()).map(|column| rows.iter().map(|row| row[column].chars().count()).max().unwrap_or(0)).collect();
    for row in rows {
        let cells: Vec<String> = row.iter().zip(&widths).map(|(cell, width)| format!("{cell:<width$}")).collect();
        println!("{}", cells.join("  ").trim_end());
    }
}

pub async fn repos(store: &Store, json: bool) -> Exit {
    let client = match access::client(store, Scope::Read, json) {
        Ok(client) => client,
        Err(exit) => return exit,
    };
    let (repos, projects) = match (cli_repos::list_repos(&client).await, cli_repos::list_projects(&client).await) {
        (Ok(repos), Ok(projects)) => (repos, projects),
        (Err(why), _) | (_, Err(why)) => return access::denied(json, why),
    };
    if json {
        let listed: Vec<Value> = repos
            .iter()
            .map(|repo| {
                let mut shown = repo_json(repo, &projects);
                shown["branches"] = json!(repo.branch_names);
                shown["lastScan"] = json!(last_scan(repo));
                shown
            })
            .collect();
        return json::emit(Exit::Ok, json!({ "repos": listed }), None);
    }
    if repos.is_empty() {
        println!("No repos in this Account yet.");
        return Exit::Ok;
    }
    let mut rows = vec![["REPO", "PROJECT", "PROVIDER", "VISIBILITY", "BRANCHES", "LAST SCAN"].map(String::from).to_vec()];
    for repo in &repos {
        rows.push(vec![
            repo.name(),
            project_name(&projects, repo).unwrap_or("-").to_string(),
            repo.provider().to_string(),
            visibility(repo).to_string(),
            repo.branch_names.join(", "),
            last_scan_text(repo),
        ]);
    }
    print_table(&rows);
    Exit::Ok
}

fn verdict_json(branch: &str, verdict: &VerdictRow) -> Value {
    let reasons: Vec<Value> = verdict.reasons.iter().map(|reason| json!({ "code": reason.code, "message": reason.message })).collect();
    json!({
        "branch": branch,
        "commit": verdict.commit,
        "verdict": verdict.verdict,
        "reasons": reasons,
        "scans": { "required": verdict.scans.required, "counted": verdict.scans.counted },
        "counts": verdict.counts,
    })
}

pub async fn repo(store: &Store, text: &str, json: bool) -> Exit {
    let client = match access::client(store, Scope::Read, json) {
        Ok(client) => client,
        Err(exit) => return exit,
    };
    let target = match access::repo(&client, text, json).await {
        Ok(target) => target,
        Err(exit) => return exit,
    };
    let detail = match cli_repos::get_repo(&client, &target.repo.id).await {
        Ok(detail) => detail,
        Err(why) => return access::denied(json, why),
    };
    let projects = match cli_repos::list_projects(&client).await {
        Ok(projects) => projects,
        Err(why) => return access::denied(json, why),
    };
    let default_branch = detail.branches.iter().find(|branch| branch.is_default);
    let judged = default_branch.and_then(|branch| branch.latest_commit.as_ref().map(|commit| (branch.name.clone(), commit.clone())));
    let verdict = match &judged {
        Some((branch, commit)) => match cli_repos::verdict(&client, &detail.repo.id, commit).await {
            Ok(verdict) => Some((branch.clone(), verdict)),
            Err(why) => return access::denied(json, why),
        },
        None => None,
    };
    if json {
        let branches: Vec<Value> = detail
            .branches
            .iter()
            .map(|branch| {
                json!({
                    "name": branch.name,
                    "isDefault": branch.is_default,
                    "latestScanId": branch.latest_scan_id,
                    "latestCommit": branch.latest_commit,
                    "latestScanAt": branch.latest_scan_at,
                })
            })
            .collect();
        let fields = json!({
            "repo": repo_json(&detail.repo, &projects),
            "branches": branches,
            "verdict": verdict.as_ref().map(|(branch, verdict)| verdict_json(branch, verdict)),
        });
        return json::emit(Exit::Ok, fields, None);
    }
    let repo = &detail.repo;
    println!("{}  ({}, {})", repo.name(), repo.provider(), visibility(repo));
    println!("Project: {}", project_name(&projects, repo).unwrap_or("none"));
    println!("Branches:");
    for branch in &detail.branches {
        let marker = if branch.is_default { " (default)" } else { "" };
        let latest = match (&branch.latest_scan_id, &branch.latest_scan_at) {
            (Some(id), Some(at)) => format!("latest Scan {id} on {}", day(at)),
            (Some(id), None) => format!("latest Scan {id}"),
            _ => "no Scan yet".to_string(),
        };
        println!("  {}{marker}  {latest}", branch.name);
    }
    match &verdict {
        Some((branch, verdict)) => {
            let short = verdict.commit.get(..7).unwrap_or(&verdict.commit);
            println!("Verdict on {branch} at {short}: {}", verdict.verdict);
            for reason in &verdict.reasons {
                println!("  {}", reason.message);
            }
        }
        None => println!("Verdict: none yet (the default branch has no succeeded Scan)"),
    }
    Exit::Ok
}
