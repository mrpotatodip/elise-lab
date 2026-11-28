use crate::access;
use crate::commands::{confirm, dollars, fail};
use crate::json;
use crate::repos::{day, print_table};
use crate::scan::{self, usage};
use crate::scan_args::ScanArgs;
use crate::store::Store;
use crate::Exit;
use elise_runner_core::cli_archives::{self, Found, Refusal};
use elise_runner_core::cli_repos::RepoRow;
use elise_runner_core::engine_client::{EngineClient, Scope};
use elise_runner_core::repo_name::{self, RepoName};
use elise_runner_core::scan_start;
use serde_json::json;
use std::path::Path;

pub fn zip_flags_problem(args: &ScanArgs) -> Option<Exit> {
    let json = args.json;
    match (&args.zip, &args.app) {
        (Some(_), None) => Some(usage(json, "zip_needs_app", "`--zip` needs `--app`: the upload app the zip goes under")),
        (None, Some(_)) => Some(usage(json, "app_needs_zip", "`--app` goes with `--zip`: the zip to scan")),
        (Some(_), Some(_)) if args.repo.is_some() => {
            Some(usage(json, "zip_takes_no_repo", "`--zip` scans the zip, so it takes no repo. Leave the repo out."))
        }
        (Some(_), Some(_)) if args.branch.is_some() => {
            Some(usage(json, "zip_takes_no_branch", "An uploaded zip has no branches, so `--branch` does not apply. Leave it out."))
        }
        _ => None,
    }
}

fn refused(json: bool, why: Refusal, help: &str) -> Exit {
    fail(json, Exit::Usage, why.code, &why.message, &format!("elise help {help}"))
}

fn megabytes(bytes: u64) -> String {
    format!("{:.1} MB", bytes as f64 / (1024.0 * 1024.0))
}

struct Target {
    existing: Option<RepoRow>,
    name: String,
    zips: usize,
}

async fn target(client: &EngineClient<'_>, text: &str, json: bool, help: &str) -> Result<Target, Exit> {
    let text = text.trim();
    let repos = cli_archives::list_repos(client).await.map_err(|why| access::denied(json, why))?;
    if let Some(app) = cli_archives::find_app(&repos, text) {
        let zips = cli_archives::list(client, &app.id).await.map_err(|why| access::denied(json, why))?.len();
        return Ok(Target { existing: Some(app.clone()), name: cli_archives::app_name(app).to_string(), zips });
    }
    if matches!(repo_name::parse(text), Ok(RepoName::Id(_))) {
        return Err(app_not_found(json, text));
    }
    if let Some(message) = cli_archives::app_name_problem(text) {
        return Err(fail(json, Exit::Usage, "bad_app_name", message, &format!("elise help {help}")));
    }
    Ok(Target { existing: None, name: text.to_string(), zips: 0 })
}

fn app_not_found(json: bool, text: &str) -> Exit {
    fail(
        json,
        Exit::Error,
        "app_not_found",
        &format!("No upload app in this Account matches `{text}`. `elise repos` lists them."),
        "elise repos",
    )
}

async fn existing_app(client: &EngineClient<'_>, text: &str, json: bool) -> Result<RepoRow, Exit> {
    let repos = cli_archives::list_repos(client).await.map_err(|why| access::denied(json, why))?;
    cli_archives::find_app(&repos, text.trim()).cloned().ok_or_else(|| app_not_found(json, text))
}

struct Sent {
    app_id: String,
    created: bool,
    archive: cli_archives::ArchiveRow,
}

async fn send(client: &EngineClient<'_>, target: &Target, file: &Path, json: bool) -> Result<Sent, Exit> {
    let (app_id, created) = match &target.existing {
        Some(app) => (app.id.clone(), false),
        None => (cli_archives::create_app(client, &target.name).await.map_err(|why| access::denied(json, why))?, true),
    };
    let archive = cli_archives::upload(client, &app_id, file).await.map_err(|why| access::denied(json, why))?;
    Ok(Sent { app_id, created, archive })
}

pub async fn scan_zip(store: &Store, client: &EngineClient<'_>, args: &ScanArgs, profile: &str, budget: Option<f64>, timeout: u64) -> Exit {
    let json = args.json;
    let file = Path::new(args.zip.as_deref().unwrap_or_default());
    let size = match cli_archives::check_file(file) {
        Ok(size) => size,
        Err(why) => return refused(json, why, "scan"),
    };
    let target = match target(client, args.app.as_deref().unwrap_or_default(), json, "scan").await {
        Ok(target) => target,
        Err(exit) => return exit,
    };
    if let Some(why) = cli_archives::too_many_zips(target.zips) {
        return refused(json, why, "scan");
    }
    let runner = match scan::choose_runner(store, client, args).await {
        Ok(runner) => runner,
        Err(exit) => return exit,
    };
    let new_note = if target.existing.is_none() { " (new: it will be added)" } else { "" };
    json::say(json, &format!("App:     {}{new_note}", target.name));
    json::say(json, &format!("Zip:     {} ({})", cli_archives::label_of(file), megabytes(size)));
    json::say(json, &format!("Profile: {profile}"));
    json::say(json, &format!("Cap:     {}", budget.map(dollars).unwrap_or_else(|| "the profile's default".to_string())));
    json::say(json, &format!("Runner:  {}", runner.name));
    if !args.yes && !confirm("Upload this zip and start this Scan?") {
        return fail(json, Exit::Error, "declined", "Nothing was uploaded or started.", "elise scan");
    }
    let sent = match send(client, &target, file, json).await {
        Ok(sent) => sent,
        Err(exit) => return exit,
    };
    let request = scan_start::Request {
        provider: "upload",
        url: &target.name,
        branch: None,
        profile,
        budget,
        runner_id: &runner.id,
        archive_id: Some(&sent.archive.id),
    };
    let queued = match scan_start::start(client, &request).await {
        Ok(queued) => queued,
        Err(why) => return access::denied(json, why),
    };
    let shown = json!({
        "id": queued.scan_id,
        "repo": target.name,
        "branch": null,
        "profile": queued.profile.as_deref().unwrap_or(profile),
        "capUsd": queued.max_budget_usd.or(budget),
        "runner": { "id": runner.id, "name": runner.name },
        "app": { "id": sent.app_id, "created": sent.created },
        "archive": { "id": sent.archive.id, "label": sent.archive.label, "sizeBytes": sent.archive.size_bytes },
    });
    scan::started(store, client, args, &queued, shown, timeout).await
}

