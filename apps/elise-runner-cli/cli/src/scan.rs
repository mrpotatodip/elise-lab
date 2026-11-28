use crate::access::{self, Resolved};
use crate::commands::{self, confirm, dollars, fail};
use crate::json;
use crate::scan_args::ScanArgs;
use crate::store::Store;
use crate::Exit;
use elise_runner_core::engine::dashboard_url;
use elise_runner_core::engine_client::{Denied, EngineClient, Scope};
use elise_runner_core::scan_start::{self, Choice, Progress, RunnerRow};
use serde_json::{json, Value};
use std::time::{Duration, Instant};
use tokio::time::sleep;

const DEFAULT_TIMEOUT_SECS: u64 = 3600;
const AFTER_RUN_SECS: u64 = 30;
const POLL_EVERY: Duration = Duration::from_secs(5);

fn poll_every() -> Duration {
    #[cfg(debug_assertions)]
    if let Some(millis) = std::env::var("ELISE_SCAN_POLL_MS").ok().and_then(|text| text.parse().ok()) {
        return Duration::from_millis(millis);
    }
    POLL_EVERY
}

fn usage(json: bool, code: &str, message: &str) -> Exit {
    fail(json, Exit::Usage, code, message, "elise help scan")
}

fn runner_refusal(json: bool, code: &str, headline: &str, runners: &[RunnerRow]) -> Exit {
    let mut message = headline.to_string();
    let listed: Vec<Value> = runners
        .iter()
        .map(|runner| {
            message.push_str(&format!("\n  {}  {}", runner.id, runner.name));
            json!({ "id": runner.id, "name": runner.name })
        })
        .collect();
    access::refuse_with(json, Exit::Usage, code, &message, "elise scan --runner <name>", listed)
}

fn end(json: bool, exit: Exit, scan: Value, code: &str, message: &str, next: &str) -> Exit {
    if exit == Exit::Ok {
        json::say(json, message);
        if json {
            return json::emit(Exit::Ok, json!({ "scan": scan }), None);
        }
        return Exit::Ok;
    }
    eprintln!("{message}");
    if json {
        return json::emit(exit, json!({ "scan": scan }), Some(json::Failure { code, message, next }));
    }
    exit
}

enum Followed {
    Over(Progress),
    Open(String),
}

async fn follow(client: &EngineClient<'_>, scan_id: &str, seconds: u64, json: bool) -> Result<Followed, Exit> {
    let deadline = Instant::now() + Duration::from_secs(seconds);
    let mut last = "queued".to_string();
    let mut told_offline = false;
    loop {
        match scan_start::progress(client, scan_id).await {
            Ok(progress) => {
                told_offline = false;
                if progress.status != last {
                    json::say(json, &format!("Scan {scan_id}: {}", progress.status));
                    last = progress.status.clone();
                }
                if progress.is_over() {
                    return Ok(Followed::Over(progress));
                }
            }
            Err(Denied::Offline) => {
                if !told_offline {
                    eprintln!("Could not reach Elise. Trying again.");
                    told_offline = true;
                }
            }
            Err(why) => return Err(access::denied(json, why)),
        }
        if Instant::now() >= deadline {
            return Ok(Followed::Open(last));
        }
        sleep(poll_every()).await;
    }
}

