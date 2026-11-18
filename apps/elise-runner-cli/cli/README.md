# elise-runner (the headless Runner)

`elise-runner` is a command-line program that runs Scans started in Elise on this computer, with no window. Pair it with a one-time code, start it, and leave it running on a server, a build machine or a terminal-only box. It claims the Scans that are started for it in the dashboard, runs them, and logs what it does to standard output.

It is a Runner like the desktop app (the folder above): both run Scans through one shared core, `core/` (`elise-runner-core`), so a Scan behaves the same whichever runs it. Its rules are in `docs/adr/0006-full-worker-and-phase-budget.md`, under "Runner Scans". To Elise the two are two Runners. On one computer each is paired with its own code and holds its own token, so neither reads or changes the other's, and each runs one Scan at a time. The headless Runner shows in the Runners list in Elise like any other Runner, and removing it there stops it claiming Scans.

It supports macOS and Linux. Windows is not supported.

## What you need

- A Rust toolchain to build it: `cargo build -p elise-runner-cli --release` in `apps/elise-runner-cli` (the binary is `target/release/elise-runner`). The `full` Skill is built into the binary, so that one file is all you install.
- Claude Code (`claude`) installed and signed in, as the user the Runner runs as. The Runner uses that login.
- Node.js (`node`). The Skill's validators run on it.
- A pairing code. Add a Runner in Elise to get one. A code works once and expires after 10 minutes.

`claude` and `node` are found the way the desktop app finds them. A Scan fails with an error that names the one it could not find.

## Commands

```
elise-runner pair <code> [--yes] [--print-token]
elise-runner status
elise-runner run [--once]
elise-runner unpair
elise-runner --help | --version
```

- `pair <code>` shows the Account name and the Runner name the code belongs to and asks `y/N`. On yes it saves the token. On no it revokes the token Elise issued, so none is left. `--yes` accepts without asking, for a script. If this Runner already holds a token, the new one is saved first and then the old one is revoked; if that revoke cannot reach Elise, the program says so and names the old Runner, so an admin can remove it in Elise.
- `pair <code> --print-token` enrolls and confirms as usual, then prints the token once on standard output and saves nothing. See "In a container".
- `status` says whether this Runner is unpaired, connected (with its name and Account), revoked or offline, and names the token store in use.
- `run` claims and runs Scans until you stop it.
- `run --once` claims at most one Scan, runs it, reports it and exits. With nothing to claim it exits at once with 6.
- `unpair` tells Elise to drop the token, then forgets it.

The program never prints the token in its log, in `status` or in an error. `pair --print-token` is the one exception, because you ask for it.

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | success; `status`: connected |
| 1 | an error (including a Scan that failed under `run --once`) |
| 2 | bad command-line usage |
| 3 | unpaired |
| 4 | revoked (Elise rejected the token) |
| 5 | offline (Elise could not be reached) |
| 6 | `run --once`: nothing to claim |

When Elise rejects the token during `run` (an admin removed the Runner), the program forgets the token, says so and exits with 4. Pair again with a new code.

## Where the token is kept

In this order:

1. `ELISE_RUNNER_TOKEN`, if set. It is read only: `pair` and `unpair` refuse to manage a token that came from it, and say so.
2. The system keychain (macOS Keychain, or a Secret Service on Linux), under the service name `com.eliselab.runner.headless`. The desktop app uses `com.eliselab.runner`, which is why the two are separate Runners.
3. When the computer has no keychain service, as on many Linux servers, a file in your config folder (`~/.config/elise-runner/token` on Linux), created readable by you only.

`status` names the store in use.

## What a run does

`run` runs a Scan as the desktop app does: clone, the four Phases on one Pool, the validators, one repair run if they fail, and upload. It logs one plain line per step on standard output, each starting `[owner/name scanId]`: claimed, each Phase started and ended with what it spent and what is left of the Pool, repair started, result sent or not, and how the Scan ended. The lines are plain so that systemd, Docker or a CI log can capture them.

A Scan uses your Claude login but not your Claude Code settings. It runs under its own settings and tool allowlist and never reads or changes your `~/.claude` folder. The agent does not get `ELISE_RUNNER_TOKEN`, and on Linux its settings deny reading `/proc`, so a hostile repository cannot make it copy the token into a report.

A succeeded Scan's work folder is removed once its result is sent. A failed Scan's is kept and its path is printed on the last line, with the agent's log and the files of the Phases that finished.

Ctrl-C (`SIGINT`) or `SIGTERM` with no Scan running exits at once with 0. During a Scan it stops the running `claude`, reports the Scan to Elise as failed with a reason that says the Runner was stopped, keeps the work folder and exits with 1. Signals after the first are ignored until the result is sent.

## Under a service manager

Run `elise-runner run` as the user that is signed in to Claude Code, as a long-running service. A stop signal (`SIGTERM`, what systemd sends) ends a running Scan as described above, so give the service enough stop time to send that result. Pair once by hand first (`elise-runner pair <code>`); with no keychain service the token is then in the config file of that user. For a build job or a timer, use `elise-runner run --once` and read the exit code: 0 a Scan ran and succeeded, 1 it failed, 6 there was nothing to claim.

## In a container

Pair once outside the container, then give the token to the container as a secret:

```bash
elise-runner pair <code> --print-token    # the token on standard output, a warning on standard error
docker run -e ELISE_RUNNER_TOKEN ... your-image elise-runner run
```

The token is a credential that lasts until the Runner is removed in Elise. Copies stay wherever it is pasted (shell history, CI variables, container settings), so keep it as you would a password. The image needs the `elise-runner` binary, `claude` signed in, and `node`. This repo ships no Docker image or unit file.

## Developing

A debug build reads `ELISE_RUNNER_HOME` (the token file goes in that folder, the keychain is never touched, and `claude` and `node` are looked for on PATH only) and `ELISE_ENGINE_URL`. A release build ignores both and talks only to the production API.

| Path | What it is |
| --- | --- |
| `src/args.rs` | The command line and the help text. |
| `src/store.rs` | Which token store a run uses. |
| `src/commands.rs` | One function per command, and the log of `run`. |
| `src/tools.rs` | The built-in Skill, `claude` and `node`. |
| `tests/` | Process tests: the debug `elise-runner` run against a stub engine. |

`elise-runner --help` is the source for the commands and exit codes above. Change them together.
