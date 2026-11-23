use crate::browser;
use crate::store::{settings_file, Store, TOKEN_VARIABLE};
use crate::tools::Skill;
use crate::Exit;
use elise_runner_core::git_access;
use elise_runner_core::login::{self, LoginError, Waited};
use elise_runner_core::pairing::{self, Replaced, RunnerError, RunnerStatus};
use elise_runner_core::providers::Settings;
use elise_runner_core::scan::{self, Claimed, Event, JobEnd, Stop, Stopper};
use std::collections::HashMap;
use std::future::{poll_fn, Future};
use std::io::{BufRead, Write};
use std::pin::Pin;
use std::sync::Mutex;
use std::task::Poll;
use tokio::time::sleep;

const TOKEN_WARNING: &str = "\
The line above is this Runner's token. It is a credential: anyone who has it can claim Scans as
this Runner until the Runner is removed in Elise. Copies stay wherever it is pasted (shell history,
CI variables, container settings).";

pub async fn pair(store: &Store, code: &str, yes: bool, print_token: bool) -> Exit {
    let say = |line: &str| {
        if print_token {
            eprintln!("{line}");
        } else {
            println!("{line}");
        }
    };
    if !print_token && store.is_read_only() {
        eprintln!(
            "The token comes from {TOKEN_VARIABLE}, which elise-runner does not manage. \
             Unset it to pair this computer, or use `pair <code> --print-token` to get a token for it."
        );
        return Exit::Error;
    }

    let previous = if print_token { None } else { earlier_runner(store, &say).await };

    let enrolled = match pairing::enroll(code).await {
        Ok(enrolled) => enrolled,
        Err(RunnerError::InvalidCode) => {
            eprintln!("That pairing code is wrong, already used or expired. Make a new one in Elise.");
            return Exit::Error;
        }
        Err(_) => {
            eprintln!("Could not reach Elise. Check the connection and try again.");
            return Exit::Offline;
        }
    };
    say(&format!("Account: {}\nRunner:  {}", enrolled.account_name, enrolled.name));
    if let Some(previous) = &previous {
        say(&format!("This computer is already paired as {previous}. Pairing replaces it."));
    }

    if !yes && !confirm(&format!("Connect this computer to {} as \"{}\"?", enrolled.account_name, enrolled.name)) {
        pairing::decline(enrolled).await;
        say("Not paired. Elise was told to drop the token it issued.");
        return Exit::Error;
    }

    if print_token {
        println!("{}", enrolled.into_token());
        eprintln!("{TOKEN_WARNING}");
        return Exit::Ok;
    }

    let (name, account_name) = (enrolled.name.clone(), enrolled.account_name.clone());
    match pairing::accept_replacing(store.tokens(), enrolled).await {
        Ok((_, replaced)) => {
            say(&format!("Paired as \"{name}\" in {account_name}. The token is kept in {}.", store.describe()));
            if replaced == Replaced::StillLive {
                eprintln!(
                    "Could not reach Elise to revoke the token of {}. Remove that Runner in Elise's Runners list.",
                    previous.as_deref().unwrap_or("this computer's earlier Runner")
                );
            }
            Exit::Ok
        }
        Err(_) => {
            eprintln!("The token could not be saved in {}. Elise was told to drop it.", store.describe());
            Exit::Error
        }
    }
}

async fn earlier_runner(store: &Store, say: &dyn Fn(&str)) -> Option<String> {
    store.tokens().token()?;
    match pairing::status(store.tokens()).await {
        RunnerStatus::Connected { name, account_name } => Some(format!("\"{name}\" in {account_name}")),
        RunnerStatus::Revoked => {
            say("This computer's old token was no longer valid in Elise, so it was removed.");
            None
        }
        _ => Some("this computer's earlier Runner".to_string()),
    }
}