async fn choose_runner(store: &Store, client: &EngineClient<'_>, args: &ScanArgs) -> Result<RunnerRow, Exit> {
    let json = args.json;
    let here = scan_start::this_runner(store.tokens()).await;
    if args.run {
        let Some(here) = here else {
            let message = "`--run` runs the Scan on this computer, and this computer has no working Runner. Run `elise login` and choose to run Scans here, or leave out `--run`.";
            return Err(fail(json, Exit::Unpaired, "unpaired", message, "elise login"));
        };
        let other =
            args.runner.as_deref().filter(|wanted| !here.id.eq_ignore_ascii_case(wanted) && !here.name.eq_ignore_ascii_case(wanted));
        if other.is_some() {
            return Err(usage(
                json,
                "run_needs_this_runner",
                "`--run` runs the Scan on this computer, so it uses this computer's Runner, not another.",
            ));
        }
        return Ok(here);
    }
    let listed = scan_start::list_runners(client).await.map_err(|why| access::denied(json, why))?;
    match scan_start::choose(args.runner.as_deref(), here.as_ref(), &listed) {
        Choice::One(runner) => Ok(runner),
        Choice::Unknown(wanted) => {
            let connected: Vec<RunnerRow> = listed.into_iter().filter(|runner| runner.state == "connected").collect();
            Err(runner_refusal(
                json,
                "unknown_runner",
                &format!("No connected Runner is called `{wanted}`. Connected Runners:"),
                &connected,
            ))
        }
        Choice::Many(runners) => {
            let headline = match args.runner {
                Some(_) => "That name fits more than one Runner. Name one by its ID:",
                None => "More than one Runner could take this Scan. Choose one with `--runner`:",
            };
            Err(runner_refusal(json, "runner_needed", headline, &runners))
        }
        Choice::None => {
            let message =
                "This Account has no connected Runner. Run `elise login` and choose to run Scans on this computer, or add one in Elise.";
            Err(fail(json, Exit::Usage, "no_runner", message, "elise login"))
        }
    }
}

