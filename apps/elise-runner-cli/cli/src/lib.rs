// The headless Runner: the shared core (`elise-runner-core`) driven from a terminal.
//
// - `args`: the command line, parsed into a `Command`, and the help text.
// - `store`: which token store this run uses (the environment, the keychain or a file).
// - `commands`: one function per command, each returning the program's `Exit` code.

pub mod args;
pub mod commands;
pub mod store;

use args::{Command, Parsed};

// The exit codes. The help text lists them; scripts and health checks rely on them.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Exit {
    // Success; `status`: connected.
    Ok = 0,
    Error = 1,
    Usage = 2,
    Unpaired = 3,
    // Elise rejected the token.
    Revoked = 4,
    // Elise could not be reached.
    Offline = 5,
    // `run --once`: nothing to claim.
    NothingToClaim = 6,
}

// Runs one command line to the end.
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
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .expect("the async runtime starts");
    let store = store::Store::open();
    runtime.block_on(async {
        match command {
            Command::Pair { code, yes, print_token } => commands::pair(&store, &code, yes, print_token).await,
            Command::Status => commands::status(&store).await,
            Command::Unpair => commands::unpair(&store).await,
            Command::Run { once } => commands::run(&store, once).await,
        }
    })
}