pub async fn login(store: &Store, no_browser: bool) -> Exit {
    if store.is_read_only() {
        eprintln!(
            "The token comes from {TOKEN_VARIABLE}, which elise-runner does not manage. \
             Unset it to log in this computer."
        );
        return Exit::Error;
    }
    let Some(stop) = stop_on_signal("Login cancelled.") else {
        eprintln!("Could not listen for Ctrl-C and stop signals, so the login could not be cancelled.");
        return Exit::Error;
    };
    let previous = earlier_runner(store, &|line| println!("{line}")).await;
    if let Some(previous) = &previous {
        println!("This computer is already paired as {previous}. Logging in replaces it.");
    }

    let started = match login::start(env!("CARGO_PKG_VERSION")).await {
        Ok(started) => started,
        Err(LoginError::Unsupported) => {
            eprintln!("This Elise does not support login yet; use `elise-runner pair <code>`.");
            return Exit::Error;
        }
        Err(LoginError::Unreachable) => {
            eprintln!("Could not reach Elise. Check the connection and try again.");
            return Exit::Offline;
        }
    };
    println!("Open this link and approve this computer in Elise:\n  {}\nCode: {}", started.verification_url, started.user_code);
    if !no_browser {
        browser::open(&started.verification_url);
    }
    println!("Waiting for approval. Stop with Ctrl-C.");

    let enrolled = match login::wait(&started, &stop).await {
        Waited::Approved(enrolled) => enrolled,
        Waited::Cancelled => return Exit::Error,
        Waited::Expired => {
            eprintln!("The code expired; run `elise-runner login` again.");
            return Exit::Error;
        }
        Waited::Denied => {
            eprintln!("The request was denied in Elise.");
            return Exit::Error;
        }
        Waited::Refused => {
            eprintln!("Elise did not accept this login. Run `elise-runner login` again.");
            return Exit::Error;
        }
    };

    let (name, account_name) = (enrolled.name.clone(), enrolled.account_name.clone());
    match pairing::accept_replacing(store.tokens(), enrolled).await {
        Ok((_, replaced)) => {
            println!("Logged in as \"{name}\" in {account_name}. The token is kept in {}.", store.describe());
            if replaced == Replaced::StillLive {
                eprintln!(
                    "Could not reach Elise to revoke the token of {}. Remove that Runner in Elise's Runners list.",
                    previous.as_deref().unwrap_or("this computer's earlier Runner")
                );
            }
            Exit::Ok
        }
        Err(_) => {
            eprintln!("The token could not be saved in {}. Elise was told to drop it.", store.describe());
            Exit::Error
        }
    }
}

fn confirm(question: &str) -> bool {
    eprint!("{question} [y/N] ");
    let _ = std::io::stderr().flush();
    let mut answer = String::new();
    if std::io::stdin().lock().read_line(&mut answer).is_err() {
        return false;
    }
    matches!(answer.trim().to_ascii_lowercase().as_str(), "y" | "yes")
}

pub async fn status(store: &Store) -> Exit {
    let place = store.describe();
    match pairing::status(store.tokens()).await {
        RunnerStatus::Connected { name, account_name } => {
            println!("connected: Runner \"{name}\" in {account_name}\nToken store: {place}");
            Exit::Ok
        }
        RunnerStatus::Unpaired => {
            println!("unpaired: no token in {place}. Pair with `elise-runner pair <code>`.");
            Exit::Unpaired
        }
        RunnerStatus::Revoked if store.is_read_only() => {
            println!("revoked: Elise rejected the token in {TOKEN_VARIABLE}. Pair again to get a new one.");
            Exit::Revoked
        }
        RunnerStatus::Revoked => {
            println!("revoked: Elise rejected the token, so it was removed from {place}. Pair again with a new code.");
            Exit::Revoked
        }
        RunnerStatus::Offline => {
            println!("offline: Elise could not be reached.\nToken store: {place}");
            Exit::Offline
        }
    }
}

async fn tool_output(program: &std::path::Path, args: &[&str]) -> Option<std::process::Output> {
    let mut command = tokio::process::Command::new(program);
    command.args(args).stdin(std::process::Stdio::null()).kill_on_drop(true);
    tokio::time::timeout(std::time::Duration::from_secs(30), command.output()).await.ok()?.ok()
}

async fn git_installed() -> Result<String, String> {
    let output = tool_output(std::path::Path::new("git"), &["--version"]).await.filter(|output| output.status.success());
    match output {
        Some(output) => Ok(Some(String::from_utf8_lossy(&output.stdout).trim().to_string())
            .filter(|v| !v.is_empty())
            .unwrap_or_else(|| "installed".to_string())),
        None => {
            Err("git was not found on this computer. Install it from https://git-scm.com/downloads, then run doctor again.".to_string())
        }
    }
}