pub async fn add(store: &Store, app: &str, file: &str, json: bool) -> Exit {
    let client = match access::client(store, Scope::Start, json) {
        Ok(client) => client,
        Err(exit) => return exit,
    };
    let file = Path::new(file);
    if let Err(why) = cli_archives::check_file(file) {
        return refused(json, why, "archives-add");
    }
    let target = match target(&client, app, json, "archives-add").await {
        Ok(target) => target,
        Err(exit) => return exit,
    };
    if let Some(why) = cli_archives::too_many_zips(target.zips) {
        return refused(json, why, "archives-add");
    }
    let sent = match send(&client, &target, file, json).await {
        Ok(sent) => sent,
        Err(exit) => return exit,
    };
    let made = if sent.created { " (new app)" } else { "" };
    json::say(
        json,
        &format!(
            "Uploaded {} ({}) to {}{made}. Scan it with `elise scan --zip FILE --app {}`.",
            sent.archive.label,
            megabytes(sent.archive.size_bytes),
            target.name,
            target.name
        ),
    );
    if json {
        let shown =
            json!({ "app": { "id": sent.app_id, "name": target.name, "created": sent.created }, "archive": sent.archive.to_json() });
        return json::emit(Exit::Ok, shown, None);
    }
    Exit::Ok
}

pub async fn list(store: &Store, app: &str, json: bool) -> Exit {
    let client = match access::client(store, Scope::Read, json) {
        Ok(client) => client,
        Err(exit) => return exit,
    };
    let app = match existing_app(&client, app, json).await {
        Ok(app) => app,
        Err(exit) => return exit,
    };
    let archives = match cli_archives::list(&client, &app.id).await {
        Ok(archives) => archives,
        Err(why) => return access::denied(json, why),
    };
    let name = cli_archives::app_name(&app);
    if json {
        let listed: Vec<_> = archives.iter().map(|archive| archive.to_json()).collect();
        return json::emit(Exit::Ok, json!({ "app": { "id": app.id, "name": name }, "archives": listed }), None);
    }
    if archives.is_empty() {
        println!("{name} has no zips yet.");
        return Exit::Ok;
    }
    let mut rows = vec![["LABEL", "SIZE", "UPLOADED", "ID"].map(String::from).to_vec()];
    for archive in &archives {
        rows.push(vec![archive.label.clone(), megabytes(archive.size_bytes), day(&archive.uploaded_at).to_string(), archive.id.clone()]);
    }
    print_table(&rows);
    Exit::Ok
}

pub async fn remove(store: &Store, app: &str, archive: &str, yes: bool, interactive: bool, json: bool) -> Exit {
    if !yes && !interactive {
        let message = "`archives remove` asks before it deletes a zip, and no question can be asked here. Add `--yes` to delete it.";
        return fail(json, Exit::Usage, "needs_yes", message, "elise archives remove --yes");
    }
    let client = match access::client(store, Scope::Start, json) {
        Ok(client) => client,
        Err(exit) => return exit,
    };
    let app = match existing_app(&client, app, json).await {
        Ok(app) => app,
        Err(exit) => return exit,
    };
    let name = cli_archives::app_name(&app).to_string();
    let archives = match cli_archives::list(&client, &app.id).await {
        Ok(archives) => archives,
        Err(why) => return access::denied(json, why),
    };
    let archive = match cli_archives::find_archive(&archives, archive.trim()) {
        Found::One(archive) => archive,
        Found::None => {
            let message = format!("No zip of {name} matches `{archive}`. `elise archives list {name}` lists them.");
            return fail(json, Exit::Error, "archive_not_found", &message, &format!("elise archives list {name}"));
        }
        Found::Many(found) => {
            let mut message = format!("`{archive}` matches {} zips of {name}. Name one by its ID:", found.len());
            let listed: Vec<_> = found
                .iter()
                .map(|archive| {
                    message.push_str(&format!("\n  {}  {}  {}", archive.id, archive.label, day(&archive.uploaded_at)));
                    json!({ "id": archive.id, "label": archive.label, "uploadedAt": archive.uploaded_at })
                })
                .collect();
            return access::refuse_with(json, Exit::Usage, "ambiguous_archive", &message, &format!("elise archives list {name}"), listed);
        }
    };
    if !yes && !confirm(&format!("Delete {} from {name} for good?", archive.label)) {
        return fail(json, Exit::Error, "declined", "Nothing was deleted.", "elise archives list");
    }
    if let Err(why) = cli_archives::remove(&client, &app.id, &archive.id).await {
        return access::denied(json, why);
    }
    json::say(json, &format!("Removed {} from {name}.", archive.label));
    if json {
        let shown =
            json!({ "app": { "id": app.id, "name": name }, "archive": { "id": archive.id, "label": archive.label }, "removed": true });
        return json::emit(Exit::Ok, shown, None);
    }
    Exit::Ok
}
