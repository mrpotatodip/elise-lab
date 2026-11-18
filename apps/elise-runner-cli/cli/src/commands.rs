// One function per command. Each prints what a person needs and returns the exit code. The token
// never appears in what they print; `pair --print-token` is the one exception, asked for.

use crate::store::{Store, TOKEN_VARIABLE};
use crate::tools::Skill;
use crate::Exit;
use elise_runner_core::pairing::{self, Replaced, RunnerError, RunnerStatus};
use elise_runner_core::scan::{self, Claimed, Event};
use std::io::{BufRead, Write};
use std::sync::Mutex;
use tokio::time::sleep;

const TOKEN_WARNING: &str = "\
The line above is this Runner's token. It is a credential: anyone who has it can claim Scans as
this Runner until the Runner is removed in Elise. Copies stay wherever it is pasted (shell history,
CI variables, container settings).";

// `pair <code>`: enroll, show the account and the Runner name, confirm, then save the token (or,
// with `print_token`, print it and save nothing). Declining revokes the token Elise issued.
pub async fn pair(store: &Store, code: &str, yes: bool, print_token: bool) -> Exit {
    // Under --print-token standard output carries the token alone; everything else goes to stderr.
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

    // The Runner this computer is paired as now, if any: pairing replaces it.
    let previous = if print_token || store.tokens().token().is_none() {
        None
    } else {
        Some(match pairing::status(store.tokens()).await {
            RunnerStatus::Connected { name, account_name } => format!("\"{name}\" in {account_name}"),
            _ => "this computer's earlier Runner".to_string(),
        })
    };

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
        // Only reached when the token was still known to Elise or could not be checked.
        if store.tokens().token().is_some() {
            say(&format!("This computer is already paired as {previous}. Pairing replaces it."));
        }
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

// Asks y/N on the terminal. Anything but yes, including no answer at all, is no.
fn confirm(question: &str) -> bool {
    eprint!("{question} [y/N] ");
    let _ = std::io::stderr().flush();
    let mut answer = String::new();
    if std::io::stdin().lock().read_line(&mut answer).is_err() {
        return false;
    }
    matches!(answer.trim().to_ascii_lowercase().as_str(), "y" | "yes")
}

// `status`: what Elise says this Runner is, and where its token is kept.
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

// `unpair`: Elise drops the token, then it is forgotten here. If Elise cannot be reached the token
// is kept, so the command can be run again.
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

// `run [--once]`: claims Scans and runs them through the core, logging each step on standard output.
// Without `--once` it polls until stopped, as the desktop app does. With `--once` it claims at most
// one Scan: 0 when it succeeded and its result was sent, 1 when not, 6 when there was nothing to
// claim. Either way, a token Elise rejects is forgotten and the program exits with 4.
pub async fn run(store: &Store, once: bool) -> Exit {
    let skill = Skill::new();
    let find_tools = || skill.tools();
    let log = ScanLog::default();
    let on_event = |event: Event| log.tell(event);
    let mut offline = false;
    if !once {
        println!("Waiting for Scans from Elise. Stop with Ctrl-C.");
    }
    loop {
        let Some(token) = store.tokens().token() else {
            eprintln!("This computer is not paired. Pair it with `elise-runner pair <code>`.");
            return Exit::Unpaired;
        };
        match scan::claim(&token).await {
            Claimed::Job(job) => {
                offline = false;
                scan::run_job(&token, *job, &find_tools, &on_event).await;
                if once {
                    return if log.succeeded() { Exit::Ok } else { Exit::Error };
                }
                continue;
            }
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
            Claimed::Removed => {
                store.tokens().forget();
                if store.is_read_only() {
                    eprintln!("Elise rejected the token in {TOKEN_VARIABLE}: the Runner was removed. Pair again to get a new one.");
                } else {
                    eprintln!("Elise rejected the token: the Runner was removed in Elise, so the token was forgotten. Pair again with a new code.");
                }
                return Exit::Revoked;
            }
        }
        sleep(scan::POLL_EVERY).await;
    }
}

// Turns the core's events into plain log lines, each with the repo and the Scan ID, and remembers
// how the last Scan ended.
#[derive(Default)]
struct ScanLog {
    // `owner/name` and the Scan ID of the Scan running now.
    current: Mutex<Option<(String, String)>>,
    succeeded: Mutex<bool>,
}

impl ScanLog {
    fn tell(&self, event: Event) {
        let mut current = self.current.lock().expect("the log is not poisoned");
        if let Event::Claimed { scan_id, repo } = &event {
            *current = Some((repo.clone(), scan_id.clone()));
        }
        let (repo, scan_id) = current.clone().unwrap_or_default();
        let line = match event {
            Event::Claimed { .. } => "Scan claimed".to_string(),
            Event::PhaseStarted { phase } => format!("{phase} phase started"),
            Event::PhaseEnded { phase, cost_usd, pool_left_usd } => {
                let name = if phase == "repair" { "repair run".to_string() } else { format!("{phase} phase") };
                let spent = cost_usd.map(dollars).unwrap_or_else(|| "an unknown amount".to_string());
                format!("{name} ended: spent {spent}, {} left of the Pool", dollars(pool_left_usd))
            }
            Event::RepairStarted => "repair run started: the check failed, the agent gets one run to fix it".to_string(),
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

// Dollars with the cents, and the fractions of a cent a small run costs: `$1.50`, `$0.0034`.
fn dollars(usd: f64) -> String {
    let text = format!("{usd:.4}");
    let text = text.trim_end_matches('0');
    match text.split_once('.') {
        Some((whole, cents)) if cents.len() < 2 => format!("${whole}.{cents:0<2}"),
        _ => format!("${text}"),
    }
}