async fn claude_signed_in() -> Result<String, String> {
    let Some(claude) = crate::tools::find_claude() else {
        return Err("`claude` (Claude Code) was not found on this computer. Install Claude Code, then run `claude auth login` as the user the Runner runs as.".to_string());
    };
    match tool_output(&claude, &["auth", "status"]).await {
        Some(output) if output.status.success() => Ok(format!("signed in ({})", claude.display())),
        _ => Err("`claude` is not signed in. Run `claude auth login` as the user the Runner runs as.".to_string()),
    }
}

async fn runner_paired(store: &Store) -> Result<String, String> {
    match pairing::status(store.tokens()).await {
        RunnerStatus::Connected { name, account_name } => Ok(format!("Runner \"{name}\" in {account_name}")),
        RunnerStatus::Unpaired => {
            Err("this computer is not paired. Run `elise-runner login`, or `elise-runner pair <code>` with a code from Elise.".to_string())
        }
        RunnerStatus::Revoked => {
            Err("Elise rejected this Runner's token. Run `elise-runner login` or `elise-runner pair <code>` again.".to_string())
        }
        RunnerStatus::Offline => Err("Elise could not be reached. Check the connection, then run doctor again.".to_string()),
    }
}

pub async fn doctor(store: &Store, named: &[String]) -> Exit {
    let mut all_passed = true;
    let mut report = |name: &str, result: Result<String, String>| match result {
        Ok(detail) => println!("pass  {name}: {detail}"),
        Err(fix) => {
            all_passed = false;
            println!("FAIL  {name}: {fix}");
        }
    };
    let git = git_installed().await;
    let git_found = git.is_ok();
    report("git", git);
    #[cfg(windows)]
    {
        use elise_runner_core::find;
        report("git for windows", find::git_for_windows_verdict(git_found, &find::WinEnv::from_process(), &|p| p.is_file()));
    }
    report("claude", claude_signed_in().await);
    #[cfg(windows)]
    report(
        "node",
        elise_runner_core::find::find_on_windows("node").map(|node| node.display().to_string()).ok_or_else(|| {
            "`node` (Node.js) was not found on this computer. Install it from https://nodejs.org, then run doctor again.".to_string()
        }),
    );
    report("paired", runner_paired(store).await);

    let settings = Settings::load(&settings_file());
    if let Some(problem) = &settings.problem {
        report("settings", Err(format!("the Runner's settings file was not used: {problem}.")));
    }
    let defaults = ["github.com".to_string(), "gitlab.com".to_string()];
    let mut hosts: Vec<&String> = Vec::new();
    for host in named.iter().chain(&settings.gitlab_hosts) {
        if !hosts.contains(&host) {
            hosts.push(host);
        }
    }
    if hosts.is_empty() {
        hosts.extend(defaults.iter());
    }
    for host in hosts {
        if !git_found {
            println!("skip  {host}: needs git");
            continue;
        }
        let result = match elise_runner_core::providers::probe_address(host, &settings) {
            Ok(address) => git_access::check_host(&address).await.map(|()| "git can read from this host".to_string()),
            Err(refusal) => Err(refusal),
        };
        report(host, result);
    }
    if all_passed {
        Exit::Ok
    } else {
        Exit::Error
    }
}

pub async fn unpair(store: &Store) -> Exit {
    if store.is_read_only() {
        eprintln!(
            "The token comes from {TOKEN_VARIABLE}, which elise-runner does not manage. \
             Remove the Runner in Elise, then unset the variable."
        );
        return Exit::Error;
    }
    if store.tokens().token().is_none() {
        println!("This computer is not paired.");
        return Exit::Ok;
    }
    match pairing::unpair(store.tokens()).await {
        Ok(_) => {
            println!("Unpaired: Elise dropped the token and it was removed from {}.", store.describe());
            Exit::Ok
        }
        Err(_) => {
            eprintln!("Could not reach Elise. The token is kept in {}, so you can run `elise-runner unpair` again.", store.describe());
            Exit::Offline
        }
    }
}

type Running<'a> = Vec<Pin<Box<dyn Future<Output = JobEnd> + 'a>>>;

