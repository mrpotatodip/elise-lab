use crate::browser;
use crate::store::{settings_file, Store, TOKEN_VARIABLE};
use crate::tools::Skill;
use crate::Exit;
use elise_runner_core::login::{self, LoginError, Waited};
use elise_runner_core::pairing::{self, Replaced, RunnerError, RunnerStatus};
use elise_runner_core::providers::Settings;
use elise_runner_core::scan::{self, Claimed, Event, Stop, Stopper};
use std::collections::HashMap;
use std::future::{poll_fn, Future};
use std::io::{BufRead, Write};
use std::pin::Pin;
use std::sync::Mutex;
use std::task::Poll;
use tokio::signal::unix::{signal, SignalKind};
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

type Running<'a> = Vec<Pin<Box<dyn Future<Output = ()> + 'a>>>;

async fn one_ended(running: &mut Running<'_>) {
    poll_fn(|cx| {
        let ended = running.iter_mut().position(|scan| scan.as_mut().poll(cx).is_ready());
        match ended {
            Some(index) => {
                drop(running.swap_remove(index));
                Poll::Ready(())
            }
            None => Poll::Pending,
        }
    })
    .await;
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
    let finished = || if log.all_succeeded() { Exit::Ok } else { Exit::Error };
    loop {
        if stop.is_stopped() {
            let had_scans = !running.is_empty();
            while !running.is_empty() {
                one_ended(&mut running).await;
            }
            return if had_scans { finished() } else { stopped_idle() };
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
                            scan::run_job(&token, *job, find_tools, &Settings::load(&settings_file()), on_event, stop).await;
                        }));
                    }
                    Claimed::Removed => {
                        store.tokens().forget();
                        if store.is_read_only() {
                            eprintln!("Elise rejected the token in {TOKEN_VARIABLE}: the Runner was removed. Pair again to get a new one.");
                        } else {
                            eprintln!("Elise rejected the token: the Runner was removed in Elise, so the token was forgotten. Pair again with a new code.");
                        }
                        while !running.is_empty() {
                            one_ended(&mut running).await;
                        }
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
            return finished();
        }
        let may_claim = !(once && claimed_any) && running.len() < parallel;
        if running.is_empty() {
            tokio::select! {
                _ = sleep(scan::POLL_EVERY) => {}
                _ = stop.stopped() => {}
            }
        } else {
            tokio::select! {
                _ = one_ended(&mut running) => {}
                _ = sleep(scan::POLL_EVERY), if may_claim => {}
                _ = stop.stopped() => {}
            }
        }
    }
}

fn stop_on_signal(message: &'static str) -> Option<Stop> {
    let mut interrupt = signal(SignalKind::interrupt()).ok()?;
    let mut terminate = signal(SignalKind::terminate()).ok()?;
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
