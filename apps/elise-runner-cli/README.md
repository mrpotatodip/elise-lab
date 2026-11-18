# elise-runner-cli

Elise Runner is a small desktop app (Tauri 2, Rust and TypeScript) that runs a scan on your own computer. You pair it with an Elise account using a one-time code. When someone starts a scan and picks this computer, the app clones the repo, runs `claude` on it locally, and sends the report back to Elise.

## What you need

- Claude Code installed and signed in on the computer. The app looks for `claude` in the usual places, then asks a login shell.
- The app kept open while a scan runs.
- A pairing code. Add a runner in Elise to get one. A code works once and expires after 10 minutes. After a code works, the app names the account and waits: nothing is saved, and no scan can run, until you press Connect.

## How it is built

The page never holds the API token. Rust keeps it in the system keychain and makes every call to Elise. The page asks Rust through Tauri commands in `src/api.ts` and draws what comes back.

The folder is one Cargo workspace (`Cargo.toml`, one `Cargo.lock`, one `target`) with three crates: the core (`elise-runner-core`), the desktop app (`elise-runner-desktop`, bundled as "Elise Runner" with the executable `elise-runner` through `mainBinaryName`) and the headless Runner (`elise-runner-cli`, which builds the binary `elise-runner`). Everything a Runner does apart from drawing a window is in the core crate, which has no Tauri dependency. The desktop app is a thin shell over it: window, tray and commands. It tells the core where `claude`, `node` and the bundled skills are (`Tools`, from the app's resource folder), and turns the core's events (claimed, Phase started and ended with its cost and what is left of the pool, repair started, result sent, ended) into its activity.

| Path | What it is |
| --- | --- |
| `src/` | The page: `main.ts`, `views.ts`, `api.ts` (the Tauri commands), `copy.ts` (every string the user reads). |
| `core/src/pairing.rs` | Enroll a code, accept or decline it, the Runner's status, unpairing. |
| `core/src/store.rs` | Where the token is kept: the keychain (each program has its own service name), an owner-only file, or a token given from outside (read only). |
| `core/src/scan.rs` | The work loop: claim, clone, run `claude` with a fixed tool allowlist, validate the output, upload, and the events it reports. |
| `src-tauri/src/lib.rs` | The desktop app: the commands, the pending pairing, the activity, the tray. |
| `cli/src/` | The headless Runner: `args.rs` (command line, help text), `store.rs` (which token store a run uses), `commands.rs` (one function per command, and the log of `run`), `tools.rs` (the built-in Skill, `claude` and `node`). |
| `cli/tests/` | Process tests: the debug `elise-runner` run against a stub engine (`support/mod.rs`). |

A scan uses your Claude login but not your Claude Code settings. The app writes its own settings file and the audit skill into the scan's work folder and tells `claude` to load only that (`--setting-sources project`), so an allow rule you keep for daily work, such as `curl`, cannot widen what the agent may do. Your `~/.claude` folder is neither read nor changed.

A job says which audit to run (`lite` or `full`). A full job that carries `phasePrompts` runs the four Phases (recon, hunt, check, report) as four runs of `claude`, in order, each on its own prompt and with the cloud's time slot (10, 45, 25 and 10 minutes). They spend one pool: the lower of the job's `profileCapUsd` and the Runner's own ceiling, less what the earlier Phases reported in their results, passed to each run as `--max-budget-usd`. A Phase that finds nothing left does not start, and a Phase the limit stops ends the Scan with an error that names it; the app never makes such a Scan a Partial Scan. A Phase that fails names itself in the error and the work folder stays, with the earlier Phases' files in it. The app runs the audit skill's validators after the check Phase. If one fails, the app starts one repair run of `claude` (named `repair` in errors and in `agent-repair.log`): a short prompt the app builds from the validator's error text, asking it to fix only the errors named in the files named in `./out` and stop. It has the same permissions and flags as a Phase, `--max-budget-usd` set to what is left of the pool, and a time slot of 5 minutes that is extra, outside the 90 minutes of the Phases. Then the validators run again. If they fail again, if the repair run fails or is stopped by the limit, the Scan ends with the error that names the check Phase and the validator's words, and the work folder stays. With nothing left in the pool the repair run does not start and the Scan ends with the cap-reached error. A Scan gets one repair at most, and the validators do not run after the report Phase. The last line of the log it sends is one object with the cost, turns, duration and token counts summed over the Phases and the repair run.

A job with no `phasePrompts` (an older engine) is one run of `claude` on the single prompt, for up to 40 minutes. It stops at the same cap through `--max-budget-usd`. A job with no `profileCapUsd` (an older Worker) uses the budget it sends. When the limit is hit and the audit had already written `REPORT.md`, the files are sent and the Scan ends as a Partial Scan; otherwise the Scan ends with an error that says the cap was reached.

The Rust tests (`cargo test --workspace` in this folder) run a Scan after the clone against a stub `claude` and `node`, in the core, on a plain tokio runtime, and run the debug `elise-runner` as a process against a stub engine with `ELISE_RUNNER_HOME` set to a temp folder, so no test touches a keychain.

The runner status is one of `unpaired`, `revoked`, `offline` or `connected`. The activity is `idle`, `running` or `finished`.

## Run it

```bash
pnpm --filter elise-runner-cli app:dev     # tauri dev
pnpm --filter elise-runner-cli app:build   # tauri build
pnpm --filter elise-runner-cli check       # tsc --noEmit, then cargo test --workspace
```

## The headless Runner

`elise-runner` does what the desktop app does without a window, on macOS and Linux. Build it with `cargo build -p elise-runner-cli` (or `--release`).

```bash
elise-runner pair <code> [--yes]        # show the account and Runner name, ask y/N, save the token
elise-runner pair <code> --print-token  # print the token once for ELISE_RUNNER_TOKEN, save nothing
elise-runner status                     # unpaired, connected, revoked or offline, and the token store
elise-runner run                        # claim and run Scans until stopped
elise-runner run --once                 # claim at most one Scan, run and report it, exit (6: nothing to claim)
elise-runner unpair                     # Elise drops the token, then it is forgotten
```

`run` runs a Scan exactly as the desktop app does, through the core. The `full` Skill is built into the binary (`cli/build.rs` embeds `apps/elise-engine-api/skills/security-audit/`, the folder the desktop bundle copies), so the one file is all you install: before each Scan it is written to an owner-only temp folder of the run's own, which the core copies into the work folder and runs the validators from. `claude` and `node` are found as the desktop app finds them (`cli/src/tools.rs`); a missing one fails the Scan with an error naming it. It logs one plain line per step on standard output, each starting `[owner/name scanId]`: claimed, each Phase started and ended with what it spent and what is left of the Pool, repair started, result sent or not, and how the Scan ended. A succeeded Scan's work folder is removed once its result is sent; a failed one is kept and its path is on the last line. When Elise rejects the token, the program forgets it and exits with 4. The agent never gets `ELISE_RUNNER_TOKEN` (the core removes it from its environment) and its settings deny reading `/proc`, for the desktop app too.

Pairing a Runner that already holds a token saves the new one, then revokes the old one. The token store is `ELISE_RUNNER_TOKEN` if set (read only: `pair` and `unpair` refuse it), else the keychain under `com.eliselab.runner.headless` (the desktop app uses `com.eliselab.runner`, so the two are separate Runners), else an owner-only file in the config folder. A debug build reads `ELISE_RUNNER_HOME` (the token file goes there, the keychain is never touched, and `claude` and `node` are looked for on PATH only, so a test's stubs are the ones found) and `ELISE_ENGINE_URL`; a release build ignores both. Exit codes: 0 success (`status`: connected), 1 error, 2 usage, 3 unpaired, 4 revoked, 5 offline, 6 `run --once` with nothing to claim. `elise-runner --help` lists them.

You need a Rust toolchain for `app:dev`, `app:build` and `check`. `pnpm check:apps` and the pre-commit check run `check` for this folder, so a commit that touches it runs the Rust tests.
