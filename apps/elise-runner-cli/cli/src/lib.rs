pub mod args;
pub mod browser;
pub mod commands;
pub mod completions;
pub mod help;
pub mod store;
pub mod table;
pub mod tools;

use args::{Command, Parsed};
use std::io::IsTerminal;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Exit {
    Ok = 0,
    Error = 1,
    Usage = 2,
    Unpaired = 3,
    Revoked = 4,
    Offline = 5,
    NothingToClaim = 6,
    StoppedFromElise = 7,
}

pub fn main(args: &[String]) -> Exit {
    let command = match args::parse(args) {
        Parsed::Command(command) => command,
        Parsed::Help => {
            print!("{}", help::overview());
            return Exit::Ok;
        }
        Parsed::Page(spec) => {
            print!("{}", help::page(spec));
            return Exit::Ok;
        }
        Parsed::Topic(topic) => {
            print!("{}", help::topic(topic));
            return Exit::Ok;
        }
        Parsed::Commands { json } => {
            if json {
                println!("{}", help::commands_json());
            } else {
                print!("{}", help::commands_list());
            }
            return Exit::Ok;
        }
        Parsed::Completions(shell) => {
            return match completions::script(&shell) {
                Some(script) => {
                    print!("{script}");
                    Exit::Ok
                }
                None => {
                    eprintln!("elise: no completions for `{shell}`. Supported shells: {}", completions::supported());
                    Exit::Usage
                }
            };
        }
        Parsed::Version => {
            println!("elise {}", env!("CARGO_PKG_VERSION"));
            return Exit::Ok;
        }
        Parsed::Usage(problem) => {
            eprintln!("elise: {problem}\nRun `elise --help` for the commands.");
            return Exit::Usage;
        }
    };
    let interactive = !args.iter().any(|arg| arg == "--no-input")
        && (std::io::stdin().is_terminal() || std::env::var_os("ELISE_TEST_TERMINAL").is_some());
    let runtime = tokio::runtime::Builder::new_current_thread().enable_all().build().expect("the async runtime starts");
    let store = store::Store::open();
    runtime.block_on(async {
        match command {
            Command::Pair { code, yes, print_token } => commands::pair(&store, &code, yes, print_token, interactive).await,
            Command::Login { no_browser } => commands::login(&store, no_browser).await,
            Command::Status => commands::status(&store).await,
            Command::Doctor { hosts } => commands::doctor(&store, &hosts).await,
            Command::Unpair => commands::unpair(&store).await,
            Command::Run { once, parallel } => commands::run(&store, once, parallel).await,
            Command::Resume { scan_id } => commands::resume(&scan_id),
        }
    })
}