async fn one_ended(running: &mut Running<'_>) -> JobEnd {
    poll_fn(|cx| {
        for index in 0..running.len() {
            if let Poll::Ready(end) = running[index].as_mut().poll(cx) {
                drop(running.swap_remove(index));
                return Poll::Ready(end);
            }
        }
        Poll::Pending
    })
    .await
}

#[derive(Default)]
struct Ends {
    removed: bool,
    stopped_from_elise: bool,
}

impl Ends {
    fn note(&mut self, store: &Store, end: JobEnd) {
        match end {
            JobEnd::Removed if !self.removed => {
                self.removed = true;
                store.tokens().forget();
                eprintln!("Elise rejected the token during the Scan: the Runner was removed, so the Scan was stopped and the token was forgotten. Pair again with a new code.");
            }
            JobEnd::StoppedFromElise => self.stopped_from_elise = true,
            JobEnd::Removed | JobEnd::Ended => {}
        }
    }

    async fn drain(&mut self, store: &Store, running: &mut Running<'_>) {
        while !running.is_empty() {
            let end = one_ended(running).await;
            self.note(store, end);
        }
    }
}

pub async fn run(store: &Store, once: bool, parallel: usize) -> Exit {
    let Some(stop) = stop_on_signal("Stopping.") else {
        eprintln!("Could not listen for Ctrl-C and stop signals, so a Scan could not be stopped cleanly.");
        return Exit::Error;
    };
    let skill = Skill::new();
    let find_tools = || skill.tools();
    let log = ScanLog::default();
    let on_event = |scan_id: &str, event: Event| log.tell(scan_id, event);
    let (find_tools, on_event, stop) = (&find_tools, &on_event, &stop);
    let mut running: Running<'_> = Vec::new();
    let mut claimed_any = false;
    let mut offline = false;
    if !once {
        println!("Waiting for Scans from Elise. Stop with Ctrl-C.");
    }
    if parallel > 1 {
        println!("Running up to {parallel} Scans at once. Elise allows 3 live Runner Scans for an Account, shared with its other Runners.");
    }
    let stopped_idle = || {
        eprintln!("Stopped. No Scan was running.");
        Exit::Ok
    };
    let mut ends = Ends::default();
    let finished = |ends: &Ends| {
        if ends.removed {
            Exit::Revoked
        } else if once && ends.stopped_from_elise {
            Exit::StoppedFromElise
        } else if log.all_succeeded() {
            Exit::Ok
        } else {
            Exit::Error
        }
    };
    loop {
        if ends.removed {
            ends.drain(store, &mut running).await;
            return Exit::Revoked;
        }
        if stop.is_stopped() {
            ends.drain(store, &mut running).await;
            return if log.any_ended() || ends.removed || (once && ends.stopped_from_elise) { finished(&ends) } else { stopped_idle() };
        }
        let claiming = !(once && claimed_any);
        if claiming && running.len() < parallel {
            let Some(token) = store.tokens().token() else {
                eprintln!("This computer is not paired. Pair it with `elise-runner pair <code>`.");
                return Exit::Unpaired;
            };
            while running.len() < parallel {
                match scan::claim(&token).await {
                    Claimed::Job(job) => {
                        offline = false;
                        claimed_any = true;
                        let token = token.clone();
                        running.push(Box::pin(async move {
                            scan::run_job(&token, *job, find_tools, &Settings::load(&settings_file()), on_event, stop).await
                        }));
                    }
                    Claimed::Removed => {
                        store.tokens().forget();
                        if store.is_read_only() {
                            eprintln!("Elise rejected the token in {TOKEN_VARIABLE}: the Runner was removed. Pair again to get a new one.");
                        } else {
                            eprintln!("Elise rejected the token: the Runner was removed in Elise, so the token was forgotten. Pair again with a new code.");
                        }
                        ends.drain(store, &mut running).await;
                        return Exit::Revoked;
                    }
                    _ if stop.is_stopped() => break,
                    Claimed::Nothing if once && !claimed_any => {
                        println!("Nothing to claim.");
                        return Exit::NothingToClaim;
                    }
                    Claimed::Offline if once && !claimed_any => {
                        eprintln!("Could not reach Elise. Check the connection and try again.");
                        return Exit::Offline;
                    }
                    Claimed::Nothing => {
                        offline = false;
                        break;
                    }
                    Claimed::Offline => {
                        if !offline {
                            eprintln!("Could not reach Elise. Trying again every few seconds.");
                        }
                        offline = true;
                        break;
                    }
                }
                if once && claimed_any && running.len() >= parallel {
                    break;
                }
            }
        }
        if once && claimed_any && running.is_empty() {
            return finished(&ends);
        }
        let may_claim = !(once && claimed_any) && running.len() < parallel;
        if running.is_empty() {
            tokio::select! {
                _ = sleep(scan::POLL_EVERY) => {}
                _ = stop.stopped() => {}
            }
        } else {
            tokio::select! {
                end = one_ended(&mut running) => ends.note(store, end),
                _ = sleep(scan::POLL_EVERY), if may_claim => {}
                _ = stop.stopped() => {}
            }
        }
    }
}

