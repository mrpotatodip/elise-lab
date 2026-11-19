pub mod args;
pub mod browser;
pub mod commands;
pub mod store;
pub mod tools;

use args::{Command, Parsed};

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
            print!("{}", args::HELP);
            return Exit::Ok;
        }
        Parsed::Version => {
            println!("elise-runner {}", env!("CARGO_PKG_VERSION"));
            return Exit::Ok;
        }
        Parsed::Usage(problem) => {
            eprintln!("elise-runner: {problem}\nRun `elise-runner --help` for the commands.");
            return Exit::Usage;
        }
    };
    let runtime = tokio::runtime::Builder::new_current_thread().enable_all().build().expect("the async runtime starts");
    let store = store::Store::open();
    runtime.block_on(async {
        match command {
            Command::Pair { code, yes, print_token } => commands::pair(&store, &code, yes, print_token).await,
            Command::Login { no_browser } => commands::login(&store, no_browser).await,
            Command::Status => commands::status(&store).await,
            Command::Unpair => commands::unpair(&store).await,
            Command::Run { once, parallel } => commands::run(&store, once, parallel).await,
        }
    })
}