pub async fn scan(store: &Store, args: &ScanArgs, interactive: bool) -> Exit {
    let json = args.json;
    let profile = match args.profile.as_deref() {
        None => scan_start::DEFAULT_PROFILE,
        Some(text) => match scan_start::profile_of(text) {
            Some(profile) => profile,
            None => return usage(json, "bad_profile", &format!("`--profile` takes one of: {}", scan_start::profile_names())),
        },
    };
    let budget = match args.budget.as_deref() {
        None => None,
        Some(text) => match text.parse::<f64>().ok().filter(|budget| budget.is_finite() && *budget > 0.0) {
            Some(budget) => Some(budget),
            None => return usage(json, "bad_budget", "`--budget` takes a number of dollars above 0"),
        },
    };
    let timeout = match args.timeout.as_deref() {
        None => DEFAULT_TIMEOUT_SECS,
        Some(text) => match scan_start::parse_timeout(text) {
            Some(seconds) => seconds,
            None => return usage(json, "bad_timeout", "`--timeout` takes a time such as 90, 30m or 2h"),
        },
    };
    if args.timeout.is_some() && !args.wait {
        return usage(json, "timeout_needs_wait", "`--timeout` goes with `--wait`");
    }
    if !args.yes && !interactive {
        let message = "`scan` asks before it starts a Scan, and no question can be asked here. Add `--yes` to start it.";
        return fail(json, Exit::Usage, "needs_yes", message, "elise scan --yes");
    }
    let client = match access::client(store, Scope::Start, json) {
        Ok(client) => client,
        Err(exit) => return exit,
    };
    let text = args.repo.as_deref().unwrap_or(".");
    let (known, added, local_branch) = match access::resolve_repo(&client, text, json).await {
        Ok(Resolved::Known(target)) => (Some(target.repo), None, target.branch),
        Ok(Resolved::New { name, branch }) => match scan_start::new_repo(&name) {
            Some(added) => (None, Some(added), branch),
            None => return usage(json, "bad_repo_name", &format!("`{text}` is not a repo elise can add")),
        },
        Err(exit) => return exit,
    };
    let (provider, url, shown_repo) = match (&known, &added) {
        (Some(repo), _) => (repo.provider().to_string(), repo.url.clone(), repo.name()),
        (None, Some(added)) => (added.provider.to_string(), added.url.clone(), added.url.trim_start_matches("https://").to_string()),
        (None, None) => return usage(json, "bad_repo_name", &format!("`{text}` is not a repo elise can add")),
    };
    if provider == "upload" {
        return usage(json, "upload_repo", &format!("`{shown_repo}` is an uploaded app. Scan it with `elise scan --zip`."));
    }
    let branch = args.branch.clone().or(local_branch);
    let runner = match choose_runner(store, &client, args).await {
        Ok(runner) => runner,
        Err(exit) => return exit,
    };
    let shown_branch = branch.clone().or_else(|| known.as_ref().and_then(|repo| repo.default_branch.clone()));
    let new_note = if added.is_some() { " (new: it will be added)" } else { "" };
    json::say(json, &format!("Repo:    {shown_repo}{new_note}"));
    json::say(json, &format!("Branch:  {}", shown_branch.as_deref().unwrap_or("the default branch")));
    json::say(json, &format!("Profile: {profile}"));
    json::say(json, &format!("Cap:     {}", budget.map(dollars).unwrap_or_else(|| "the profile's default".to_string())));
    json::say(json, &format!("Runner:  {}", runner.name));
    if !args.yes && !confirm("Start this Scan?") {
        return fail(json, Exit::Error, "declined", "Nothing was started.", "elise scan");
    }
    if let Some(added) = &added {
        if let Err(why) = scan_start::add_repo(&client, added).await {
            return access::denied(json, why);
        }
    }
    let request = scan_start::Request { provider: &provider, url: &url, branch: branch.as_deref(), profile, budget, runner_id: &runner.id };
    let queued = match scan_start::start(&client, &request).await {
        Ok(queued) => queued,
        Err(why) => return access::denied(json, why),
    };
    let link = format!("{}/scans/{}", dashboard_url(), queued.scan_id);
    let mut shown = json!({
        "id": queued.scan_id,
        "repo": shown_repo,
        "branch": shown_branch,
        "profile": queued.profile.as_deref().unwrap_or(profile),
        "capUsd": queued.max_budget_usd.or(budget),
        "runner": { "id": runner.id, "name": runner.name },
        "status": "queued",
        "link": link,
    });
    json::say(json, &format!("Scan queued: {}", queued.scan_id));
    json::say(json, &format!("Link: {link}"));
    if !args.wait && !args.run {
        if json {
            return json::emit(Exit::Ok, json!({ "scan": shown }), None);
        }
        return Exit::Ok;
    }
    let next = format!("elise scan show {}", queued.scan_id);
    let finished = if args.run {
        let exit = commands::run(store, true, 1, json).await;
        if !matches!(exit, Exit::Ok | Exit::Error | Exit::StoppedFromElise) {
            return exit;
        }
        follow(&client, &queued.scan_id, AFTER_RUN_SECS, json).await
    } else {
        follow(&client, &queued.scan_id, timeout, json).await
    };
    let done = match finished {
        Ok(Followed::Over(done)) => done,
        Ok(Followed::Open(status)) if args.run => {
            shown["status"] = json!(status);
            let message = format!("The Runner stopped before the Scan finished. See it at {link}");
            return end(json, Exit::Error, shown, "scan_unfinished", &message, &next);
        }
        Ok(Followed::Open(status)) => {
            shown["status"] = json!(status);
            let message = format!("The Scan is still running after {} seconds. It keeps running: {link}", timeout);
            return end(json, Exit::TimedOut, shown, "wait_timeout", &message, &next);
        }
        Err(exit) => return exit,
    };
    shown["status"] = json!(done.status);
    shown["costUsd"] = json!(done.usage.as_ref().map(|usage| usage.cost_usd));
    shown["summary"] = json!(done.summary);
    shown["error"] = json!(done.error);
    let partial = done.status == "succeeded"
        && match scan_start::is_partial(&client, &queued.scan_id).await {
            Ok(partial) => partial,
            Err(why) => return access::denied(json, why),
        };
    shown["partial"] = json!(partial);
    let spent = done.usage.as_ref().map(|usage| format!(" Cost {}.", dollars(usage.cost_usd))).unwrap_or_default();
    match (done.status.as_str(), partial) {
        ("succeeded", false) => end(json, Exit::Ok, shown, "", &format!("Scan succeeded.{spent} {link}"), ""),
        ("succeeded", true) => {
            let message = format!("The Scan ended as a Partial Scan: money or time ran out before it covered everything.{spent} {link}");
            end(json, Exit::PartialScan, shown, "partial_scan", &message, &next)
        }
        ("failed", _) => {
            let why = done.error.as_deref().unwrap_or("it gave no reason");
            end(json, Exit::Error, shown, "scan_failed", &format!("The Scan failed: {why}.{spent} {link}"), &next)
        }
        _ => end(json, Exit::StoppedFromElise, shown, "scan_stopped", &format!("The Scan was stopped. {link}"), &next),
    }
}
