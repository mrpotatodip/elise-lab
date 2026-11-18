# elise-runner-cli

Elise Runner is a small desktop app (Tauri 2, Rust and TypeScript) that runs a scan on your own computer. You pair it with an Elise account using a one-time code. When someone starts a scan and picks this computer, the app clones the repo, runs `claude` on it locally, and sends the report back to Elise.

## What you need

- Claude Code installed and signed in on the computer. The app looks for `claude` in the usual places, then asks a login shell.
- The app kept open while a scan runs.
- A pairing code. Add a runner in Elise to get one. A code works once and expires after 10 minutes. After a code works, the app names the account and waits: nothing is saved, and no scan can run, until you press Connect.

## How it is built

The page never holds the API token. Rust keeps it in the system keychain and makes every call to Elise. The page asks Rust through Tauri commands in `src/api.ts` and draws what comes back.

The folder is one Cargo workspace (`Cargo.toml`, one `Cargo.lock`, one `target`). Everything a Runner does apart from drawing a window is in the core crate, `elise-runner-core`, which has no Tauri dependency. The desktop app is a thin shell over it: window, tray and commands. It tells the core where `claude`, `node` and the bundled skills are (`Tools`, from the app's resource folder), and turns the core's events (claimed, Phase started and ended with its cost and what is left of the pool, repair started, result sent, ended) into its activity.

| Path | What it is |
| --- | --- |
| `src/` | The page: `main.ts`, `views.ts`, `api.ts` (the Tauri commands), `copy.ts` (every string the user reads). |
| `core/src/pairing.rs` | Enroll a code, accept or decline it, the Runner's status, unpairing. |
| `core/src/store.rs` | Where the token is kept: the keychain, under a service name the program picks. |
| `core/src/scan.rs` | The work loop: claim, clone, run `claude` with a fixed tool allowlist, validate the output, upload, and the events it reports. |
| `src-tauri/src/lib.rs` | The desktop app: the commands, the pending pairing, the activity, the tray. |

A scan uses your Claude login but not your Claude Code settings. The app writes its own settings file and the audit skill into the scan's work folder and tells `claude` to load only that (`--setting-sources project`), so an allow rule you keep for daily work, such as `curl`, cannot widen what the agent may do. Your `~/.claude` folder is neither read nor changed.

A job says which audit to run (`lite` or `full`). A full job that carries `phasePrompts` runs the four Phases (recon, hunt, check, report) as four runs of `claude`, in order, each on its own prompt and with the cloud's time slot (10, 45, 25 and 10 minutes). They spend one pool: the lower of the job's `profileCapUsd` and the Runner's own ceiling, less what the earlier Phases reported in their results, passed to each run as `--max-budget-usd`. A Phase that finds nothing left does not start, and a Phase the limit stops ends the Scan with an error that names it; the app never makes such a Scan a Partial Scan. A Phase that fails names itself in the error and the work folder stays, with the earlier Phases' files in it. The app runs the audit skill's validators after the check Phase. If one fails, the app starts one repair run of `claude` (named `repair` in errors and in `agent-repair.log`): a short prompt the app builds from the validator's error text, asking it to fix only the errors named in the files named in `./out` and stop. It has the same permissions and flags as a Phase, `--max-budget-usd` set to what is left of the pool, and a time slot of 5 minutes that is extra, outside the 90 minutes of the Phases. Then the validators run again. If they fail again, if the repair run fails or is stopped by the limit, the Scan ends with the error that names the check Phase and the validator's words, and the work folder stays. With nothing left in the pool the repair run does not start and the Scan ends with the cap-reached error. A Scan gets one repair at most, and the validators do not run after the report Phase. The last line of the log it sends is one object with the cost, turns, duration and token counts summed over the Phases and the repair run.

A job with no `phasePrompts` (an older engine) is one run of `claude` on the single prompt, for up to 40 minutes. It stops at the same cap through `--max-budget-usd`. A job with no `profileCapUsd` (an older Worker) uses the budget it sends. When the limit is hit and the audit had already written `REPORT.md`, the files are sent and the Scan ends as a Partial Scan; otherwise the Scan ends with an error that says the cap was reached.

The Rust tests (`cargo test --workspace` in this folder) run a Scan after the clone against a stub `claude` and `node`, in the core, on a plain tokio runtime.

The runner status is one of `unpaired`, `revoked`, `offline` or `connected`. The activity is `idle`, `running` or `finished`.

## Run it

```bash
pnpm --filter elise-runner-cli app:dev     # tauri dev
pnpm --filter elise-runner-cli app:build   # tauri build
pnpm --filter elise-runner-cli check       # tsc --noEmit, then cargo test --workspace
```

You need a Rust toolchain for `app:dev`, `app:build` and `check`. `pnpm check:apps` and the pre-commit check run `check` for this folder, so a commit that touches it runs the Rust tests.
