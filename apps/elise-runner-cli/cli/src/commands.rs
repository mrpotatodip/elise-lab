use crate::browser;
use crate::store::{Store, TOKEN_VARIABLE};
use crate::tools::Skill;
use crate::Exit;
use elise_runner_core::login::{self, LoginError, Waited};
use elise_runner_core::pairing::{self, Replaced, RunnerError, RunnerStatus};
use elise_runner_core::scan::{self, Claimed, Event, Stop, Stopper};
use std::io::{BufRead, Write};
use std::sync::Mutex;
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
            eprintln!(
                "Could not reach Elise. The token is kept in {}, so you can run `elise-runner unpair` again.",
                store.describe()
            );
            Exit::Offline
        }
    }
}

pub async fn run(store: &Store, once: bool) -> Exit {
    let Some(stop) = stop_on_signal("Stopping.") else {
        eprintln!("Could not listen for Ctrl-C and stop signals, so a Scan could not be stopped cleanly.");
        return Exit::Error;
    };
    let skill = Skill::new();
    let find_tools = || skill.tools();
    let log = ScanLog::default();
    let on_event = |event: Event| log.tell(event);
    let mut offline = false;
    if !once {
        println!("Waiting for Scans from Elise. Stop with Ctrl-C.");
    }
    let stopped_idle = || {
        eprintln!("Stopped. No Scan was running.");
        Exit::Ok
    };
    loop {
        if stop.is_stopped() {
            return stopped_idle();
        }
        let Some(token) = store.tokens().token() else {
            eprintln!("This computer is not paired. Pair it with `elise-runner pair <code>`.");
            return Exit::Unpaired;
        };
        let claimed_even_if_stopped_meanwhile = scan::claim(&token).await;
        match claimed_even_if_stopped_meanwhile {
            Claimed::Job(job) => {
                offline = false;
                scan::run_job(&token, *job, &find_tools, &on_event, &stop).await;
                if once || stop.is_stopped() {
                    return if log.succeeded() { Exit::Ok } else { Exit::Error };
                }
                continue;
            }
            Claimed::Removed => {
                store.tokens().forget();
                if store.is_read_only() {
                    eprintln!("Elise rejected the token in {TOKEN_VARIABLE}: the Runner was removed. Pair again to get a new one.");
                } else {
                    eprintln!("Elise rejected the token: the Runner was removed in Elise, so the token was forgotten. Pair again with a new code.");
                }
                return Exit::Revoked;
            }
            _ if stop.is_stopped() => return stopped_idle(),
            Claimed::Nothing if once => {
                println!("Nothing to claim.");
                return Exit::NothingToClaim;
            }
            Claimed::Offline if once => {
                eprintln!("Could not reach Elise. Check the connection and try again.");
                return Exit::Offline;
            }
            Claimed::Nothing => offline = false,
            Claimed::Offline => {
                if !offline {
                    eprintln!("Could not reach Elise. Trying again every few seconds.");
                }
                offline = true;
            }
        }
        tokio::select! {
            _ = sleep(scan::POLL_EVERY) => {}
            _ = stop.stopped() => return stopped_idle(),
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
    current_repo_and_scan_id: Mutex<Option<(String, String)>>,
    succeeded: Mutex<bool>,
}

impl ScanLog {
    fn tell(&self, event: Event) {
        let mut current = self.current_repo_and_scan_id.lock().expect("the log is not poisoned");
        if let Event::Claimed { scan_id, repo } = &event {
            *current = Some((repo.clone(), scan_id.clone()));
        }
        let (repo, scan_id) = current.clone().unwrap_or_default();
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
                *self.succeeded.lock().expect("the log is not poisoned") = ok;
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

    fn succeeded(&self) -> bool {
        *self.succeeded.lock().expect("the log is not poisoned")
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
