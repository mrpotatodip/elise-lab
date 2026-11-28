# elise-runner-cli

Elise Runner is a small desktop app (Tauri 2, Rust and TypeScript) that runs a scan on your own computer. You pair it with an Elise account using a one-time code. When someone starts a scan and picks this computer, the app clones the repo, runs `claude` on it locally, and sends the report back to Elise.

## What you need

- Claude Code installed and signed in on the computer. The app looks for `claude` in the usual places, then asks a login shell.
- The app kept open while a scan runs.
- A pairing code. Add a runner in Elise to get one. A code works once and expires after 10 minutes. After a code works, the app names the account and waits: nothing is saved, and no scan can run, until you press Connect.

## How it is built

The page never holds the API token. Rust keeps it in the system keychain and makes every call to Elise. The page asks Rust through Tauri commands in `src/api.ts` and draws what comes back.

The folder is one Cargo workspace (`Cargo.toml`, one `Cargo.lock`, one `target`) with three crates: the core (`elise-runner-core`), the desktop app (`elise-runner-desktop`, bundled as "Elise Runner" with the executable `elise-runner` through `mainBinaryName`) and the headless Runner (`elise-runner-cli`, which builds the binary `elise`). Everything a Runner does apart from drawing a window is in the core crate, which has no Tauri dependency. The desktop app is a thin shell over it: window, tray and commands. It tells the core where `claude`, `node` and the bundled skills are (`Tools`, from the app's resource folder), and turns the core's events (claimed, Phase started and ended with its cost and what is left of the pool, repair started, result sent, ended) into its activity.

| Path | What it is |
| --- | --- |
| `src/` | The page: `main.ts`, `views.ts`, `api.ts` (the Tauri commands), `copy.ts` (every string the user reads). |
| `core/src/pairing.rs` | Enroll a code, accept or decline it, the Runner's status, unpairing. |
| `core/src/login.rs` | Log in through the browser: start a login, wait for approval, hand back the enrolled Runner. |
| `core/src/store.rs` | Where the token is kept: the keychain (each program has its own service name), an owner-only file, or a token given from outside (read only). |
| `core/src/scan.rs` | The work loop: claim, clone (or unpack an upload's zip), run `claude` with a fixed tool allowlist, validate the output, upload, and the events it reports. |
| `core/src/providers/` | Where a Scan's code comes from: one module per provider (`github`, `gitlab`, `gitlab_sh`, `upload`), the shared address rules in `address.rs`, and `mod.rs`, the only file that knows them all. A test fails when one provider's module names another's. |
| `src-tauri/src/lib.rs` | The desktop app: the commands, the pending pairing, the activity, the tray. |
| `cli/src/` | The headless Runner: `args.rs` (command line, help text), `browser.rs` (opens the login link), `store.rs` (which token store a run uses), `commands.rs` (one function per command, and the log of `run`), `tools.rs` (the built-in Skill, `claude` and `node`). |
| `cli/tests/` | Process tests: the debug `elise` run against a stub engine (`support/mod.rs`). |

The app has no Scan path of its own. The Scan path (the claim, the clone, the settings file the agent runs under, the four Phases on one Pool, the validators, the repair run, collecting and sending the files, stopping a Scan) is in the core, `core/src/scan.rs`, and the headless Runner runs the same code. Its rules are in `docs/adr/0006-full-worker-and-phase-budget.md`, under "Runner Scans". A Scan from this app uses your Claude login but not your Claude Code settings, and never reads or changes your `~/.claude` folder: that is the core's rule, not this app's. Quitting the app during a Scan kills `claude` and sends no result.

The Rust tests (`cargo test -p elise-runner-core -p elise-runner-cli` in this folder; the desktop crate is left out because it needs the system's GTK libraries to build, and has no tests) run a Scan after the clone against a stub `claude` and `node`, in the core, on a plain tokio runtime, and run the debug `elise` as a process against a stub engine with `ELISE_RUNNER_HOME` set to a temp folder, so no test touches a keychain.

The runner status is one of `unpaired`, `revoked`, `offline` or `connected`. The activity is `idle`, `running` or `finished`.

## Run it

```bash
pnpm --filter elise-runner-cli app:dev     # tauri dev
pnpm --filter elise-runner-cli app:build   # tauri build
pnpm --filter elise-runner-cli check       # tsc --noEmit, cargo fmt --check, cargo clippy (-D warnings) and cargo test for the core and the terminal program
```

## The headless Runner

`elise` does what the desktop app does without a window, on macOS, Linux and Windows (x64). The desktop app is not built for Windows. It is its own Runner with its own token, so on one computer it and the desktop app are two Runners. Its commands, exit codes, token store order and setup are in `cli/README.md`. Build it with `cargo build -p elise-runner-cli` (or `--release`).

### Install

On macOS (arm64 or x64) or Linux (x64 or arm64), one command installs the newest release of the headless Runner to `~/.local/bin` (set `ELISE_RUNNER_INSTALL_DIR` to change it):

```bash
curl -fsSL https://raw.githubusercontent.com/mrpotatodip/elise-lab/main/apps/elise-runner-cli/install.sh | sh
```

Then run `elise login`. The script is `install.sh` in this folder. It takes the newest GitHub Release whose tag starts with `elise-runner-v` and downloads `elise-runner-<darwin|linux>-<arm64|x64>`. It saves the file as `elise` and removes an old `elise-runner` in the same folder, with one line saying so. Any other system is refused with a message.

On Windows (x64, PowerShell), `install.ps1` in this folder does the same: it installs `elise.exe` for your user in `%LOCALAPPDATA%\elise-runner\bin` (set `ELISE_RUNNER_INSTALL_DIR` to change it), adds that folder to your user PATH and needs no administrator rights. It needs Git for Windows installed, and `elise doctor` checks for it.

```powershell
irm https://raw.githubusercontent.com/mrpotatodip/elise-lab/main/apps/elise-runner-cli/install.ps1 | iex
```

Pushing a tag `elise-runner-v<version>` (the version in `cli/Cargo.toml`) runs `.github/workflows/release-elise-runner.yml`: it builds the five binaries on native runners and publishes them on a release. Linux binaries link `libdbus` (for the keychain), so a minimal image needs `libdbus-1-3`. The scripts are checked by hand on a clean macOS, Linux and Windows computer, not by a test.

You need a Rust toolchain for `app:dev`, `app:build` and `check`. `pnpm check:apps` and the pre-commit check run `check` for this folder, so a commit that touches it runs the Rust tests.
