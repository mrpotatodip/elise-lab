use crate::commands::fail;
use crate::json;
use crate::store::Store;
use crate::Exit;
use elise_runner_core::cli_repos::{self, RepoRow};
use elise_runner_core::engine_client::{Denied, EngineClient, Scope};
use elise_runner_core::repo_name::{self, Found, RepoName};
use elise_runner_core::scan_ref::{self, FoundScan, ScanRef, ScanRow};
use serde_json::json;

pub struct Target {
    pub repo: RepoRow,
    pub branch: Option<String>,
}

pub fn client(store: &Store, needed: Scope, json: bool) -> Result<EngineClient<'_>, Exit> {
    EngineClient::open(store.access.tokens(), store.access.is_read_only(), needed).map_err(|why| denied(json, why))
}

pub fn denied(json: bool, why: Denied) -> Exit {
    match why {
        Denied::NoAccess => fail(
            json,
            Exit::Unpaired,
            "no_cli_access",
            "This computer has no CLI access. Run `elise login` and choose \"Start and read Scans from this CLI\", or set ELISE_TOKEN.",
            "elise login",
        ),
        Denied::Scope { needed, held } => {
            let held = held.map(|scope| format!("scope {scope}")).unwrap_or_else(|| "a narrower scope".to_string());
            let message = format!(
                "This needs CLI access with scope {}, and this computer holds {held}. Run `elise login` again and choose to start Scans.",
                needed.name()
            );
            fail(json, Exit::Usage, "needs_scope", &message, "elise login")
        }
        Denied::Revoked => fail(
            json,
            Exit::Revoked,
            "revoked",
            "Elise rejected this CLI access: it was revoked. Run `elise login` to get a new one.",
            "elise login",
        ),
        Denied::Offline => {
            fail(json, Exit::Offline, "offline", "Could not reach Elise. Check the connection and try again.", "elise status")
        }
        Denied::NotFound(message) => {
            let message = if message.is_empty() { "Elise has no such item in this Account.".to_string() } else { message };
            fail(json, Exit::Error, "not_found", &message, "elise repos")
        }
        Denied::Refused(message) => fail(json, Exit::Error, "refused", &message, "elise status"),
        Denied::Unreadable => fail(
            json,
            Exit::Error,
            "unreadable",
            "Elise answered in a shape this version of elise does not know. Update elise.",
            "elise --version",
        ),
    }
}

pub fn refuse_with(json: bool, exit: Exit, code: &str, message: &str, next: &str, matches: Vec<serde_json::Value>) -> Exit {
    eprintln!("{message}");
    if json {
        return json::emit(exit, json!({ "matches": matches }), Some(json::Failure { code, message, next }));
    }
    exit
}

pub enum Resolved {
    Known(Box<Target>),
    New { name: RepoName, branch: Option<String> },
}

pub async fn repo(client: &EngineClient<'_>, text: &str, json: bool) -> Result<Target, Exit> {
    match resolve_repo(client, text, json).await? {
        Resolved::Known(target) => Ok(*target),
        Resolved::New { .. } => Err(repo_not_found(json, text)),
    }
}

fn repo_not_found(json: bool, text: &str) -> Exit {
    fail(
        json,
        Exit::Error,
        "repo_not_found",
        &format!("No repo in this Account matches `{text}`. `elise repos` lists them."),
        "elise repos",
    )
}

pub async fn resolve_repo(client: &EngineClient<'_>, text: &str, json: bool) -> Result<Resolved, Exit> {
    let usage = |message: &str| fail(json, Exit::Usage, "bad_repo_name", message, "elise help repos");
    let mut name = repo_name::parse(text).map_err(|message| usage(&message))?;
    let mut branch = None;
    if name == RepoName::Current {
        let here = std::env::current_dir().map_err(|_| usage("This folder cannot be read."))?;
        let checkout = repo_name::checkout(&here).map_err(|why| {
            let message = match why {
                repo_name::CheckoutError::NoGit => "`.` needs git, and git was not found on this computer.",
                repo_name::CheckoutError::NotACheckout => "`.` needs a git checkout, and this folder is not one.",
                repo_name::CheckoutError::NoOrigin => "`.` needs a checkout with an `origin` remote, and this one has none.",
            };
            fail(json, Exit::Usage, "not_a_checkout", &format!("{message} Name the repo instead."), "elise help repos")
        })?;
        name = repo_name::parse(&checkout.remote).map_err(|_| {
            usage(&format!("This checkout's origin `{}` is not an address elise knows. Name the repo instead.", checkout.remote))
        })?;
        branch = checkout.branch;
    }
    let repos = cli_repos::list_repos(client).await.map_err(|why| denied(json, why))?;
    match repo_name::find(&repos, &name) {
        Found::One(repo) => Ok(Resolved::Known(Box::new(Target { repo: repo.clone(), branch }))),
        Found::None if matches!(name, RepoName::Github(_) | RepoName::Gitlab(_) | RepoName::Url { .. }) => {
            Ok(Resolved::New { name, branch })
        }
        Found::None => Err(repo_not_found(json, text)),
        Found::Many(found) => {
            let mut message = format!("`{text}` matches {} repos. Name one by its ID:", found.len());
            let listed: Vec<serde_json::Value> = found
                .iter()
                .map(|repo| {
                    message.push_str(&format!("\n  {}  {}  ({})", repo.id, repo.name(), repo.host()));
                    json!({ "id": repo.id, "name": repo.name(), "provider": repo.provider(), "host": repo.host() })
                })
                .collect();
            Err(refuse_with(json, Exit::Usage, "ambiguous_repo", &message, "elise repos", listed))
        }
    }
}

pub async fn scan(client: &EngineClient<'_>, text: &str, repo: Option<&RepoRow>, json: bool) -> Result<ScanRow, Exit> {
    let wanted: ScanRef = scan_ref::parse(text).map_err(|message| fail(json, Exit::Usage, "bad_scan_id", &message, "elise help ids"))?;
    let repo_id = repo.map(|repo| repo.id.as_str());
    match scan_ref::resolve(client, &wanted, repo_id).await.map_err(|why| denied(json, why))? {
        FoundScan::One(scan) => Ok(scan),
        FoundScan::None => {
            Err(fail(json, Exit::Error, "scan_not_found", &format!("No Scan matches `{text}`. `elise scans` lists them."), "elise scans"))
        }
        FoundScan::Many(found) => {
            let mut message = format!("`{text}` matches {} Scans. Give more of the ID:", found.len());
            let listed: Vec<serde_json::Value> = found
                .iter()
                .map(|scan| {
                    message.push_str(&format!("\n  {}  {}  {}", scan.scan_id, scan.repo, scan.status));
                    json!({ "id": scan.scan_id, "repo": scan.repo, "status": scan.status })
                })
                .collect();
            Err(refuse_with(json, Exit::Usage, "ambiguous_scan", &message, "elise scans", listed))
        }
    }
}