#[cfg(unix)]
fn stop_signals() -> Option<(tokio::signal::unix::Signal, tokio::signal::unix::Signal)> {
    use tokio::signal::unix::{signal, SignalKind};
    Some((signal(SignalKind::interrupt()).ok()?, signal(SignalKind::terminate()).ok()?))
}

#[cfg(windows)]
fn stop_signals() -> Option<(tokio::signal::windows::CtrlC, tokio::signal::windows::CtrlBreak)> {
    Some((tokio::signal::windows::ctrl_c().ok()?, tokio::signal::windows::ctrl_break().ok()?))
}

fn stop_on_signal(message: &'static str) -> Option<Stop> {
    let (mut interrupt, mut terminate) = stop_signals()?;
    let (stopper, stop) = Stopper::new();
    tokio::spawn(async move {
        tokio::select! {
            _ = interrupt.recv() => {}
            _ = terminate.recv() => {}
        }
        eprintln!("{message}");
        stopper.stop();
    });
    Some(stop)
}

#[derive(Default)]
struct ScanLog {
    state: Mutex<LogState>,
}

#[derive(Default)]
struct LogState {
    repos: HashMap<String, String>,
    ended: usize,
    failed: usize,
}

impl ScanLog {
    fn tell(&self, scan_id: &str, event: Event) {
        let mut state = self.state.lock().expect("the log is not poisoned");
        if let Event::Claimed { repo, .. } = &event {
            state.repos.insert(scan_id.to_string(), repo.clone());
        }
        let repo = state.repos.get(scan_id).cloned().unwrap_or_default();
        let line = match event {
            Event::Claimed { .. } => "Scan claimed".to_string(),
            Event::PhaseStarted { phase } => format!("{} started", scan::run_label(&phase)),
            Event::PhaseEnded { phase, cost_usd, pool_left_usd } => {
                let spent = cost_usd.map(dollars).unwrap_or_else(|| "an unknown amount".to_string());
                format!("{} ended: spent {spent}, {} left of the Pool", scan::run_label(&phase), dollars(pool_left_usd))
            }
            Event::RepairStarted => "the repair run started: the check failed, the agent gets one run to fix it".to_string(),
            Event::ResultSent { sent: true } => "result sent to Elise".to_string(),
            Event::ResultSent { sent: false } => "the result could not be sent to Elise".to_string(),
            Event::StoppedFromElise { kept, .. } => {
                let kept = kept.map(|path| format!(" Work folder kept: {}", path.display())).unwrap_or_default();
                format!("Scan stopped from Elise.{kept}")
            }
            Event::Ended { ok, message, kept, .. } => {
                state.ended += 1;
                if !ok {
                    state.failed += 1;
                }
                let kept = kept.map(|path| format!(" Work folder kept: {}", path.display())).unwrap_or_default();
                if ok {
                    format!("Scan succeeded.{kept}")
                } else {
                    format!("Scan failed: {message}{kept}")
                }
            }
        };
        println!("[{repo} {scan_id}] {line}");
    }

    fn any_ended(&self) -> bool {
        self.state.lock().expect("the log is not poisoned").ended > 0
    }

    fn all_succeeded(&self) -> bool {
        let state = self.state.lock().expect("the log is not poisoned");
        state.ended > 0 && state.failed == 0
    }
}

fn dollars(usd: f64) -> String {
    let text = format!("{usd:.4}");
    let text = text.trim_end_matches('0');
    match text.split_once('.') {
        Some((whole, cents)) if cents.len() < 2 => format!("${whole}.{cents:0<2}"),
        _ => format!("${text}"),
    }
}
